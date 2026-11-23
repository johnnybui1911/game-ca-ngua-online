import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../shared/game/types';
import type { RoomSnapshot } from '../../../shared/protocol';
import type { StateBatch } from './batches';
import { forfeitsAfter } from './forfeit-toast';

const batch = (seq: number, events: GameEvent[]): StateBatch => ({ room: { code: 'ABC234', seq } as unknown as RoomSnapshot, events });
const forfeitOf = (color: 0 | 1 | 2 | 3): GameEvent[] => [
  { type: 'rolled', color, dice: 6, legalHorses: [], forfeit: true },
  { type: 'turn', color: 2, extraRoll: false },
];

describe('forfeitsAfter', () => {
  it('counts only the forfeits of the given colour', () => {
    const q = [batch(1, forfeitOf(0)), batch(2, forfeitOf(1))];
    expect(forfeitsAfter(q, 0, 0)).toBe(1);
    expect(forfeitsAfter(q, 0, 1)).toBe(1);
    expect(forfeitsAfter(q, 0, 3)).toBe(0);
  });

  it('ignores batches already consumed, and a spectator gets none', () => {
    const q = [batch(1, forfeitOf(0)), batch(2, forfeitOf(0))];
    expect(forfeitsAfter(q, 1, 0)).toBe(1);
    expect(forfeitsAfter(q, 2, 0)).toBe(0);
    expect(forfeitsAfter(q, 0, null)).toBe(0);
  });

  it('does not replay a forfeit that was already in the room when the page opened', () => {
    // With nothing consumed yet only the newest batch is looked at: an older forfeit stays unannounced.
    const q = [batch(1, forfeitOf(0)), batch(2, [{ type: 'rolled', color: 0, dice: 3, legalHorses: [0] }])];
    expect(forfeitsAfter(q, null, 0)).toBe(0);
  });

  it('does not count a plain roll of a 6', () => {
    expect(forfeitsAfter([batch(1, [{ type: 'rolled', color: 0, dice: 6, legalHorses: [0] }])], 0, 0)).toBe(0);
  });
});
