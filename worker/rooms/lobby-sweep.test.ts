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

describe('applySweep', () => {
  it('drops rooms that no longer exist, refreshes live ones and leaves unanswered ones', () => {
    const rooms = {
      AAAAAA: { summary: summary('AAAAAA'), visibility: 'public' as const },
      BBBBBB: { summary: summary('BBBBBB'), visibility: 'public' as const },
      CCCCCC: { summary: summary('CCCCCC'), visibility: 'public' as const },
      DDDDDD: { summary: summary('DDDDDD'), visibility: 'public' as const },
    };
    const changed = applySweep(rooms, [
      { code: 'AAAAAA', summary: null },
      { code: 'BBBBBB', summary: summary('BBBBBB', 3) },
      { code: 'CCCCCC', summary: summary('CCCCCC') },
    ]);
    expect(changed).toBe(true);
    expect(Object.keys(rooms).sort()).toEqual(['BBBBBB', 'CCCCCC', 'DDDDDD']);
    expect(rooms.BBBBBB.summary.seatsTaken).toBe(3);
  });

  it('reports no change when every room is as listed', () => {
    const rooms = { AAAAAA: { summary: summary('AAAAAA'), visibility: 'private' as const } };
    expect(applySweep(rooms, [{ code: 'AAAAAA', summary: summary('AAAAAA') }])).toBe(false);
  });
});
