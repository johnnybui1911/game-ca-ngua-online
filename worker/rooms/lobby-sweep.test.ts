import { describe, expect, it } from 'vitest';
import type { RoomSummary } from '../../shared/protocol';
import { applySweep } from './lobby-sweep';

const summary = (code: string, seatsTaken = 1): RoomSummary => ({
  code,
  name: code,
  hostName: 'An',
  status: 'waiting',
  seatsTaken,
  seatsTotal: 4,
});

const entry = (code: string, rev: number, visibility: 'public' | 'private' = 'public') => ({
  summary: summary(code),
  visibility,
  rev,
});

describe('applySweep', () => {
  it('drops rooms that no longer exist, refreshes live ones and leaves unanswered ones', () => {
    const rooms = { AAAAAA: entry('AAAAAA', 1), BBBBBB: entry('BBBBBB', 2), CCCCCC: entry('CCCCCC', 3), DDDDDD: entry('DDDDDD', 4) };
    const changed = applySweep(rooms, [
      { code: 'AAAAAA', summary: null, rev: 1 },
      { code: 'BBBBBB', summary: summary('BBBBBB', 3), rev: 2 },
      { code: 'CCCCCC', summary: summary('CCCCCC'), rev: 3 },
    ]);
    expect(changed.sort()).toEqual(['AAAAAA', 'BBBBBB']);
    expect(Object.keys(rooms).sort()).toEqual(['BBBBBB', 'CCCCCC', 'DDDDDD']);
    expect(rooms.BBBBBB.summary.seatsTaken).toBe(3);
  });

  it('reports no change when every room is as listed', () => {
    const rooms = { AAAAAA: entry('AAAAAA', 1, 'private') };
    expect(applySweep(rooms, [{ code: 'AAAAAA', summary: summary('AAAAAA'), rev: 1 }])).toEqual([]);
  });

  it('ignores an answer older than the entry it would overwrite', () => {
    const rooms = { AAAAAA: { summary: summary('AAAAAA', 2), visibility: 'public' as const, rev: 7 } };
    expect(applySweep(rooms, [{ code: 'AAAAAA', summary: summary('AAAAAA', 1), rev: 6 }])).toEqual([]);
    expect(rooms.AAAAAA.summary.seatsTaken).toBe(2);
  });

  it('does not drop a room that was removed and listed again while the question was out', () => {
    const rooms = { AAAAAA: entry('AAAAAA', 9) };
    expect(applySweep(rooms, [{ code: 'AAAAAA', summary: null, rev: 4 }])).toEqual([]);
    expect(rooms.AAAAAA).toBeDefined();
  });
});
