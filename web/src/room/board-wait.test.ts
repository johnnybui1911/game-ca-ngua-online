import { describe, expect, it } from 'vitest';
import { reportAfterExpiry, rollHeld } from './board-wait';

describe('roll gate', () => {
  it('holds the roll before the board has reported anything', () => {
    expect(rollHeld(null, 1, null)).toBe(true);
  });

  it('follows the board once it has reported', () => {
    expect(rollHeld(true, 1, null)).toBe(true);
    expect(rollHeld(false, 1, null)).toBe(false);
  });

  it('lets go when the wait for this state ran out, and holds again for the next state of a busy board', () => {
    expect(rollHeld(true, 4, 4)).toBe(false);
    expect(rollHeld(null, 4, 4)).toBe(false);
    expect(rollHeld(true, 5, 4)).toBe(true);
  });

  it('holds a board that never reports only once', () => {
    const report = reportAfterExpiry(null);
    expect(report).toBe(false);
    expect(rollHeld(report, 5, 4)).toBe(false);
  });

  it('keeps what a reporting board said when its wait runs out', () => {
    expect(reportAfterExpiry(true)).toBe(true);
    expect(reportAfterExpiry(false)).toBe(false);
  });
});
