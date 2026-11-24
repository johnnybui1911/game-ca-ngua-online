import { describe, expect, it } from 'vitest';
import { GAME_OVER_CODE } from '../../../shared/protocol';
import { isSilentActionError } from './action-error';

describe('isSilentActionError', () => {
  it('is silent for a tap after the match finished', () => {
    expect(isSilentActionError(GAME_OVER_CODE)).toBe(true);
  });

  it('still shows every other action error', () => {
    for (const code of ['bad_state', 'not_your_turn', 'bad_phase', 'paused']) expect(isSilentActionError(code)).toBe(false);
  });
});
