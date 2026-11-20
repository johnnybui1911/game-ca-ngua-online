import {
  COLORS,
  HORSES_PER_COLOR,
  POS_GATE,
  POS_STABLE,
  POS_START,
  isHome,
  isOnTrack,
  trackCell,
  type Color,
  type DiceValue,
  type GameEvent,
  type GameState,
  type HorsePos,
  type RulesEngine,
  type StepResult,
} from './types';
import { chooseCpuMove } from './cpu';

/** Outcome of moving one horse with the current dice, or null when illegal. */
export interface Landing {
  to: HorsePos;
  kicked: { color: Color; horse: number; from: HorsePos } | null;
}

/** Indexed read that fails loudly instead of yielding undefined. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Index ${index} out of range`);
  return item;
}

function cloneHorses(horses: HorsePos[][]): HorsePos[][] {
  return horses.map((row) => row.slice());
}

/** The opponent (or own) horse standing on absolute track cell `cell`, if any. */
function occupant(
  horses: HorsePos[][],
  cell: number,
): { color: Color; horse: number; pos: HorsePos } | null {
  for (const color of COLORS) {
    const row = at(horses, color);
    for (let horse = 0; horse < row.length; horse++) {
      const pos = at(row, horse);
      if (isOnTrack(pos) && trackCell(color, pos) === cell) return { color, horse, pos };
    }
  }
  return null;
}

/** Where `horse` of the current colour ends up with `dice`; null if the move is illegal. */
export function landingFor(
  horses: HorsePos[][],
  color: Color,
  horse: number,
  dice: DiceValue,
): Landing | null {
  const pos = at(at(horses, color), horse);

  if (pos === POS_STABLE) {
    if (dice !== 1 && dice !== 6) return null;
    const blocker = occupant(horses, trackCell(color, POS_START));
    if (blocker === null) return { to: POS_START, kicked: null };
    if (blocker.color === color) return null;
    return { to: POS_START, kicked: { color: blocker.color, horse: blocker.horse, from: blocker.pos } };
  }

  if (isHome(pos)) {
    const step = pos - POS_GATE;
    if (dice !== step + 1) return null;
    const to = pos + 1;
    if (at(horses, color).includes(to)) return null;
    return { to, kicked: null };
  }

  if (pos === POS_GATE) {
    // Climbing from the gate: home steps 1..dice must be free of own horses.
    for (let step = 1; step <= dice; step++) {
      if (at(horses, color).includes(POS_GATE + step)) return null;
    }
    return { to: POS_GATE + dice, kicked: null };
  }

  const to = pos + dice;
  if (to > POS_GATE) return null;
  for (let p = pos + 1; p < to; p++) {
    if (occupant(horses, trackCell(color, p)) !== null) return null;
  }
  const blocker = occupant(horses, trackCell(color, to));
  if (blocker === null) return { to, kicked: null };
  if (blocker.color === color) return null;
  return { to, kicked: { color: blocker.color, horse: blocker.horse, from: blocker.pos } };
}

export function legalHorsesFor(horses: HorsePos[][], color: Color, dice: DiceValue): number[] {
  const out: number[] = [];
  for (let horse = 0; horse < HORSES_PER_COLOR; horse++) {
    if (landingFor(horses, color, horse, dice) !== null) out.push(horse);
  }
  return out;
}

export function createGame(colors: Color[]): GameState {
  const sorted = [...colors].sort((a, b) => a - b);
  if (sorted.length < 2 || sorted.length > 4) throw new Error('A game needs 2 to 4 colours');
  for (let i = 0; i < sorted.length; i++) {
    if (!COLORS.includes(at(sorted, i))) throw new Error(`Invalid colour ${String(at(sorted, i))}`);
    if (i > 0 && sorted[i] === sorted[i - 1]) throw new Error('Colours must be distinct');
  }
  return {
    colors: sorted,
    horses: COLORS.map(() => new Array<HorsePos>(HORSES_PER_COLOR).fill(POS_STABLE)),
    turn: at(sorted, 0),
    phase: 'roll',
    dice: null,
    legalHorses: [],
    winner: null,
  };
}

function nextColor(state: GameState): Color {
  const i = state.colors.indexOf(state.turn);
  return at(state.colors, (i + 1) % state.colors.length);
}

/** Ends the current action: same colour again on 1 or 6, otherwise the next colour. */
function passTurn(state: GameState, dice: DiceValue, events: GameEvent[]): GameState {
  const extraRoll = dice === 1 || dice === 6;
  const turn = extraRoll ? state.turn : nextColor(state);
  events.push({ type: 'turn', color: turn, extraRoll });
  return { ...state, turn, phase: 'roll', dice: null, legalHorses: [] };
}

export function applyRoll(state: GameState, dice: DiceValue): StepResult {
  if (state.phase !== 'roll') throw new Error('Cannot roll outside the roll phase');
  const legalHorses = legalHorsesFor(state.horses, state.turn, dice);
  const events: GameEvent[] = [{ type: 'rolled', color: state.turn, dice, legalHorses }];
  if (legalHorses.length > 0) {
    return {
      state: {
        ...state,
        horses: cloneHorses(state.horses),
        phase: 'move',
        dice,
        legalHorses: legalHorses.slice(),
      },
      events,
    };
  }
  const next = passTurn({ ...state, horses: cloneHorses(state.horses) }, dice, events);
  return { state: next, events };
}

export function applyMove(state: GameState, horse: number): StepResult {
  if (state.phase !== 'move' || state.dice === null) throw new Error('Cannot move outside the move phase');
  if (!state.legalHorses.includes(horse)) throw new Error(`Horse ${horse} has no legal move`);
  const dice = state.dice;
  const color = state.turn;
  const landing = landingFor(state.horses, color, horse, dice);
  if (landing === null) throw new Error(`Horse ${horse} has no legal move`);

  const horses = cloneHorses(state.horses);
  const row = at(horses, color);
  const from = at(row, horse);
  row[horse] = landing.to;
  if (landing.kicked) at(horses, landing.kicked.color)[landing.kicked.horse] = POS_STABLE;

  const events: GameEvent[] = [
    { type: 'moved', color, horse, from, to: landing.to, kicked: landing.kicked },
  ];
  const moved: GameState = { ...state, horses };
  if (row.every(isHome)) {
    events.push({ type: 'won', color });
    return {
      state: { ...moved, phase: 'finished', dice: null, legalHorses: [], winner: color },
      events,
    };
  }
  return { state: passTurn(moved, dice, events), events };
}

export const engine: RulesEngine = { createGame, applyRoll, applyMove, chooseCpuMove };
