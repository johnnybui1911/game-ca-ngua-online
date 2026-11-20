import type { GameEvent } from '../../../shared/game/types';
import type { RoomSnapshot } from '../../../shared/protocol';

/** One server state message: the snapshot and the events that led to it. */
export interface StateBatch {
  room: RoomSnapshot;
  events: GameEvent[];
}

/** More than this many unconsumed batches means the scene would jump to the latest state anyway. */
export const MAX_BATCHES = 64;

/**
 * Queues an incoming batch behind the ones before it, ordered by `seq`. React may render once for
 * several messages, so nothing may be replaced: each consumer walks the queue by `seq`.
 * A batch older than the newest is dropped; one with the newest `seq` (a reconnect snapshot, or a
 * connection change that did not bump it) refreshes the snapshot but keeps the events already queued.
 */
export function appendBatch(queue: StateBatch[], next: StateBatch): StateBatch[] {
  const last = queue[queue.length - 1];
  if (last && last.room.code === next.room.code) {
    if (next.room.seq < last.room.seq) return queue;
    if (next.room.seq === last.room.seq) {
      return [...queue.slice(0, -1), { room: next.room, events: last.events.length > 0 ? last.events : next.events }];
    }
  }
  const out = [...queue, next];
  return out.length > MAX_BATCHES ? out.slice(out.length - MAX_BATCHES) : out;
}

/** Batches a consumer has not seen: all newer than `consumedSeq`, or only the newest when it has seen none. */
export function unconsumed(queue: StateBatch[], consumedSeq: number | null): StateBatch[] {
  if (consumedSeq === null) return queue.slice(-1);
  return queue.filter((b) => b.room.seq > consumedSeq);
}
