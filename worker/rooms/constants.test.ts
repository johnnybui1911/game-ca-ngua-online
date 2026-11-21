import { describe, expect, it } from 'vitest';
import { NORMAL_ACTION_SECONDS, QUICK_SEGMENT_SECONDS } from '../../shared/game/pacing';
import type { Env } from '../env';
import { timingsFor } from './constants';

describe('timings', () => {
  it('the pacing model uses the pauses the server applies', () => {
    const t = timingsFor({} as Env);
    expect(NORMAL_ACTION_SECONDS * 1000).toBe(t.cpuDelayMs);
    expect(QUICK_SEGMENT_SECONDS * 1000).toBe(t.quickSegmentMs);
  });

  it('a default room keeps 30 s per action in normal mode', () => {
    const t = timingsFor({} as Env);
    expect(30 * t.turnUnitMs).toBe(30_000);
  });
});
