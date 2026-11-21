import { describe, expect, it } from 'vitest';
import { angleDelta, arc, dampedSpring, dampedWobble, easeOutCubic, lerpAngle, smoothstep } from './curves';

const samples = Array.from({ length: 101 }, (_, i) => i / 100);

describe('curves', () => {
  it('eases run from 0 to 1 without going back, and clamp outside the range', () => {
    for (const ease of [smoothstep, easeOutCubic]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(-2)).toBe(0);
      expect(ease(3)).toBe(1);
      for (let i = 1; i < samples.length; i++) expect(ease(samples[i]!)).toBeGreaterThanOrEqual(ease(samples[i - 1]!));
    }
    // Ease-out covers most of the way early; smoothstep is symmetric.
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.8);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 12);
  });

  it('arc is a symmetric hop: on the ground at both ends, apex 1 half way', () => {
    expect(arc(0)).toBe(0);
    expect(arc(1)).toBe(0);
    expect(arc(0.5)).toBe(1);
    for (const u of samples) {
      expect(arc(u)).toBeCloseTo(arc(1 - u), 12);
      expect(arc(u)).toBeLessThanOrEqual(1);
    }
  });

  it('turns the short way round', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2, 12);
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6, 12);
    expect(angleDelta(-3, 3)).toBeCloseTo(6 - 2 * Math.PI, 12);
    expect(angleDelta(0, 7 * Math.PI)).toBeCloseTo(Math.PI, 9);
    // Half way from 170° to -170° is 180°, not 0°.
    const mid = lerpAngle((170 * Math.PI) / 180, (-170 * Math.PI) / 180, 0.5);
    expect(Math.cos(mid)).toBeCloseTo(-1, 9);
    expect(lerpAngle(1, 2, 0)).toBe(1);
    expect(lerpAngle(1, 2, 1)).toBeCloseTo(2, 12);
  });

  it('a damped spring starts displaced, overshoots, stays inside its envelope and ends exactly at rest', () => {
    expect(dampedSpring(0, 1, 3)).toBe(1);
    expect(dampedSpring(1, 1, 3)).toBe(0);
    expect(dampedSpring(1.5, 1, 3)).toBe(0);
    let lowest = 1;
    for (const u of samples) {
      const v = dampedSpring(u, 1, 3);
      expect(Math.abs(v)).toBeLessThanOrEqual(Math.exp(-3 * u) + 1e-12);
      lowest = Math.min(lowest, v);
    }
    expect(lowest).toBeLessThan(-0.05);
    expect(Math.abs(dampedSpring(0.99, 1, 3))).toBeLessThan(0.001);
  });

  it('a damped wobble starts and ends at rest and swings both ways with a shrinking size', () => {
    expect(dampedWobble(0, 1.5, 3)).toBe(0);
    expect(dampedWobble(1, 1.5, 3)).toBe(0);
    const values = samples.map((u) => dampedWobble(u, 1.5, 3));
    const firstHalf = Math.max(...values.slice(0, 34).map(Math.abs));
    const lastHalf = Math.max(...values.slice(67).map(Math.abs));
    expect(Math.max(...values)).toBeGreaterThan(0.2);
    expect(Math.min(...values)).toBeLessThan(-0.05);
    expect(lastHalf).toBeLessThan(firstHalf / 4);
    samples.forEach((u, i) => expect(Math.abs(values[i]!)).toBeLessThanOrEqual(Math.exp(-3 * u)));
  });
});
