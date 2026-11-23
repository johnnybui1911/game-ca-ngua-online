import { describe, expect, it } from 'vitest';
import { applyMove, createGame } from '../../shared/game/engine';
import { DICE_SHAPING } from '../../shared/experiments';
import { POS_STABLE, type DiceValue, type GameState } from '../../shared/game/types';
import { ALL_FACES, DRY_TURNS_BEFORE_ENTRY, facesFor } from './dice-shaping';
import { rollFor, type RoomState } from './room-state';

/** Red (colour 0) is a CPU, yellow (colour 2) a person. */
function room(game: GameState): RoomState {
  return {
    code: 'ABC234',
    name: 'Phòng thử',
    visibility: 'public',
    hostId: 'u1',
    status: 'playing',
    seats: [
      { color: 0, occupant: { kind: 'cpu', name: 'Máy 1' } },
      { color: 2, occupant: { kind: 'human', user: { id: 'u1', displayName: 'An' } } },
    ],
    game,
    seq: 1,
    dueAt: null,
    actionDueAt: null,
    disconnectedSince: {},
    noHumanConnectedSince: null,
  };
}

/** Rolls `dice` for the colour on turn of the room's game, recording the faces it was drawn from; moves the first legal horse. */
function roll(state: RoomState, dice: DiceValue): readonly DiceValue[] {
  let offered: readonly DiceValue[] = [];
  const result = rollFor(state, state.game!, false, (faces) => {
    offered = faces;
    return dice;
  });
  state.game = result.state.phase === 'move' ? applyMove(result.state, result.state.legalHorses[0]!).state : result.state;
  return offered;
}

const yellowTurn = (): GameState => ({ ...createGame([0, 2]), turn: 2 });

describe.runIf(DICE_SHAPING)('dice shaping', () => {
  it('never gives a CPU the same 1 or 6 twice in a row, and allows 6-1-6', () => {
    const r = room(createGame([0, 2]));
    expect(roll(r, 6)).toEqual(ALL_FACES);
    expect(roll(r, 1)).toEqual([1, 2, 3, 4, 5]);
    expect(roll(r, 6)).toEqual([2, 3, 4, 5, 6]);
    expect(roll(r, 3)).toEqual([1, 2, 3, 4, 5]);
    // The turn passed on the 3; red's next turn starts with every face.
    expect(r.game!.turn).toBe(2);
    roll(r, 2);
    expect(facesFor(r, r.game!)).toEqual(ALL_FACES);
  });

  it('leaves a person rolling 6 after 6', () => {
    const r = room(yellowTurn());
    roll(r, 6);
    expect(r.game!.turn).toBe(2);
    expect(facesFor(r, r.game!)).toEqual(ALL_FACES);
  });

  it(`gives a person with no horse on the track a 1 or 6 after ${DRY_TURNS_BEFORE_ENTRY} turns without one`, () => {
    const r = room(yellowTurn());
    for (let turn = 0; turn < DRY_TURNS_BEFORE_ENTRY; turn++) {
      expect(roll(r, 3)).toEqual(ALL_FACES);
      r.game = { ...r.game!, turn: 2 };
    }
    expect(roll(r, 6)).toEqual([1, 6]);
    // The horse came out; the count starts again.
    expect(r.game!.horses[2]!.filter((p) => p !== POS_STABLE)).toHaveLength(1);
    expect(r.diceMemory?.dry?.[2]).toBe(0);
  });

  it('does not count turns in which the person had a horse on the track', () => {
    const base = yellowTurn();
    const horses = base.horses.map((row) => row.slice());
    horses[2] = [10, POS_STABLE, POS_STABLE, POS_STABLE];
    const r = room({ ...base, horses });
    for (let turn = 0; turn < 3; turn++) {
      expect(roll(r, 2)).toEqual(ALL_FACES);
      r.game = { ...r.game!, turn: 2 };
    }
    expect(r.diceMemory?.dry?.[2]).toBe(0);
  });

  it('does not help a CPU with no horse on the track', () => {
    const r = room(createGame([0, 2]));
    for (let turn = 0; turn < 3; turn++) {
      expect(roll(r, 3)).toEqual(ALL_FACES);
      r.game = { ...r.game!, turn: 0 };
    }
    expect(facesFor(r, r.game!)).toEqual(ALL_FACES);
  });
});

describe.runIf(!DICE_SHAPING)('dice shaping switched off', () => {
  it('draws every roll from all six faces', () => {
    const r = room(createGame([0, 2]));
    for (const dice of [6, 6, 1, 1] as DiceValue[]) expect(roll(r, dice)).toEqual(ALL_FACES);
  });
});
