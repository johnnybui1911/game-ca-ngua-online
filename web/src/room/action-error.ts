import { GAME_OVER_CODE } from '../../../shared/protocol';

/** Action errors that need no toast: a tap landing just after the finish, when the HUD already says the match is over. */
export function isSilentActionError(code: string): boolean {
  return code === GAME_OVER_CODE;
}
