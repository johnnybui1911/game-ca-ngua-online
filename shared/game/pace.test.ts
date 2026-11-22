import { describe, expect, it } from 'vitest';
import { chooseCpuMove } from './cpu';
import { applyMove, applyRoll, createGame } from './engine';
import {
  DEFAULT_PACE,
  PACES,
  PACE_NAMES,
  animationSeconds,
  isPaceName,
  longestBatchSeconds,
  moveTiming,
  paceTimings,
  pauseSeconds,
  restAfterRoll,
} from './pace';
import { mulberry32 } from './seeded-random';
import type { DiceValue, GameEvent } from './types';

/** The batches of a seeded all-CPU game: each roll together with its move. */
function cpuBatches(seed: number, limit = 400): GameEvent[][] {
  const rand = mulberry32(seed);
  const out: GameEvent[][] = [];
  let game = createGame([0, 1, 2, 3]);
  while (game.phase !== 'finished' && out.length < limit) {
    const rolled = applyRoll(game, (1 + Math.floor(rand() * 6)) as DiceValue);
    if (rolled.state.phase === 'move') {
      const moved = applyMove(rolled.state, chooseCpuMove(rolled.state));
      out.push([...rolled.events, ...moved.events]);
      game = moved.state;
    } else {
      out.push(rolled.events);
      game = rolled.state;
    }
  }
  return out;
}

const modes = PACE_NAMES.flatMap((name) => [PACES[name].normal, PACES[name].quick]);

describe('pace', () => {
  it('the server never commits the next automated action before the board has finished the last', () => {
    for (const t of modes) {
      for (const events of cpuBatches(5)) {
        expect(pauseSeconds(events, t)).toBeGreaterThanOrEqual(animationSeconds(events, t) + t.beat - 1e-9);
        expect(pauseSeconds(events, t)).toBeGreaterThan(animationSeconds(events, t));
      }
    }
  });

  it('a roll waits for the board at most as long as the longest batch', () => {
    for (const t of modes) {
      for (const seed of [5, 6, 7]) {
        for (const events of cpuBatches(seed)) expect(animationSeconds(events, t)).toBeLessThanOrEqual(longestBatchSeconds(t) + 1e-9);
      }
    }
  });

  it('each named pace is slower than the one before it, and a quick match is faster than a normal one', () => {
    const total = (t: (typeof modes)[number]) => cpuBatches(9).reduce((sum, events) => sum + pauseSeconds(events, t), 0);
    expect(total(PACES.vua.normal)).toBeGreaterThan(total(PACES.nhanh.normal));
    expect(total(PACES['thu-thai'].normal)).toBeGreaterThan(total(PACES.vua.normal));
    for (const name of PACE_NAMES) expect(total(PACES[name].quick)).toBeLessThan(total(PACES[name].normal));
  });

  it('a move of six cells takes longer than a move of one, with every hop long enough to be seen', () => {
    const t = PACES[DEFAULT_PACE].normal;
    const move = (to: number) => ({ from: 0, to, kicked: null });
    expect(moveTiming(move(6), t).hop).toBeLessThan(moveTiming(move(1), t).hop);
    expect(6 * moveTiming(move(6), t).hop).toBeGreaterThan(moveTiming(move(1), t).hop);
    expect(moveTiming(move(6), t).hop).toBeGreaterThanOrEqual(0.1);
  });

  it('rests the die before its move and before the turn passes on, not before a pick', () => {
    const t = PACES[DEFAULT_PACE].normal;
    const rolled: GameEvent = { type: 'rolled', color: 0, dice: 3, legalHorses: [0] };
    const moved: GameEvent = { type: 'moved', color: 0, horse: 0, from: 0, to: 3, kicked: null };
    const turn: GameEvent = { type: 'turn', color: 1, extraRoll: false };
    expect(restAfterRoll([rolled, moved, turn], 0, t)).toBe(t.rollHold);
    expect(restAfterRoll([rolled, turn], 0, t)).toBe(t.rollRest);
    expect(restAfterRoll([rolled], 0, t)).toBe(0);
  });

  it('knows its names', () => {
    expect(PACE_NAMES).toEqual(['nhanh', 'vua', 'thu-thai']);
    expect(DEFAULT_PACE).toBe('vua');
    expect(PACE_NAMES.every(isPaceName)).toBe(true);
    for (const other of ['current', 'Vừa', 'toString', '', null, undefined, 1]) expect(isPaceName(other)).toBe(false);
  });

  it('picks the quick table of a pace for a quick match', () => {
    for (const name of PACE_NAMES) {
      expect(paceTimings(name, false)).toBe(PACES[name].normal);
      expect(paceTimings(name, true)).toBe(PACES[name].quick);
    }
  });
});
