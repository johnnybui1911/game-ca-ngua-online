import { describe, expect, it } from 'vitest';
import { DEFAULT_PACE, PACES } from '../../shared/game/pace';
import type { Env } from '../env';
import { timingsFor } from './constants';

describe('timings', () => {
  it('a real room paces by the default pace, a fast one by fixed pauses', () => {
    const t = timingsFor({} as Env);
    expect(t.pace).toBe(PACES[DEFAULT_PACE]);
    expect(t.cpuDelayMs).toBe(PACES[DEFAULT_PACE].normal.minSegmentPause * 1000);
    expect(t.quickSegmentMs).toBe(PACES[DEFAULT_PACE].quick.minSegmentPause * 1000);
    expect(timingsFor({ ROOM_FAST_TIMERS: '1' } as Env).pace).toBeNull();
  });

  it('a default room keeps 30 s per action in normal mode', () => {
    const t = timingsFor({} as Env);
    expect(30 * t.turnUnitMs).toBe(30_000);
  });
});
