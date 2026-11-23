import {
  BONUS_STREAK_LIMIT,
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
  type HouseRules,
  type RuleVariant,
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

/** Whether `color`'s home column is closed: a quick game in which that colour has not kicked yet. Classic never locks. */
export function isLocked(state: Pick<GameState, 'variant' | 'unlocked'>, color: Color): boolean {
  return state.variant === 'quick' && state.unlocked?.[color] !== true;
}

/**
 * Where `horse` of `color` ends up with `dice`; null if the move is illegal.
 * `locked` closes the home column (see `isLocked`): a horse on the gate cannot climb.
 */
export function landingFor(
  horses: HorsePos[][],
  color: Color,
  horse: number,
  dice: DiceValue,
  locked = false,
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
    if (locked) return null;
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

export function legalHorsesFor(horses: HorsePos[][], color: Color, dice: DiceValue, locked = false): number[] {
  const out: number[] = [];
  for (let horse = 0; horse < HORSES_PER_COLOR; horse++) {
    if (landingFor(horses, color, horse, dice, locked) !== null) out.push(horse);
  }
  return out;
}

/** `houseRules` with every rule off leaves the game exactly as it was before house rules existed. */
export function createGame(colors: Color[], variant: RuleVariant = 'classic', houseRules?: HouseRules): GameState {
  const sorted = [...colors].sort((a, b) => a - b);
  if (sorted.length < 2 || sorted.length > 4) throw new Error('A game needs 2 to 4 colours');
  for (let i = 0; i < sorted.length; i++) {
    if (!COLORS.includes(at(sorted, i))) throw new Error(`Invalid colour ${String(at(sorted, i))}`);
    if (i > 0 && sorted[i] === sorted[i - 1]) throw new Error('Colours must be distinct');
  }
  const horses = COLORS.map(() => new Array<HorsePos>(HORSES_PER_COLOR).fill(POS_STABLE));
  const kicks = Object.fromEntries(COLORS.map((color) => [color, 0])) as Record<Color, number>;
  const house = houseRules?.tripleBonusForfeit ? { houseRules: { ...houseRules }, bonusStreak: 0 } : {};
  if (variant === 'classic') {
    return { colors: sorted, horses, kicks, turn: at(sorted, 0), phase: 'roll', dice: null, legalHorses: [], winner: null, ...house };
  }
  // Quick: one horse per playing colour starts on its entry cell, and every home column starts locked.
  for (const color of sorted) at(horses, color)[0] = POS_START;
  return {
    colors: sorted,
    horses,
    kicks,
    turn: at(sorted, 0),
    phase: 'roll',
    dice: null,
    legalHorses: [],
    winner: null,
    variant,
    unlocked: COLORS.map(() => false),
    ...house,
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
  const next: GameState = { ...state, turn, phase: 'roll', dice: null, legalHorses: [] };
  if (state.houseRules?.tripleBonusForfeit) next.bonusStreak = extraRoll ? (state.bonusStreak ?? 0) + 1 : 0;
  return next;
}

export function applyRoll(state: GameState, dice: DiceValue): StepResult {
  if (state.phase !== 'roll') throw new Error('Cannot roll outside the roll phase');
  const bonus = dice === 1 || dice === 6;
  if (bonus && state.houseRules?.tripleBonusForfeit && (state.bonusStreak ?? 0) >= BONUS_STREAK_LIMIT - 1) {
    const turn = nextColor(state);
    return {
      state: { ...state, horses: cloneHorses(state.horses), turn, phase: 'roll', dice: null, legalHorses: [], bonusStreak: 0 },
      events: [
        { type: 'rolled', color: state.turn, dice, legalHorses: [], forfeit: true },
        { type: 'turn', color: turn, extraRoll: false },
      ],
    };
  }
  const legalHorses = legalHorsesFor(state.horses, state.turn, dice, isLocked(state, state.turn));
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
  const landing = landingFor(state.horses, color, horse, dice, isLocked(state, color));
  if (landing === null) throw new Error(`Horse ${horse} has no legal move`);

  const horses = cloneHorses(state.horses);
  const row = at(horses, color);
  const from = at(row, horse);
  row[horse] = landing.to;
  if (landing.kicked) at(horses, landing.kicked.color)[landing.kicked.horse] = POS_STABLE;

  const events: GameEvent[] = [
    { type: 'moved', color, horse, from, to: landing.to, kicked: landing.kicked },
  ];
  const kicks = { ...state.kicks } as Record<Color, number>;
  if (landing.kicked) kicks[color] = (kicks[color] ?? 0) + 1;
  const moved: GameState = { ...state, horses, kicks };
  if (state.variant === 'quick' && landing.kicked) {
    moved.unlocked = COLORS.map((c) => state.unlocked?.[c] === true || c === color);
  }
  // Classic: all four horses home. Quick: the first horse of any colour to enter its home column.
  if (state.variant === 'quick' ? isHome(landing.to) : row.every(isHome)) {
    events.push({ type: 'won', color });
    return {
      state: { ...moved, phase: 'finished', dice: null, legalHorses: [], winner: color },
      events,
    };
  }
  return { state: passTurn(moved, dice, events), events };
}

/**
 * A roll and, when `autoMove` and exactly one horse can move, that forced move in the same step
 * (events `rolled`, `moved`, then `turn` or `won`). With two or more legal horses the player still
 * chooses; with none the turn passes as in `applyRoll`. No rule differs from applying the two steps.
 */
export function rollAndSettle(state: GameState, dice: DiceValue, autoMove: boolean): StepResult {
  const rolled = applyRoll(state, dice);
  const only = rolled.state.legalHorses[0];
  if (!autoMove || rolled.state.phase !== 'move' || rolled.state.legalHorses.length !== 1 || only === undefined) return rolled;
  const moved = applyMove(rolled.state, only);
  return { state: moved.state, events: [...rolled.events, ...moved.events] };
}

/** Animated segments in `events`: one per roll and one per move. */
export function segmentsOf(events: readonly GameEvent[]): number {
  let n = 0;
  for (const e of events) if (e.type === 'rolled' || e.type === 'moved') n++;
  return n;
}

export const engine: RulesEngine = { createGame, applyRoll, applyMove, chooseCpuMove };
