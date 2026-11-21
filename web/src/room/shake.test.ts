import { describe, expect, it } from 'vitest';
import { createShakeDetector } from './shake';

const still = { x: 0, y: 0, z: 9.8 };
const jolt = { x: 18, y: -17, z: 9.8 };

describe('createShakeDetector', () => {
  it('fires on a jolt across two axes, not on a one-axis tilt or small movement', () => {
    const detect = createShakeDetector(15, 1000);
    expect(detect(still, 0)).toBe(false);
    expect(detect({ x: 20, y: 0, z: 9.8 }, 10)).toBe(false);
    expect(detect({ x: 26, y: 5, z: 12 }, 20)).toBe(false);
    expect(detect({ x: 0, y: -14, z: -8 }, 30)).toBe(true);
  });

  it('fires once per shake: jolts keep restarting the quiet period, a later shake fires again', () => {
    const detect = createShakeDetector(15, 1000);
    detect(still, 0);
    expect(detect(jolt, 100)).toBe(true);
    expect(detect(still, 200)).toBe(false);
    expect(detect(jolt, 900)).toBe(false);
    // Coming back to rest 1.1 s after the first jolt is still the same shake.
    expect(detect(still, 1100)).toBe(false);
    expect(detect(jolt, 2200)).toBe(true);
  });
});
