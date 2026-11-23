import { describe, expect, it } from 'vitest';
import { formatGameTime, secondsLeft } from './countdown';

describe('secondsLeft', () => {
  it('is independent of the local clock once the offset is applied', () => {
    const serverNow = 1_000_000;
    const deadline = serverNow + 30_000;
    for (const skew of [0, 5 * 60_000, -7 * 60_000]) {
      const localAtArrival = serverNow + skew;
      const offset = serverNow - localAtArrival;
      expect(secondsLeft(deadline, localAtArrival, offset)).toBe(30);
      expect(secondsLeft(deadline, localAtArrival + 12_400, offset)).toBe(18);
    }
  });

  it('never goes below zero', () => {
    expect(secondsLeft(1_000, 5_000, 0)).toBe(0);
  });

  it('formats a whole-game clock without losing hours', () => {
    expect([0, 9, 61, 3600].map(formatGameTime)).toEqual(['0:00', '0:09', '1:01', '60:00']);
  });
});
