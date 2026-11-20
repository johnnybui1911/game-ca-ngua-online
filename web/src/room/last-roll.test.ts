import { describe, expect, it } from 'vitest';
import { createGame } from '../../../shared/game/engine';
import type { GameEvent } from '../../../shared/game/types';
import { SEAT_COLORS, type RoomSnapshot } from '../../../shared/protocol';
import type { StateBatch } from './batches';
import { lastRollAfter } from './last-roll';

function batch(seq: number, events: GameEvent[], dice: 1 | 2 | 3 | 4 | 5 | 6 | null = null): StateBatch {
  const game = { ...createGame(SEAT_COLORS[2]!), dice };
  const room = { code: 'ABC234', seq, game } as unknown as RoomSnapshot;
  return { room, events };
}

const rolled = (color: 0 | 2, dice: 1 | 2 | 3 | 4 | 5 | 6): GameEvent => ({ type: 'rolled', color, dice, legalHorses: [] });

describe('lastRollAfter', () => {
  it('uses the newest roll across several unrendered batches', () => {
    const q = [batch(1, [rolled(0, 3)]), batch(2, []), batch(3, [rolled(2, 5)])];
    expect(lastRollAfter(null, q, 0)).toEqual({ color: 2, dice: 5 });
  });

  it('keeps an earlier roll when a later batch has none and no die is pending', () => {
    const q = [batch(1, [rolled(0, 3)]), batch(2, [])];
    expect(lastRollAfter(null, q, 0)).toEqual({ color: 0, dice: 3 });
  });

  it('skips batches already consumed and falls back to the pending die', () => {
    const q = [batch(1, [rolled(0, 3)]), batch(2, [], 4)];
    expect(lastRollAfter({ color: 0, dice: 3 }, q, 1)).toEqual({ color: createGame(SEAT_COLORS[2]!).turn, dice: 4 });
    expect(lastRollAfter({ color: 0, dice: 3 }, q, 2)).toEqual({ color: 0, dice: 3 });
  });

  it('reads only the newest batch on first sight', () => {
    const q = [batch(1, [rolled(0, 3)]), batch(2, [])];
    expect(lastRollAfter(null, q, null)).toBeNull();
  });
});
