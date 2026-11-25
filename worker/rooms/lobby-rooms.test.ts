import { describe, expect, it } from 'vitest';
import type { RoomSummary } from '../../shared/protocol';
import {
  consumeReservation,
  listRoom,
  mergeLegacyRooms,
  openRoomCount,
  playingElsewhere,
  publicRoomList,
  reserveCreate,
  type PendingCreates,
  type StoredRoom,
} from './lobby-rooms';

const room = (code: string, over: Partial<StoredRoom> & { status?: RoomSummary['status'] } = {}): StoredRoom => ({
  summary: { code, name: code, hostName: 'An', status: over.status ?? 'waiting', seatsTaken: 1, seatsTotal: 4 },
  visibility: over.visibility ?? 'public',
  hostId: over.hostId === undefined ? 'u1' : over.hostId,
  at: over.at ?? 0,
});

describe('open room cap', () => {
  it('counts only unfinished rooms the user hosts', () => {
    const rooms = {
      A: room('A'),
      B: room('B', { status: 'playing' }),
      C: room('C', { status: 'finished' }),
      D: room('D', { hostId: 'u2' }),
      E: room('E', { hostId: null }),
    };
    expect(openRoomCount(rooms, new Map(), 'u1', 0)).toBe(2);
  });

  it('lets a burst of creates reserve only up to the cap', () => {
    const pending: PendingCreates = new Map();
    const results = Array.from({ length: 5 }, () => reserveCreate({}, pending, 'u1', 0, 3, 1000));
    expect(results).toEqual([true, true, true, false, false]);
    expect(reserveCreate({}, pending, 'u2', 0, 3, 1000)).toBe(true);
  });

  it('counts reservations and listed rooms together', () => {
    const pending: PendingCreates = new Map();
    const rooms = { A: room('A'), B: room('B') };
    expect(reserveCreate(rooms, pending, 'u1', 0, 3, 1000)).toBe(true);
    expect(reserveCreate(rooms, pending, 'u1', 0, 3, 1000)).toBe(false);
  });

  it('frees a reservation at its expiry', () => {
    const pending: PendingCreates = new Map();
    reserveCreate({}, pending, 'u1', 0, 1, 1000);
    expect(reserveCreate({}, pending, 'u1', 999, 1, 1000)).toBe(false);
    expect(reserveCreate({}, pending, 'u1', 1000, 1, 1000)).toBe(true);
  });

  it('turns a reservation into the listed room instead of counting both', () => {
    const pending: PendingCreates = new Map();
    reserveCreate({}, pending, 'u1', 0, 1, 1000);
    consumeReservation(pending, 'u1', 10);
    expect(openRoomCount({ A: room('A') }, pending, 'u1', 10)).toBe(1);
    consumeReservation(pending, 'u1', 10);
    expect(pending.size).toBe(0);
  });

  it('consumes the soonest-expiring reservation first', () => {
    const pending: PendingCreates = new Map([['u1', [900, 100]]]);
    consumeReservation(pending, 'u1', 0);
    expect(pending.get('u1')).toEqual([900]);
  });
});

describe('publicRoomList', () => {
  it('lists public unfinished rooms newest first and caps the length', () => {
    const rooms: Record<string, StoredRoom> = {
      A: room('A', { at: 1 }),
      B: room('B', { at: 3 }),
      C: room('C', { at: 2, visibility: 'private' }),
      D: room('D', { at: 4, status: 'finished' }),
      E: room('E', { at: 2 }),
    };
    expect(publicRoomList(rooms, 10).map((r) => r.code)).toEqual(['B', 'E', 'A']);
    expect(publicRoomList(rooms, 2).map((r) => r.code)).toEqual(['B', 'E']);
  });

  it('keeps the cap when more rooms are open than it allows', () => {
    const rooms = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`R${i}`, room(`R${i}`, { at: i })]));
    const list = publicRoomList(rooms, 50);
    expect(list).toHaveLength(50);
    expect(list[0]?.code).toBe('R79');
    expect(list[49]?.code).toBe('R30');
  });
});

describe('mergeLegacyRooms', () => {
  it('migrates legacy entries without a host and keeps current ones', () => {
    const current = { A: room('A', { hostId: 'u1', at: 5 }) };
    const { merged, migrated } = mergeLegacyRooms(current, {
      A: { summary: room('A').summary, visibility: 'public', at: 1 },
      B: { summary: room('B').summary, visibility: 'private', at: 2 },
    });
    expect(Object.keys(migrated)).toEqual(['B']);
    expect(migrated.B).toMatchObject({ hostId: null, at: 2, visibility: 'private' });
    expect(merged.A).toBe(current.A);
    expect(Object.keys(merged).sort()).toEqual(['A', 'B']);
  });
});

describe('listRoom', () => {
  const listing = (code: string, hostId: string, created: boolean) => ({
    summary: room(code).summary,
    visibility: 'public' as const,
    hostId,
    created,
  });

  it('ends the creator reservation on the first listing only', () => {
    const rooms: Record<string, StoredRoom> = {};
    const pending: PendingCreates = new Map([['u1', [1000]]]);
    listRoom(rooms, pending, listing('A', 'u1', true), 5);
    expect(pending.has('u1')).toBe(false);
  });

  it('leaves another user\'s reservation alone when an existing room is listed again', () => {
    const rooms: Record<string, StoredRoom> = { A: room('A', { at: 3 }) };
    const pending: PendingCreates = new Map([['u2', [1000]]]);
    const { entry } = listRoom(rooms, pending, listing('A', 'u2', false), 5);
    expect(pending.get('u2')).toEqual([1000]);
    expect(entry.at).toBe(3);
    expect(rooms.A?.hostId).toBe('u2');
  });

  it('reports an identical re-listing as unchanged and leaves the entry alone', () => {
    const existing = room('A', { at: 3 });
    const rooms: Record<string, StoredRoom> = { A: existing };
    const { entry, changed } = listRoom(rooms, new Map(), listing('A', 'u1', false), 99);
    expect(changed).toBe(false);
    expect(entry).toBe(existing);
    expect(rooms.A).toBe(existing);
    expect(existing.at).toBe(3);
  });

  it('reports every differing field as a change', () => {
    const base = listing('A', 'u1', false);
    const variants = [
      { ...base, summary: { ...base.summary, seatsTaken: 2 } },
      { ...base, summary: { ...base.summary, status: 'playing' as const } },
      { ...base, summary: { ...base.summary, name: 'Other' } },
      { ...base, summary: { ...base.summary, hostName: 'Binh' } },
      { ...base, visibility: 'private' as const },
      { ...base, hostId: 'u2' },
    ];
    for (const variant of variants) {
      const rooms: Record<string, StoredRoom> = { A: room('A', { at: 3 }) };
      const { entry, changed } = listRoom(rooms, new Map(), variant, 99);
      expect(changed).toBe(true);
      expect(entry.at).toBe(3);
    }
  });

  it('records who plays a running game, and reports a changed player list', () => {
    const rooms: Record<string, StoredRoom> = {};
    listRoom(rooms, new Map(), { ...listing('A', 'u1', false), playerIds: ['u1', 'u2'] }, 5);
    expect(playingElsewhere(rooms, 'u2')).toBe(true);
    expect(playingElsewhere(rooms, 'u3')).toBe(false);
    expect(listRoom(rooms, new Map(), { ...listing('A', 'u1', false), playerIds: ['u1', 'u2'] }, 6).changed).toBe(false);
    expect(listRoom(rooms, new Map(), listing('A', 'u1', false), 7).changed).toBe(true);
    expect(playingElsewhere(rooms, 'u2')).toBe(false);
  });

  it('treats a real host arriving on a legacy entry without one as a change', () => {
    const rooms: Record<string, StoredRoom> = { A: room('A', { hostId: null, at: 3 }) };
    expect(listRoom(rooms, new Map(), listing('A', 'u1', false), 99).changed).toBe(true);
    expect(rooms.A?.hostId).toBe('u1');
  });

  it('still consumes the reservation when the created listing matches the stored entry', () => {
    const rooms: Record<string, StoredRoom> = { A: room('A', { at: 3 }) };
    const pending: PendingCreates = new Map([['u1', [1000]]]);
    expect(listRoom(rooms, pending, listing('A', 'u1', true), 5).changed).toBe(false);
    expect(pending.has('u1')).toBe(false);
  });
});

describe('playing rooms with a CPU seat', () => {
  it('lists public playing rooms with the seats a person can take over, never private ones', () => {
    const withCpu = (code: string, visibility: StoredRoom['visibility']): StoredRoom => {
      const r = room(code, { status: 'playing', visibility });
      return { ...r, summary: { ...r.summary, takeoverSeats: 1 } };
    };
    const list = publicRoomList({ A: withCpu('A', 'public'), B: withCpu('B', 'private'), C: room('C', { status: 'playing' }) }, 10);
    expect(list.map((r) => [r.code, r.takeoverSeats ?? 0])).toEqual([
      ['A', 1],
      ['C', 0],
    ]);
  });
});
