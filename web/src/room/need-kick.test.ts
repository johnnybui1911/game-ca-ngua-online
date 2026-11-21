import { describe, expect, it } from 'vitest';
import { createGame } from '../../../shared/game/engine';
import { POS_GATE, POS_STABLE, type DiceValue, type GameEvent, type GameState } from '../../../shared/game/types';
import type { RoomSnapshot } from '../../../shared/protocol';
import type { StateBatch } from './batches';
import { needKickAfter } from './need-kick';

function gameWith(gate: boolean, unlocked: boolean): GameState {
  const game = createGame([0, 2], 'quick');
  const horses = game.horses.map((row) => [...row]);
  // Either one horse waits on the gate, or all four are in the stable (nothing can move on a 3).
  horses[0] = gate ? [POS_GATE, POS_STABLE, POS_STABLE, POS_STABLE] : [POS_STABLE, POS_STABLE, POS_STABLE, POS_STABLE];
  return { ...game, horses, unlocked: [unlocked, false, false, false] };
}

function batch(seq: number, game: GameState, events: GameEvent[]): StateBatch {
  return { room: { code: 'ABC234', seq, game } as unknown as RoomSnapshot, events };
}

const rolled = (color: 0 | 2, dice: DiceValue, legalHorses: number[]): GameEvent => ({ type: 'rolled', color, dice, legalHorses });

describe('needKickAfter', () => {
  it('shows when the only move was the locked climb', () => {
    const q = [batch(1, gameWith(true, false), [rolled(0, 3, [])])];
    expect(needKickAfter(false, q, 0, 0)).toBe(true);
  });

  it('does not show when the roll had no move for another reason', () => {
    const q = [batch(1, gameWith(false, false), [rolled(0, 3, [])])];
    expect(needKickAfter(false, q, 0, 0)).toBe(false);
  });

  it('does not show when the roll had a legal move', () => {
    const q = [batch(1, gameWith(true, false), [rolled(0, 3, [1])])];
    expect(needKickAfter(false, q, 0, 0)).toBe(false);
  });

  it('is kept across other players batches and dropped when the column opens', () => {
    const hint = [batch(1, gameWith(true, false), [rolled(0, 3, [])]), batch(2, gameWith(true, false), [rolled(2, 4, [])])];
    expect(needKickAfter(false, hint, 0, 0)).toBe(true);
    expect(needKickAfter(true, [batch(3, gameWith(true, true), [])], 2, 0)).toBe(false);
  });

  it('never shows in a classic game or for a spectator', () => {
    const classic = { ...gameWith(true, false), variant: 'classic' as const };
    expect(needKickAfter(false, [batch(1, classic, [rolled(0, 3, [])])], 0, 0)).toBe(false);
    expect(needKickAfter(false, [batch(1, gameWith(true, false), [rolled(0, 3, [])])], 0, null)).toBe(false);
  });
});
