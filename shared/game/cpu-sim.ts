import { applyMove, applyRoll, createGame } from './engine';
import { chooseCpuMove } from './cpu';
import { DEFAULT_CPU_LEVEL, type CpuLevel } from './cpu-level';
import { mulberry32 } from './seeded-random';
import type { Color, DiceValue } from './types';

/** Plays one CPU-only game with dice from `mulberry32(seed)`. Colours without a level play Normal. */
export function playMatch(
  levels: Partial<Record<Color, CpuLevel>>,
  seed: number,
): { winner: Color; rolls: number } {
  const colors = (Object.keys(levels).map(Number) as Color[]).sort((a, b) => a - b);
  const rand = mulberry32(seed);
  // Separate stream for Easy's choices so they do not correlate with the dice.
  const cpuRand = mulberry32(seed ^ 0x9e3779b9);
  let state = createGame(colors);
  let rolls = 0;
  while (state.phase !== 'finished') {
    if (++rolls > 5000) throw new Error(`game seed ${seed} exceeded 5000 rolls`);
    const dice = (Math.floor(rand() * 6) + 1) as DiceValue;
    state = applyRoll(state, dice).state;
    if (state.phase === 'move') {
      state = applyMove(state, chooseCpuMove(state, levels[state.turn] ?? DEFAULT_CPU_LEVEL, cpuRand)).state;
    }
  }
  if (state.winner === null) throw new Error('finished without a winner');
  return { winner: state.winner, rolls };
}

export interface MatchupResult {
  games: number;
  /** Games won by the first-named level. */
  wins: number;
  meanRolls: number;
}

/**
 * First-named level `a` against the others `b` (one `a` seat, the rest `b`).
 * The `a` seat rotates over the colours with the seed so the first-mover
 * advantage cancels out. Seeds are `firstSeed .. firstSeed + games - 1`.
 */
export function runMatchup(
  a: CpuLevel,
  b: CpuLevel,
  colors: Color[],
  games: number,
  firstSeed: number,
): MatchupResult {
  let wins = 0;
  let rolls = 0;
  for (let i = 0; i < games; i++) {
    const seat = colors[i % colors.length] as Color;
    const levels: Partial<Record<Color, CpuLevel>> = {};
    for (const c of colors) levels[c] = c === seat ? a : b;
    const r = playMatch(levels, firstSeed + i);
    if (r.winner === seat) wins++;
    rolls += r.rolls;
  }
  return { games, wins, meanRolls: rolls / games };
}

/** 95% Wilson score interval of `wins / games`. */
export function wilson95(wins: number, games: number): [number, number] {
  const z = 1.96;
  const p = wins / games;
  const d = 1 + (z * z) / games;
  const centre = (p + (z * z) / (2 * games)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) / d;
  return [centre - half, centre + half];
}
