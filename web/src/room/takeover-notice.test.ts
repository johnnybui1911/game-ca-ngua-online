import { describe, expect, it } from 'vitest';
import type { RoomSnapshot, SeatOccupant } from '../../../shared/protocol';
import type { StateBatch } from './batches';
import { takeoversAfter } from './takeover-notice';

const cpu = (name: string): SeatOccupant => ({ kind: 'cpu', name });
const human = (id: string, displayName: string): SeatOccupant => ({ kind: 'human', user: { id, displayName }, connected: true });
const batch = (seq: number, occupants: SeatOccupant[], code = 'ABC234'): StateBatch => ({
  room: { code, seq, seats: occupants.map((occupant, i) => ({ color: i, occupant, horseNames: [], auto: false })) } as unknown as RoomSnapshot,
  events: [],
});

describe('takeoversAfter', () => {
  const an = human('u1', 'An');
  const cam = human('u3', 'Cam');

  it('announces a CPU seat taken by another person', () => {
    const q = [batch(1, [an, cpu('Máy 1')]), batch(2, [an, cam])];
    expect(takeoversAfter(q, 1, 'u1')).toEqual(['Cam đã vào thay Máy 1']);
  });

  it('stays silent for the newcomer, on a fresh mount and for batches already seen', () => {
    const q = [batch(1, [an, cpu('Máy 1')]), batch(2, [an, cam])];
    expect(takeoversAfter(q, 1, 'u3')).toEqual([]);
    expect(takeoversAfter(q, null, 'u1')).toEqual([]);
    expect(takeoversAfter(q, 2, 'u1')).toEqual([]);
  });

  it('does not announce a person leaving (human to CPU) or a change of room', () => {
    expect(takeoversAfter([batch(1, [an, cam]), batch(2, [an, cpu('Máy 1')])], 1, 'u1')).toEqual([]);
    expect(takeoversAfter([batch(1, [an, cpu('Máy 1')], 'OTHER2'), batch(2, [an, cam])], 1, 'u1')).toEqual([]);
  });

  it('announces every takeover across several unseen batches', () => {
    const dung = human('u4', 'Dũng');
    const q = [batch(1, [an, cpu('Máy 1'), cpu('Máy 2')]), batch(2, [an, cam, cpu('Máy 2')]), batch(3, [an, cam, dung])];
    expect(takeoversAfter(q, 1, 'u1')).toEqual(['Cam đã vào thay Máy 1', 'Dũng đã vào thay Máy 2']);
  });
});
