import { describe, expect, it } from 'vitest';
import {
  KICK_FX_SECONDS,
  ORBITS,
  backPuffs,
  isBackPuff,
  makePuffPose,
  makeStarPose,
  orbitPresence,
  puffAt,
  puffSeeds,
  smokeOpacity,
  starAt,
} from './kick-smoke';

describe('smokeOpacity', () => {
  it('is clear before contact and after the effect, thick early, then thins monotonically', () => {
    expect(smokeOpacity(0)).toBe(0);
    expect(smokeOpacity(KICK_FX_SECONDS)).toBe(0);
    const thick = smokeOpacity(0.1);
    expect(thick).toBeGreaterThan(0.9);
    let last = thick;
    for (let t = 0.3; t < KICK_FX_SECONDS; t += 0.1) {
      const o = smokeOpacity(t);
      expect(o).toBeLessThanOrEqual(last + 1e-9);
      last = o;
    }
  });
});

describe('puffAt', () => {
  const count = 32;
  const seeds = puffSeeds(count);

  it('places the same kick identically every time', () => {
    const a = puffAt(seeds, 5, count, 0.4, makePuffPose());
    const b = puffAt(puffSeeds(count), 5, count, 0.4, makePuffPose());
    expect(a).toEqual(b);
  });

  it('keeps the ground skirt low and the plume rising', () => {
    const skirt = puffAt(seeds, 0, count, 0.6, makePuffPose());
    const plume = puffAt(seeds, Math.floor(count * 0.5), count, 0.6, makePuffPose());
    expect(skirt.y).toBeLessThan(0.3);
    expect(plume.y).toBeGreaterThan(skirt.y);
  });

  it('swells and spreads from the contact point, then slows to a stop', () => {
    const early = puffAt(seeds, 0, count, 0.02, makePuffPose());
    const late = puffAt(seeds, 0, count, 0.8, makePuffPose());
    expect(Math.hypot(late.x, late.z)).toBeGreaterThan(Math.hypot(early.x, early.z));
    expect(late.sx).toBeGreaterThan(early.sx);
    const a = puffAt(seeds, 0, count, 1.0, makePuffPose());
    const b = puffAt(seeds, 0, count, 1.1, makePuffPose());
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.05);
  });

  it('turns the dark puffs back and behind, and greys the rest as the smoke ages', () => {
    const back = backPuffs(count);
    expect(back).toBeGreaterThan(0);
    const dark = puffAt(seeds, count - 1, count, 0.3, makePuffPose());
    expect(isBackPuff(count - 1, count)).toBe(true);
    expect(isBackPuff(0, count)).toBe(false);
    expect(dark.shade).toBe(1);
    expect(dark.z).toBeLessThan(-0.3);
    const young = puffAt(seeds, 0, count, 0.05, makePuffPose()).shade;
    const old = puffAt(seeds, 0, count, 1.1, makePuffPose()).shade;
    expect(old).toBeGreaterThan(young);
    expect(old).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('has no dark puffs in a budget too small for them', () => {
    expect(backPuffs(2)).toBe(0);
    expect(backPuffs(0)).toBe(0);
  });
});

describe('orbits', () => {
  it('pops the rings in fast, holds them, and clears them at the end', () => {
    expect(orbitPresence(0)).toBe(0);
    expect(orbitPresence(0.2)).toBe(1);
    expect(orbitPresence(0.8)).toBe(1);
    expect(orbitPresence(1.1)).toBeLessThan(0.5);
    expect(orbitPresence(KICK_FX_SECONDS)).toBe(0);
  });

  it('draws stars at the front of an ellipse larger than at its back, and spaces them evenly', () => {
    const orbit = { ...ORBITS[0]!, spin: 0, stars: 4, tilt: 0 };
    const sizes = [0, 1, 2, 3].map((i) => starAt(orbit, i, 0.5, makeStarPose()));
    // angle 0 is the right end, angle π/2 the front (+z), π the left end, 3π/2 the back.
    expect(sizes[1]!.z).toBeGreaterThan(0);
    expect(sizes[3]!.z).toBeLessThan(0);
    expect(sizes[1]!.scale).toBeGreaterThan(sizes[3]!.scale);
    expect(sizes[2]!.x).toBeLessThan(orbit.cx);
    expect(sizes[0]!.x).toBeGreaterThan(orbit.cx);
  });

  it('keeps every star on its ellipse once the rings have popped in', () => {
    const orbit = ORBITS[1]!;
    for (let i = 0; i < orbit.stars; i++) {
      const p = starAt(orbit, i, 0.5, makeStarPose());
      const dx = p.x - orbit.cx;
      const dy = p.y - orbit.cy;
      // Undo the tilt to get the position in the ellipse's own frame.
      const lx = dx * Math.cos(orbit.tilt) + dy * Math.sin(orbit.tilt);
      expect((lx / orbit.rx) ** 2 + (p.z / orbit.rz) ** 2).toBeCloseTo(1, 6);
    }
  });
});
