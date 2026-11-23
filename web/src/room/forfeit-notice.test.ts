import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../shared/game/types';
import type { RoomSnapshot } from '../../../shared/protocol';
import type { StateBatch } from './batches';
import { forfeitAfter } from './forfeit-notice';

const batch = (seq: number, events: GameEvent[]): StateBatch => ({ room: { code: 'ABC234', seq } as unknown as RoomSnapshot, events });
const forfeit: GameEvent[] = [
  { type: 'rolled', color: 0, dice: 6, legalHorses: [], forfeit: true },
  { type: 'turn', color: 2, extraRoll: false },
];

describe('forfeitAfter', () => {
  it('shows the colour that lost its turn through the next colour turn, then clears', () => {
    const q = [batch(1, forfeit)];
    expect(forfeitAfter(null, q, null)).toBe(0);
    // The next colour rolls a 6 and rolls again: still shown.
    q.push(batch(2, [{ type: 'rolled', color: 2, dice: 6, legalHorses: [] }, { type: 'turn', color: 2, extraRoll: true }]));
    expect(forfeitAfter(0, q, 1)).toBe(0);
    // Its turn ends with a move: cleared.
    q.push(
      batch(3, [
        { type: 'rolled', color: 2, dice: 3, legalHorses: [0] },
        { type: 'moved', color: 2, horse: 0, from: 0, to: 3, kicked: null },
        { type: 'turn', color: 0, extraRoll: false },
      ]),
    );
    expect(forfeitAfter(0, q, 2)).toBeNull();
  });

  it('folds several batches at once the same as one by one', () => {
    const q = [batch(1, [{ type: 'rolled', color: 2, dice: 4, legalHorses: [] }, { type: 'turn', color: 0, extraRoll: false }]), batch(2, forfeit)];
    expect(forfeitAfter(null, q, null)).toBe(0);
  });
});
