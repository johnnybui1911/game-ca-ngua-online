/**
 * Abstract board model for cờ cá ngựa. Shared by the rules engine, the server
 * and the 3D scene, so none of them invents its own coordinates.
 *
 * Track: 56 cells in a loop, indexed 0..55 in travel direction.
 * Colour c enters the track on cell c*14 and travels 55 steps to its gate
 * cell (the cell just before its own entry cell). From the gate it climbs its
 * home column, steps 1..6.
 */

export const COLORS = [0, 1, 2, 3] as const;
/** 0 = red (đỏ), 1 = blue (xanh dương), 2 = yellow (vàng), 3 = green (xanh lá). Turn order is ascending. */
export type Color = (typeof COLORS)[number];

export const TRACK_LENGTH = 56;
export const CELLS_PER_COLOR = 14;
export const HORSES_PER_COLOR = 4;
export const HOME_STEPS = 6;

/** A horse still in its stable (chuồng). */
export const POS_STABLE = -1;
/** Track progress of a horse standing on its own entry cell. */
export const POS_START = 0;
/** Track progress of a horse standing on its gate cell, ready to climb. */
export const POS_GATE = 55;

/**
 * Horse position, relative to its own colour:
 *   -1        in the stable
 *   0..55     on the track, as progress from the colour's entry cell
 *   56..61    on the home column, step = pos - 55 (1..6)
 */
export type HorsePos = number;

/** Absolute track cell (0..55) of a horse of `color` at track progress `pos` (0..55). */
export function trackCell(color: Color, pos: HorsePos): number {
  return (color * CELLS_PER_COLOR + pos) % TRACK_LENGTH;
}

export function isOnTrack(pos: HorsePos): boolean {
  return pos >= POS_START && pos <= POS_GATE;
}

export function isHome(pos: HorsePos): boolean {
  return pos > POS_GATE;
}

/** Home column step (1..6) of a home position. */
export function homeStep(pos: HorsePos): number {
  return pos - POS_GATE;
}

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export type GamePhase =
  /** The current colour must roll. */
  | 'roll'
  /** The current colour rolled and has at least one legal move to choose. */
  | 'move'
  | 'finished';

export interface GameState {
  /** Colours taking part, ascending. Turn order follows this array. */
  colors: Color[];
  /** horses[color][horseIndex] = position. Colours not in `colors` hold four POS_STABLE entries. */
  horses: HorsePos[][];
  /** Colour whose turn it is. */
  turn: Color;
  phase: GamePhase;
  /** Value of the last roll of the current turn, null before the first roll of a turn. */
  dice: DiceValue | null;
  /** Horse indices of `turn` that may move with `dice`. Empty unless phase is 'move'. */
  legalHorses: number[];
  winner: Color | null;
  /**
   * Rule variant of this game. Absent in games stored before variants existed: classic.
   * `quick` is the quick match: see the "Quick variant" block below.
   */
  variant?: RuleVariant;
  /** Quick variant only, indexed by colour: true once that colour has kicked an opponent horse (its home column is open). */
  unlocked?: boolean[];
  /** House rules this game was started with. Absent in games without any (and in games stored before they existed). */
  houseRules?: HouseRules;
  /** Only with `houseRules.tripleBonusForfeit`: rolls of 1 or 6 in a row the colour on turn has made in this turn. */
  bonusStreak?: number;
}

export type RuleVariant = 'classic' | 'quick';

/**
 * Optional rules on top of the variant, chosen per room. A game created without them plays none; a room's defaults
 * are in `DEFAULT_ROOM_SETTINGS` (shared/protocol.ts).
 */
export interface HouseRules {
  /** The third roll of 1 or 6 in a row within one turn is void: no move, and the turn passes. */
  tripleBonusForfeit: boolean;
}

/** Rolls of 1 or 6 in a row after which, under `tripleBonusForfeit`, the turn is lost. */
export const BONUS_STREAK_LIMIT = 3;

export type GameEvent =
  /** `forfeit`: the roll was the `BONUS_STREAK_LIMIT`-th 1 or 6 in a row under `tripleBonusForfeit`; it moves nothing and the turn passes. */
  | { type: 'rolled'; color: Color; dice: DiceValue; legalHorses: number[]; forfeit?: true }
  | {
      type: 'moved';
      color: Color;
      horse: number;
      from: HorsePos;
      to: HorsePos;
      /** Opponent horse sent back to its stable by this move. */
      kicked: { color: Color; horse: number; from: HorsePos } | null;
    }
  /** The turn passed to `color` (also emitted when the same colour rolls again). */
  | { type: 'turn'; color: Color; extraRoll: boolean }
  | { type: 'won'; color: Color };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Rules (fixed for this product):
 * 1. A horse leaves the stable only on a roll of 1 or 6, landing on progress 0.
 *    The entry cell must be empty or hold an opponent horse (kicked); it may
 *    not hold a horse of the same colour.
 * 2. On the track a horse moves exactly `dice` cells. Every cell passed over
 *    must be empty (no jumping over any horse). The landing cell must be empty
 *    or hold an opponent horse, which is kicked back to its stable. A horse
 *    never moves past its gate (progress 55).
 * 3. From the gate, a roll of n climbs to home step n, provided home steps
 *    1..n hold no horse of the same colour.
 * 4. On the home column a horse on step k moves to step k+1 only on a roll of
 *    exactly k+1, and only if that step is empty.
 * 5. A roll of 1 or 6 grants another roll after the move (or after no legal
 *    move). Any other roll ends the turn once the move is made or no move is
 *    legal. House rule `tripleBonusForfeit`: the third 1 or 6 in a row within
 *    one turn is void; nothing moves and the turn passes to the next colour.
 *    Moves made with the two rolls before it stand.
 * 6. If at least one move is legal the player must make one of them.
 * 7. The first colour with all four horses on its home column wins.
 *
 * Quick variant (`GameState.variant === 'quick'`, the "ván nhanh"): rules 1-6 are unchanged, except:
 * a. Each colour starts with one horse already on its entry cell (progress 0); the other three are in the stable.
 * b. A colour's home column is locked until that colour has kicked at least one opponent horse
 *    (any kick counts, including one made by leaving the stable onto an occupied entry cell). While it
 *    is locked a horse still moves up to its gate (progress 55) but cannot climb, so a horse on the
 *    gate has no legal move.
 * c. Rule 7 becomes: the first horse of any colour to enter its home column (any step) wins at once.
 */
export interface RulesEngine {
  createGame(colors: Color[], variant?: RuleVariant, houseRules?: HouseRules): GameState;
  /** Apply a roll for the current colour. Phase must be 'roll'. */
  applyRoll(state: GameState, dice: DiceValue): StepResult;
  /** Move one of `state.legalHorses`. Phase must be 'move'. */
  applyMove(state: GameState, horse: number): StepResult;
  /** Horse index the CPU moves. Phase must be 'move'. */
  chooseCpuMove(state: GameState): number;
}
