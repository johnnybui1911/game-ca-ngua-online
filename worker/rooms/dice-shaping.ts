/**
 * Dice shaping, while `DICE_SHAPING` is on. The server keeps a little memory per room and narrows the faces the
 * next roll is drawn from; the chosen face is still drawn uniformly at random among them.
 * - A CPU seat that just rolled a 1 or 6 (and so rolls again in the same turn) cannot roll that face again:
 *   no 6-6 and no 1-1, while 6-1 and 1-6 stay possible.
 * - A human seat (also when the server plays for it) whose colour has no horse on the track, after two turns in a
 *   row that began that way and brought no 1 or 6, rolls a 1 or a 6 on the first roll of the third turn.
 * - For every seat (CPU, person, or a person the server plays for): when the first two rolls of a turn were both a
 *   1 or a 6 (6-1, 1-6, 6-6, 1-1), the third roll cannot be a 1 or a 6; it is drawn from 2..5.
 * Nothing else changes: other seats, other rolls, and every roll while the switch is off are uniform over 1..6.
 */
import { DICE_SHAPING } from '../../shared/experiments';
import { isOnTrack, type Color, type DiceValue, type GameState } from '../../shared/game/types';
import type { RoomState } from './room-state';

/** What the dice remember within one game; absent in rooms stored before the experiment, and reset with each game. */
export interface DiceMemory {
  /**
   * The 1 or 6 the colour on turn rolled last, while that turn goes on; absent once a turn ends. `count` is how many
   * 1s/6s in a row it has rolled this turn; rooms stored before it existed have none, which counts as 1.
   */
  bonus?: { color: Color; dice: 1 | 6; count?: number };
  /** Per colour: turns in a row that began with no horse of it on the track and brought no 1 or 6. */
  dry?: Partial<Record<Color, number>>;
}

export const ALL_FACES: readonly DiceValue[] = [1, 2, 3, 4, 5, 6];
const ENTRY_FACES: readonly DiceValue[] = [1, 6];
/** Turns without a 1 or 6, all horses off the track, after which a person's next turn starts with one. */
export const DRY_TURNS_BEFORE_ENTRY = 2;
/** After this many 1s/6s in a row within a turn, the next roll cannot be a 1 or 6. */
export const BONUS_ROLLS_BEFORE_PLAIN = 2;
const PLAIN_FACES: readonly DiceValue[] = [2, 3, 4, 5];

/** A face drawn uniformly from `faces`; bytes that would favour some faces are rejected. */
export function drawFrom<T>(
  faces: readonly T[],
  fill: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): T {
  const limit = 256 - (256 % faces.length);
  const buf = new Uint8Array(1);
  for (;;) {
    fill(buf);
    const b = buf[0] ?? 255;
    const face = faces[b % faces.length];
    if (b < limit && face !== undefined) return face;
  }
}

function hasHorseOnTrack(game: GameState, color: Color): boolean {
  return (game.horses[color] ?? []).some(isOnTrack);
}

/** The faces the next roll of the colour on turn is drawn from. */
export function facesFor(state: RoomState, game: GameState): readonly DiceValue[] {
  if (!DICE_SHAPING) return ALL_FACES;
  const color = game.turn;
  const occupant = state.seats.find((s) => s.color === color)?.occupant;
  const bonus = state.diceMemory?.bonus;
  const midTurn = bonus?.color === color;
  if (midTurn && (bonus.count ?? 1) >= BONUS_ROLLS_BEFORE_PLAIN) return PLAIN_FACES;
  if (occupant?.kind === 'cpu') return midTurn ? ALL_FACES.filter((face) => face !== bonus.dice) : ALL_FACES;
  if (occupant?.kind === 'human' && !midTurn && !hasHorseOnTrack(game, color)) {
    if ((state.diceMemory?.dry?.[color] ?? 0) >= DRY_TURNS_BEFORE_ENTRY) return ENTRY_FACES;
  }
  return ALL_FACES;
}

/** Updates the memory after the colour on turn in `before` rolled `dice` and the game moved on to `after`. */
export function rememberRoll(state: RoomState, before: GameState, dice: DiceValue, after: GameState): void {
  if (!DICE_SHAPING) return;
  const color = before.turn;
  const memory: DiceMemory = state.diceMemory ?? {};
  const prev = memory.bonus?.color === color ? (memory.bonus.count ?? 1) : 0;
  if (prev === 0) {
    // The first roll of a turn.
    const dry = { ...memory.dry };
    dry[color] = hasHorseOnTrack(before, color) || dice === 1 || dice === 6 ? 0 : (dry[color] ?? 0) + 1;
    memory.dry = dry;
  }
  if ((dice === 1 || dice === 6) && after.phase !== 'finished' && after.turn === color)
    memory.bonus = { color, dice, count: prev + 1 };
  else delete memory.bonus;
  state.diceMemory = memory;
}
