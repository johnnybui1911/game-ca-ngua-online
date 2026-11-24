import { describe, expect, it } from 'vitest';
import { createGame } from '../../../shared/game/engine';
import type { GameEvent } from '../../../shared/game/types';
import { DEFAULT_ROOM_SETTINGS, SEAT_COLORS, type RoomSnapshot } from '../../../shared/protocol';
import { appendBatch, MAX_BATCHES, unconsumed, type StateBatch } from './batches';

const ev = (n: number): GameEvent => ({ type: 'rolled', color: 0, dice: ((n % 6) + 1) as 1, legalHorses: [] });

function batch(seq: number, events: GameEvent[] = [], code = 'ABC234'): StateBatch {
  const room: RoomSnapshot = {
    code,
    name: 'x',
    visibility: 'private',
    hostId: 'u1',
    status: 'playing',
    seats: [],
    game: createGame(SEAT_COLORS[2]!),
    turnDeadline: null,
    allowTakeover: false,
    joinRequests: [],
    paused: false,
    cpuLevel: 'normal',
    settings: DEFAULT_ROOM_SETTINGS,
    seq,
  };
  return { room, events };
}

describe('appendBatch', () => {
  it('keeps every batch when several arrive before a render', () => {
    let q: StateBatch[] = [];
    q = appendBatch(q, batch(1, [ev(1)]));
    q = appendBatch(q, batch(2, [ev(2)]));
    q = appendBatch(q, batch(3, []));
    expect(q.map((b) => b.room.seq)).toEqual([1, 2, 3]);
    expect(q[1]?.events).toEqual([ev(2)]);
  });

  it('drops a batch older than the newest', () => {
    const q = appendBatch([batch(5, [ev(1)])], batch(4, [ev(2)]));
    expect(q.map((b) => b.room.seq)).toEqual([5]);
  });

  it('refreshes the snapshot of the same seq without losing its events', () => {
    const q = appendBatch([batch(5, [ev(1)])], batch(5, []));
    expect(q).toHaveLength(1);
    expect(q[0]?.events).toEqual([ev(1)]);
  });

  it('accepts a lower seq from another room and caps the queue', () => {
    expect(appendBatch([batch(9)], batch(1, [], 'ZZZ234'))).toHaveLength(2);
    let q: StateBatch[] = [];
    for (let i = 1; i <= MAX_BATCHES + 10; i++) q = appendBatch(q, batch(i));
    expect(q).toHaveLength(MAX_BATCHES);
    expect(q[q.length - 1]?.room.seq).toBe(MAX_BATCHES + 10);
  });
});

describe('unconsumed', () => {
  const q = [batch(3), batch(4), batch(5)];
  it('returns all newer batches in order, or only the newest for a fresh consumer', () => {
    expect(unconsumed(q, 3).map((b) => b.room.seq)).toEqual([4, 5]);
    expect(unconsumed(q, 5)).toEqual([]);
    expect(unconsumed(q, null).map((b) => b.room.seq)).toEqual([5]);
  });
});
