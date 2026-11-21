import { describe, expect, it } from 'vitest';
import { FLICKER_AMPLITUDE, fadeLevel, flicker, lanternLevel, motionScale, storedMotionReduced } from './motion';

describe('motion setting', () => {
  it('moves by default', () => {
    expect(motionScale(false, null)).toBe(1);
  });

  it('holds still when the system asks for reduced motion, whatever is stored', () => {
    expect(motionScale(true, null)).toBe(0);
    expect(motionScale(true, 'full')).toBe(0);
  });

  it('holds still when the stored setting asks for less motion', () => {
    for (const stored of ['reduced', '"reduced"', 'off', '{"level":"reduced"}', '{"reduced":true}', 'false']) {
      expect(storedMotionReduced(stored), stored).toBe(true);
      expect(motionScale(false, stored), stored).toBe(0);
    }
  });

  it('treats a full or unreadable setting as no objection', () => {
    for (const stored of ['full', '"full"', '{"level":"full"}', '{"reduced":false}', 'true', '', '{broken']) {
      expect(storedMotionReduced(stored), stored).toBe(false);
    }
  });
});

describe('lantern flicker', () => {
  it('stays inside its amplitude and actually moves', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 4000; i++) {
      const f = flicker(i * 0.05, 3);
      expect(Math.abs(f)).toBeLessThanOrEqual(1);
      const level = lanternLevel(i * 0.05, 3, 1);
      min = Math.min(min, level);
      max = Math.max(max, level);
    }
    expect(min).toBeGreaterThanOrEqual(1 - FLICKER_AMPLITUDE);
    expect(max).toBeLessThanOrEqual(1 + FLICKER_AMPLITUDE);
    expect(max - min).toBeGreaterThan(FLICKER_AMPLITUDE);
  });

  it('is steady without motion', () => {
    for (const t of [0, 0.7, 13.2, 400]) expect(lanternLevel(t, 5, 0)).toBe(1);
  });

  it('gives neighbouring lanterns different phases', () => {
    expect(flicker(2, 0)).not.toBeCloseTo(flicker(2, 1), 2);
  });
});

describe('fade in', () => {
  it('runs from dark to full once and stays there', () => {
    expect(fadeLevel(-1, 2)).toBe(0);
    expect(fadeLevel(0, 2)).toBe(0);
    expect(fadeLevel(1, 2)).toBeCloseTo(0.5);
    expect(fadeLevel(2, 2)).toBe(1);
    expect(fadeLevel(50, 2)).toBe(1);
  });
});
