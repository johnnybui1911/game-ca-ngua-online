import type { GameState } from './types';
import { POS_GATE, POS_STABLE } from './types';
import { landingFor } from './engine';
import { DEFAULT_CPU_LEVEL, type CpuLevel } from './cpu-level';
import { chooseHard } from './cpu-hard';

/** Chance that an Easy CPU plays the Normal choice instead of a random legal move. */
export const EASY_SMART_RATE = 0.25;

function assertMovePhase(state: GameState): void {
  if (state.phase !== 'move' || state.dice === null) throw new Error('CPU can only choose in the move phase');
}

/**
 * Picks the horse to move for `state.turn`. Uses only public state, never the
 * next roll. `rand` returns a float in [0, 1) and is only used by Easy.
 */
export function chooseCpuMove(
  state: GameState,
  level: CpuLevel = DEFAULT_CPU_LEVEL,
  rand: () => number = Math.random,
): number {
  assertMovePhase(state);
  if (level === 'easy') return chooseEasy(state, rand);
  if (level === 'hard') return chooseHard(state);
  return chooseNormal(state);
}

/** Easy: with probability EASY_SMART_RATE the Normal move, otherwise a uniformly random legal horse. */
function chooseEasy(state: GameState, rand: () => number): number {
  if (rand() < EASY_SMART_RATE) return chooseNormal(state);
  const legal = [...state.legalHorses].sort((a, b) => a - b);
  const pick = legal[Math.min(Math.floor(rand() * legal.length), legal.length - 1)];
  if (pick === undefined) throw new Error('No legal horse to choose');
  return pick;
}

/**
 * Priority: kick an opponent; else reach/climb the home column (highest
 * resulting step); else leave the stable; else the most advanced track horse.
 * Ties go to the lowest horse index.
 */
function chooseNormal(state: GameState): number {
  const color = state.turn;
  const dice = state.dice;
  if (dice === null) throw new Error('CPU can only choose in the move phase');

  let kick = -1;
  let home = -1;
  let homeStep = 0;
  let leave = -1;
  let advance = -1;
  let advancePos = -2;

  for (const horse of [...state.legalHorses].sort((a, b) => a - b)) {
    const landing = landingFor(state.horses, color, horse, dice);
    if (landing === null) continue;
    const pos = state.horses[color]?.[horse] ?? POS_STABLE;
    if (landing.kicked && kick < 0) kick = horse;
    if (landing.to > POS_GATE && landing.to - POS_GATE > homeStep) {
      home = horse;
      homeStep = landing.to - POS_GATE;
    }
    if (pos === POS_STABLE && leave < 0) leave = horse;
    if (pos > advancePos) {
      advance = horse;
      advancePos = pos;
    }
  }

  for (const pick of [kick, home, leave, advance]) if (pick >= 0) return pick;
  throw new Error('No legal horse to choose');
}
