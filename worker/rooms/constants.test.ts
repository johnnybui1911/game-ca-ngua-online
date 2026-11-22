import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { timingsFor } from './constants';

describe('timings', () => {
  it("a real room is timed by its pace, a fast one by fixed pauses", () => {
    expect(timingsFor({} as Env).paced).toBe(true);
    expect(timingsFor({ ROOM_FAST_TIMERS: '1' } as Env).paced).toBe(false);
  });

  it('a default room keeps 30 s per action in normal mode', () => {
    const t = timingsFor({} as Env);
    expect(30 * t.turnUnitMs).toBe(30_000);
  });
});
