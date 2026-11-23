import type { Color } from '../../../shared/game/types';
import { unconsumed, type StateBatch } from './batches';

/** Text of the toast shown to the player whose turn was lost to a third 1 or 6 in a row (house rule `tripleBonusForfeit`). */
export const FORFEIT_TOAST_TEXT = 'Mất lượt - Do tung 1 hoặc 6 ba lần liên tiếp';

/** How long the toast stays, fade-out included. */
export const FORFEIT_TOAST_MS = 2000;

/**
 * How many times `color` lost a turn to a third 1 or 6 in a row in the batches not yet consumed. Only the
 * player's own forfeits count: other players' (and CPUs') are not announced.
 */
export function forfeitsAfter(queue: StateBatch[], consumedSeq: number | null, color: Color | null): number {
  if (color === null) return 0;
  let count = 0;
  for (const { events } of unconsumed(queue, consumedSeq)) {
    for (const e of events) if (e.type === 'rolled' && e.forfeit && e.color === color) count++;
  }
  return count;
}
