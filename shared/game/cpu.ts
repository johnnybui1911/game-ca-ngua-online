import type { GameState } from './types';
import { POS_GATE, POS_STABLE } from './types';
import { isLocked, landingFor } from './engine';
import { DEFAULT_CPU_LEVEL, type CpuLevel } from './cpu-level';
import { chooseHard } from './cpu-hard';

/** Chance that an Easy CPU plays the Normal choice instead of a random legal move. */
export const EASY_SMART_RATE = 0.25;

/**
 * Progress (cells from its entry, 55 at its gate) a victim must have made before Normal goes out of its way to kick
 * it: the last quarter of its lap, where losing the horse hurts. Any other kick is only played when every legal
 * move kicks. Chosen with Normal still beating Easy clearly (about 70% of two-player games, classic and quick).
 */
export const NORMAL_KICK_MIN_PROGRESS = 42;

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

/**
 * Easy: with probability EASY_SMART_RATE the Normal move, otherwise a uniformly random legal horse. In a classic
 * game the draw is among the moves that kick nobody when there are any; a quick game is won by kicking (a column
 * opens only after a kick), so there every legal horse is drawn from.
 */
function chooseEasy(state: GameState, rand: () => number): number {
  if (rand() < EASY_SMART_RATE) return chooseNormal(state);
  const color = state.turn;
  const dice = state.dice;
  if (dice === null) throw new Error('CPU can only choose in the move phase');
  const legal = [...state.legalHorses].sort((a, b) => a - b);
  const calm = state.variant === 'quick' ? [] : legal.filter((horse) => !landingFor(state.horses, color, horse, dice)?.kicked);
  const pool = calm.length > 0 ? calm : legal;
  const pick = pool[Math.min(Math.floor(rand() * pool.length), pool.length - 1)];
  if (pick === undefined) throw new Error('No legal horse to choose');
  return pick;
}

/**
 * Ties go to the lowest horse index.
 * Classic: reach or climb the home column (highest resulting step first); else leave the stable; else kick a victim
 * that has made at least NORMAL_KICK_MIN_PROGRESS; else advance the furthest horse whose move kicks nobody, else the
 * furthest horse. So a kick of a horse that has not got far is only played when every legal move kicks.
 * Quick: entering the home column wins at once, so it comes first; then a kick (it is how a locked column
 * opens, and a locked column keeps climbs out of the legal moves); then leaving the stable; then the furthest horse.
 */
function chooseNormal(state: GameState): number {
  const color = state.turn;
  const dice = state.dice;
  if (dice === null) throw new Error('CPU can only choose in the move phase');
  const locked = isLocked(state, color);

  let kick = -1;
  let farKick = -1;
  let home = -1;
  let homeStep = 0;
  let leave = -1;
  let calm = -1;
  let calmPos = -2;
  let advance = -1;
  let advancePos = -2;

  for (const horse of [...state.legalHorses].sort((a, b) => a - b)) {
    const landing = landingFor(state.horses, color, horse, dice, locked);
    if (landing === null) continue;
    if (state.variant === 'quick' && landing.to > POS_GATE) return horse;
    const pos = state.horses[color]?.[horse] ?? POS_STABLE;
    if (landing.kicked && kick < 0) kick = horse;
    if (landing.kicked && farKick < 0 && landing.kicked.from >= NORMAL_KICK_MIN_PROGRESS) farKick = horse;
    if (landing.to > POS_GATE && landing.to - POS_GATE > homeStep) {
      home = horse;
      homeStep = landing.to - POS_GATE;
    }
    if (pos === POS_STABLE && leave < 0) leave = horse;
    if (!landing.kicked && pos > calmPos) {
      calm = horse;
      calmPos = pos;
    }
    if (pos > advancePos) {
      advance = horse;
      advancePos = pos;
    }
  }

  const order = state.variant === 'quick' ? [kick, home, leave, advance] : [home, leave, farKick, calm, advance];
  for (const pick of order) if (pick >= 0) return pick;
  throw new Error('No legal horse to choose');
}
