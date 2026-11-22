import { describe, expect, it } from 'vitest';
import {
  QUALITY_TIERS,
  RELAPSE_MS,
  SETTLE_MS,
  STEP_UP_DWELL_MAX_MS,
  STEP_UP_DWELL_MS,
  STEP_UP_INCLINES,
  createGovernor,
  dprRange,
  effectiveActivity,
  forcedTier,
  governorStep,
  initialTier,
  settingsFor,
} from './quality';
import type { DeviceSignals, PerformanceSignal, TierGovernor } from './quality';

const DESKTOP: DeviceSignals = {
  software: false,
  renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  devicePixelRatio: 1,
  coarsePointer: false,
  hardwareConcurrency: 12,
};

describe('initialTier', () => {
  it('gives a desktop with a discrete GPU the high tier', () => {
    expect(initialTier(DESKTOP)).toBe('high');
    expect(initialTier({ ...DESKTOP, renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', devicePixelRatio: 2 })).toBe('high');
  });

  it('puts a software renderer on low whatever else the device reports', () => {
    expect(initialTier({ ...DESKTOP, software: true })).toBe('low');
  });

  it('starts phones and tablets on medium', () => {
    expect(initialTier({ ...DESKTOP, renderer: 'Apple GPU', coarsePointer: true, devicePixelRatio: 3, hardwareConcurrency: 6 })).toBe('medium');
  });

  it('starts integrated GPUs and four-core machines on medium', () => {
    expect(initialTier({ ...DESKTOP, renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' })).toBe('medium');
    expect(initialTier({ ...DESKTOP, hardwareConcurrency: 4 })).toBe('medium');
  });

  it('puts weak GPUs, two-core machines and low-density touch devices on low', () => {
    expect(initialTier({ ...DESKTOP, renderer: 'Mali-T830' })).toBe('low');
    expect(initialTier({ ...DESKTOP, renderer: 'Adreno (TM) 506' })).toBe('low');
    expect(initialTier({ ...DESKTOP, renderer: 'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)' })).toBe('low');
    expect(initialTier({ ...DESKTOP, hardwareConcurrency: 2 })).toBe('low');
    expect(initialTier({ ...DESKTOP, coarsePointer: true, devicePixelRatio: 1.5 })).toBe('low');
  });

  it('does not mistake a current mobile GPU for a weak one', () => {
    const phone = { ...DESKTOP, coarsePointer: true, devicePixelRatio: 2.6 };
    expect(initialTier({ ...phone, renderer: 'Adreno (TM) 740' })).toBe('medium');
    expect(initialTier({ ...phone, renderer: 'Mali-G78' })).toBe('medium');
  });

  it('treats an unreported core count as capable', () => {
    expect(initialTier({ ...DESKTOP, hardwareConcurrency: undefined })).toBe('high');
  });
});

describe('forcedTier', () => {
  it('reads a valid tier from the query string and ignores anything else', () => {
    expect(forcedTier('?quality=low')).toBe('low');
    expect(forcedTier('?seed=3&quality=medium')).toBe('medium');
    expect(forcedTier('?quality=ultra')).toBeNull();
    expect(forcedTier('')).toBeNull();
  });
});

describe('settingsFor', () => {
  it('never gets more expensive on a lower tier', () => {
    const [low, medium, high] = QUALITY_TIERS.map((t) => settingsFor(t));
    for (const [cheap, costly] of [[low!, medium!], [medium!, high!]] as const) {
      expect(cheap.dprCap).toBeLessThanOrEqual(costly.dprCap);
      expect(cheap.shadowMapSize).toBeLessThanOrEqual(costly.shadowMapSize);
      expect(cheap.environmentResolution).toBeLessThanOrEqual(costly.environmentResolution);
      expect(cheap.particleBudget).toBeLessThanOrEqual(costly.particleBudget);
    }
  });

  it('turns shadows and the whole post-processing chain off on low', () => {
    expect(settingsFor('low')).toMatchObject({ shadows: false, postprocessing: false, bloom: false, antialiasing: 'none', environmentResolution: 0 });
  });

  it('keeps a software renderer at pixel ratio 1 with no particles', () => {
    expect(settingsFor('low', true)).toMatchObject({ dprCap: 1, shadows: false, postprocessing: false, particleBudget: 0 });
  });
});

/** Feeds verdicts at the given times and returns the final state. */
function run(g: TierGovernor, verdicts: [PerformanceSignal, number][]): TierGovernor {
  return verdicts.reduce((state, [signal, at]) => governorStep(state, signal, at), g);
}

/** Enough good verdicts, ending at `until`, to satisfy the run length. */
function inclines(until: number): [PerformanceSignal, number][] {
  return Array.from({ length: STEP_UP_INCLINES }, (_, i) => ['incline', until - (STEP_UP_INCLINES - 1 - i) * 2500] as [PerformanceSignal, number]);
}

describe('governorStep', () => {
  it('steps down on the first bad verdict after settling', () => {
    const g = createGovernor('high', 0);
    expect(governorStep(g, 'decline', SETTLE_MS).tier).toBe('medium');
  });

  it('ignores verdicts while the scene settles after the start and after a change', () => {
    const g = createGovernor('high', 0);
    expect(governorStep(g, 'decline', SETTLE_MS - 1)).toBe(g);
    const down = governorStep(g, 'decline', 10_000);
    expect(governorStep(down, 'decline', 10_000 + SETTLE_MS - 1)).toBe(down);
    expect(governorStep(down, 'decline', 10_000 + SETTLE_MS).tier).toBe('low');
  });

  it('stays on low when low is still too slow', () => {
    const g = createGovernor('low', 0);
    expect(governorStep(g, 'decline', 60_000).tier).toBe('low');
  });

  it('never moves a locked tier', () => {
    const g = createGovernor('medium', 0, true);
    expect(run(g, [['decline', 10_000], ...inclines(600_000)])).toBe(g);
  });

  it('steps up only after a run of good verdicts and the dwell time', () => {
    const g = createGovernor('medium', 0);
    // Enough verdicts, too early.
    expect(run(g, inclines(STEP_UP_DWELL_MS - 1)).tier).toBe('medium');
    // Late enough, run too short.
    expect(run(g, inclines(STEP_UP_DWELL_MS + 10_000).slice(1)).tier).toBe('medium');
    expect(run(g, inclines(STEP_UP_DWELL_MS)).tier).toBe('high');
  });

  it('starts the run of good verdicts over after a bad one', () => {
    const g = run(createGovernor('low', 0), inclines(STEP_UP_DWELL_MS).slice(1));
    expect(g.inclines).toBe(STEP_UP_INCLINES - 1);
    const reset = governorStep(g, 'decline', STEP_UP_DWELL_MS + 1);
    expect(reset.inclines).toBe(0);
    expect(governorStep(reset, 'incline', STEP_UP_DWELL_MS + 2).tier).toBe('low');
  });

  it('does not step above high', () => {
    const g = createGovernor('high', 0);
    expect(run(g, inclines(600_000))).toBe(g);
  });

  it('gives a tier up for good when it fails right after being tried', () => {
    const up = run(createGovernor('medium', 0), inclines(STEP_UP_DWELL_MS));
    expect(up.tier).toBe('high');
    const back = governorStep(up, 'decline', up.changedAt + RELAPSE_MS - 1);
    expect(back).toMatchObject({ tier: 'medium', ceiling: 'medium' });
    expect(run(back, inclines(back.changedAt + STEP_UP_DWELL_MAX_MS * 2)).tier).toBe('medium');
  });

  it('may retry a tier that held for a while, after waiting twice as long', () => {
    const up = run(createGovernor('medium', 0), inclines(STEP_UP_DWELL_MS));
    const back = governorStep(up, 'decline', up.changedAt + RELAPSE_MS);
    expect(back).toMatchObject({ tier: 'medium', ceiling: 'high' });
    expect(run(back, inclines(back.changedAt + STEP_UP_DWELL_MS * 2 - 1)).tier).toBe('medium');
    expect(run(back, inclines(back.changedAt + STEP_UP_DWELL_MS * 2)).tier).toBe('high');
  });

  it('caps the wait before a retry', () => {
    let g = createGovernor('high', 0);
    let now = 0;
    for (let i = 0; i < 12; i++) {
      now += RELAPSE_MS + STEP_UP_DWELL_MAX_MS;
      g = governorStep(g, 'decline', now);
      g = run(g, inclines(now + STEP_UP_DWELL_MAX_MS));
      now += STEP_UP_DWELL_MAX_MS;
    }
    expect(g.upDwellMs).toBe(STEP_UP_DWELL_MAX_MS);
    expect(g.tier).toBe('high');
  });

  it('settles instead of flapping under alternating verdicts', () => {
    let g = createGovernor('high', 0);
    let changes = 0;
    for (let now = SETTLE_MS; now < 30 * 60_000; now += 2500) {
      const next = governorStep(g, Math.floor(now / 2500) % 2 === 0 ? 'incline' : 'decline', now);
      if (next.tier !== g.tier) changes++;
      g = next;
    }
    expect(g.tier).toBe('low');
    expect(changes).toBe(2);
  });
});

describe('activity', () => {
  it('pauses a hidden tab whatever was requested', () => {
    expect(effectiveActivity('full', true)).toBe('paused');
    expect(effectiveActivity('dimmed', true)).toBe('paused');
    expect(effectiveActivity('dimmed', false)).toBe('dimmed');
    expect(effectiveActivity('full', false)).toBe('full');
  });

  it('caps the pixel ratio by tier and lowers it while dimmed', () => {
    expect(dprRange(settingsFor('high'), 'full')).toEqual([1, 2]);
    expect(dprRange(settingsFor('medium'), 'full')).toEqual([1, 1.5]);
    expect(dprRange(settingsFor('high'), 'dimmed')).toEqual([1, 1]);
    expect(dprRange(settingsFor('low', true), 'full')).toEqual([1, 1]);
  });
});
