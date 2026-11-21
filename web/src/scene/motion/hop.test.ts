import { describe, expect, it } from 'vitest';
import { LEAN, SQUASH, STRETCH, crouchLean, crouchStretch, hopEnergy, hopLean, hopStretch, settleStretch } from './hop';

const samples = Array.from({ length: 201 }, (_, i) => i / 200);

describe('hop body language', () => {
  it('squashes on the ground and stretches in the air', () => {
    expect(hopStretch(0, 1)).toBeCloseTo(1 - SQUASH, 12);
    expect(hopStretch(1, 1)).toBeCloseTo(1 - SQUASH, 12);
    const tallest = Math.max(...samples.map((u) => hopStretch(u, 1)));
    expect(tallest).toBeGreaterThan(1.05);
    expect(tallest).toBeLessThanOrEqual(1 + STRETCH);
    // Taller right after take-off than at the top of the hop.
    expect(hopStretch(0.2, 1)).toBeGreaterThan(hopStretch(0.5, 1));
    expect(hopStretch(0.5, 1)).toBeGreaterThan(1);
  });

  it('leans into the hop on the way up and is upright on the ground', () => {
    expect(hopLean(0, 1)).toBeCloseTo(0, 12);
    expect(hopLean(1, 1)).toBeCloseTo(0, 12);
    expect(hopLean(0.3, 1)).toBeGreaterThan(0.1);
    for (const u of samples) expect(Math.abs(hopLean(u, 1))).toBeLessThanOrEqual(LEAN);
  });

  it('joins crouch, hops and settle without a jump in height', () => {
    for (const energy of [0.45, 1]) {
      expect(crouchStretch(0, energy)).toBe(1);
      expect(crouchStretch(1, energy)).toBeCloseTo(hopStretch(0, energy), 12);
      expect(hopStretch(1, energy)).toBeCloseTo(hopStretch(0, energy), 12);
      expect(settleStretch(0, energy)).toBeCloseTo(hopStretch(1, energy), 12);
      expect(settleStretch(1, energy)).toBe(1);
    }
    expect(crouchLean(0, 1)).toBeCloseTo(0, 12);
    expect(crouchLean(1, 1)).toBeCloseTo(0, 12);
    expect(crouchLean(0.5, 1)).toBeLessThan(0);
  });

  it('settles by overshooting its rest height once before coming to rest', () => {
    const values = samples.map((u) => settleStretch(u, 1));
    expect(Math.max(...values)).toBeGreaterThan(1.01);
    expect(Math.min(...values)).toBeCloseTo(1 - SQUASH, 12);
  });

  it('shrinks the gestures of compressed hops, within bounds', () => {
    expect(hopEnergy(0.16)).toBe(1);
    expect(hopEnergy(0.12)).toBe(1);
    expect(hopEnergy(0.06)).toBeCloseTo(0.5, 12);
    expect(hopEnergy(0.01)).toBe(0.45);
    expect(hopStretch(0, 0.5)).toBeCloseTo(1 - SQUASH / 2, 12);
  });
});
