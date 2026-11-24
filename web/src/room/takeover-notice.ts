import type { StateBatch } from './batches';

/**
 * Notices for people who took a CPU's seat during the game, in the batches newer than `consumedSeq`: each such
 * batch is compared with the one before it in the queue, so a consumer that has seen nothing yet (a fresh mount
 * or reconnect, the newcomer included) announces nothing. The local player's own takeover is not announced.
 */
export function takeoversAfter(queue: StateBatch[], consumedSeq: number | null, myId: string): string[] {
  if (consumedSeq === null) return [];
  const out: string[] = [];
  for (let i = 1; i < queue.length; i++) {
    const prev = queue[i - 1];
    const next = queue[i];
    if (!prev || !next || next.room.seq <= consumedSeq || prev.room.code !== next.room.code) continue;
    next.room.seats.forEach((seat, s) => {
      const was = prev.room.seats[s]?.occupant;
      const now = seat.occupant;
      if (was?.kind === 'cpu' && now?.kind === 'human' && now.user.id !== myId) out.push(`${now.user.displayName} đã vào thay ${was.name}`);
    });
  }
  return out;
}
