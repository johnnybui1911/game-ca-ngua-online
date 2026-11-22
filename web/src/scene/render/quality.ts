/**
 * Quality tiers of the 3D board: what each tier costs, which tier a device starts on,
 * and how the tier moves while the frame rate is being measured. Pure logic, no DOM or three.js.
 */

export type QualityTier = 'low' | 'medium' | 'high';

/** Cheapest first. */
export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];

export type Antialiasing = 'none' | 'smaa' | 'msaa';

export interface QualitySettings {
  /** Upper bound of the canvas pixel ratio. */
  dprCap: number;
  /** Whether the key light casts shadows. */
  shadows: boolean;
  /** Side of the key light's shadow map, in texels. */
  shadowMapSize: number;
  /** Bloom, antialiasing and vignette run in a post-processing chain. */
  postprocessing: boolean;
  bloom: boolean;
  antialiasing: Antialiasing;
  /** Cube face size of the generated environment map; 0 means no environment lighting. */
  environmentResolution: number;
  /** How many particles decorative effects may keep alive at once. */
  particleBudget: number;
}

const SETTINGS: Record<QualityTier, QualitySettings> = {
  high: {
    dprCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    postprocessing: true,
    bloom: true,
    antialiasing: 'msaa',
    environmentResolution: 256,
    particleBudget: 400,
  },
  medium: {
    dprCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    postprocessing: true,
    bloom: true,
    antialiasing: 'smaa',
    environmentResolution: 128,
    particleBudget: 160,
  },
  low: {
    dprCap: 1.25,
    shadows: false,
    shadowMapSize: 0,
    postprocessing: false,
    bloom: false,
    antialiasing: 'none',
    environmentResolution: 0,
    particleBudget: 40,
  },
};

/** Software rasterisers pay per pixel on the CPU, so they also lose the extra pixels and the particles. */
const SOFTWARE_SETTINGS: QualitySettings = { ...SETTINGS.low, dprCap: 1, particleBudget: 0 };

export function settingsFor(tier: QualityTier, software = false): QualitySettings {
  return software ? SOFTWARE_SETTINGS : SETTINGS[tier];
}

export function isQualityTier(value: unknown): value is QualityTier {
  return value === 'low' || value === 'medium' || value === 'high';
}

/** `?quality=low|medium|high` pins the tier (testing, screenshots, support). */
export function forcedTier(search: string): QualityTier | null {
  const value = new URLSearchParams(search).get('quality');
  return isQualityTier(value) ? value : null;
}

export interface DeviceSignals {
  /** WebGL runs on a software rasteriser (no GPU, remote desktop, headless browser). */
  software: boolean;
  /** Unmasked GPU renderer string, empty when the browser hides it. */
  renderer: string;
  devicePixelRatio: number;
  /** The primary pointer is a finger: phones and tablets. */
  coarsePointer: boolean;
  /** Logical CPU cores, when the browser reports them. */
  hardwareConcurrency: number | undefined;
}

/** GPUs that cannot hold the frame rate with shadows and post-processing. */
const WEAK_GPU = /mali-(4\d\d|t\d{3})|adreno \(tm\) [2-5]\d\d|powervr|videocore|intel\(r\) hd graphics( [2-5]\d{3}\b|(?! \d))/i;
/** Integrated and mobile GPUs: capable, but not of the full-resolution chain from the first frame. */
const MODEST_GPU = /intel|mali|adreno|apple a\d+ gpu/i;

function lower(a: QualityTier, b: QualityTier): QualityTier {
  return QUALITY_TIERS.indexOf(a) <= QUALITY_TIERS.indexOf(b) ? a : b;
}

/** The tier a device starts on, before any frame has been measured. */
export function initialTier(s: DeviceSignals): QualityTier {
  if (s.software) return 'low';
  const cores = s.hardwareConcurrency ?? 8;
  if (cores <= 2 || WEAK_GPU.test(s.renderer)) return 'low';
  // A touch device with a low-density screen is a budget phone or an old tablet.
  if (s.coarsePointer && s.devicePixelRatio < 2) return 'low';
  let tier: QualityTier = 'high';
  if (s.coarsePointer) tier = lower(tier, 'medium');
  if (cores <= 4) tier = lower(tier, 'medium');
  if (MODEST_GPU.test(s.renderer)) tier = lower(tier, 'medium');
  return tier;
}

/** Verdict of one frame-rate measurement window: room to spare, or falling behind. */
export type PerformanceSignal = 'incline' | 'decline';

/** Measurements are ignored this long after the start and after every tier change (shader compiles, resizes). */
export const SETTLE_MS = 4_000;
/** Consecutive good verdicts needed before a step up. */
export const STEP_UP_INCLINES = 4;
/** Minimum time on a tier before the first step up; doubles after every step down. */
export const STEP_UP_DWELL_MS = 20_000;
export const STEP_UP_DWELL_MAX_MS = 5 * 60_000;
/** A step down this soon after a step up proves the higher tier is too much: it is not tried again. */
export const RELAPSE_MS = 30_000;

export interface TierGovernor {
  readonly tier: QualityTier;
  /** Highest tier a step up may reach. */
  readonly ceiling: QualityTier;
  /** A forced tier or a software renderer never moves. */
  readonly locked: boolean;
  readonly changedAt: number;
  readonly lastStep: 'up' | 'down' | null;
  readonly inclines: number;
  readonly upDwellMs: number;
}

export function createGovernor(tier: QualityTier, now: number, locked = false): TierGovernor {
  return { tier, ceiling: 'high', locked, changedAt: now, lastStep: null, inclines: 0, upDwellMs: STEP_UP_DWELL_MS };
}

/**
 * Next governor state after one verdict. Steps down on the first bad verdict, steps up only
 * after a run of good ones and a growing wait, and gives a tier up for good once it failed
 * right after being tried. Returns the same object when nothing changed.
 */
export function governorStep(g: TierGovernor, signal: PerformanceSignal, now: number): TierGovernor {
  if (g.locked || now - g.changedAt < SETTLE_MS) return g;
  const index = QUALITY_TIERS.indexOf(g.tier);
  if (signal === 'decline') {
    const next = QUALITY_TIERS[index - 1];
    if (!next) return g.inclines === 0 ? g : { ...g, inclines: 0 };
    const relapse = g.lastStep === 'up' && now - g.changedAt < RELAPSE_MS;
    return {
      ...g,
      tier: next,
      ceiling: relapse ? next : g.ceiling,
      changedAt: now,
      lastStep: 'down',
      inclines: 0,
      upDwellMs: Math.min(STEP_UP_DWELL_MAX_MS, g.upDwellMs * 2),
    };
  }
  if (index >= QUALITY_TIERS.indexOf(g.ceiling)) return g;
  const inclines = g.inclines + 1;
  const next = QUALITY_TIERS[index + 1];
  if (!next || inclines < STEP_UP_INCLINES || now - g.changedAt < g.upDwellMs) return { ...g, inclines };
  return { ...g, tier: next, changedAt: now, lastStep: 'up', inclines: 0 };
}

/** How much the scene is allowed to draw: everything, a cheaper slow picture, or nothing. */
export type SceneActivity = 'full' | 'dimmed' | 'paused';

/** Frame rate of a dimmed scene. */
export const DIMMED_FPS = 30;
/** Pixel ratio cap of a dimmed scene. */
export const DIMMED_DPR = 1;

/** What the canvas actually does: a hidden tab draws nothing whatever was asked for. */
export function effectiveActivity(requested: SceneActivity, tabHidden: boolean): SceneActivity {
  return tabHidden ? 'paused' : requested;
}

/** Canvas pixel ratio range for a tier and activity. */
export function dprRange(settings: QualitySettings, activity: SceneActivity): [number, number] {
  const cap = activity === 'dimmed' ? Math.min(settings.dprCap, DIMMED_DPR) : settings.dprCap;
  return [Math.min(1, cap), cap];
}
