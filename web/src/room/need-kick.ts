import { isLocked, legalHorsesFor } from '../../../shared/game/engine';
import type { Color } from '../../../shared/game/types';
import { unconsumed, type StateBatch } from './batches';

/**
 * Whether the hint "Cần đá 1 ngựa trước" applies to `color` after the batches not yet consumed: the player's
 * newest roll left no legal move only because their home column is locked (a horse stands on the gate and the
 * same roll would have been playable with the column open). It lasts until the player's next roll, or until
 * their column opens, and is left alone by other players' batches.
 */
export function needKickAfter(prev: boolean, queue: StateBatch[], consumedSeq: number | null, color: Color | null): boolean {
  if (color === null) return false;
  let hint = prev;
  for (const { room, events } of unconsumed(queue, consumedSeq)) {
    const game = room.game;
    if (!game) continue;
    const mine = [...events].reverse().find((e) => e.type === 'rolled' && e.color === color);
    if (mine?.type === 'rolled') {
      hint =
        mine.legalHorses.length === 0 &&
        isLocked(game, color) &&
        legalHorsesFor(game.horses, color, mine.dice, false).length > 0;
    }
    if (!isLocked(game, color)) hint = false;
  }
  return hint;
}
