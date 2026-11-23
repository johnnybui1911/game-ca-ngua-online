import type { Color } from '../../../shared/game/types';
import { unconsumed, type StateBatch } from './batches';

/**
 * Colour whose turn was just lost to a third 1 or 6 in a row (house rule `tripleBonusForfeit`), after the batches
 * not yet consumed; null when none. The notice lasts through the next colour's turn and goes when that turn ends.
 */
export function forfeitAfter(prev: Color | null, queue: StateBatch[], consumedSeq: number | null): Color | null {
  let shown = prev;
  for (const { events } of unconsumed(queue, consumedSeq)) {
    let actor: Color | null = null;
    for (const e of events) {
      if (e.type === 'rolled' || e.type === 'moved') actor = e.color;
      if (e.type === 'rolled' && e.forfeit) shown = e.color;
      else if (e.type === 'turn' && !e.extraRoll && actor !== null && actor !== shown) shown = null;
    }
  }
  return shown;
}
