import type { Color, DiceValue } from '../../../shared/game/types';
import { unconsumed, type StateBatch } from './batches';

export interface LastRoll {
  color: Color;
  dice: DiceValue;
}

/**
 * The die to show after the batches not yet consumed: per batch the newest roll event, else the
 * roll still pending a move, else whatever was shown. Batches are applied in order, so a batch
 * without a roll never hides the one before it.
 */
export function lastRollAfter(prev: LastRoll | null, queue: StateBatch[], consumedSeq: number | null): LastRoll | null {
  let last = prev;
  for (const { room, events } of unconsumed(queue, consumedSeq)) {
    const rolled = [...events].reverse().find((e) => e.type === 'rolled');
    if (rolled?.type === 'rolled') last = { color: rolled.color, dice: rolled.dice };
    else if (room.game?.dice != null) last = { color: room.game.turn, dice: room.game.dice };
  }
  return last;
}
