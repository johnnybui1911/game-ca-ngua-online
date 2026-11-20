import { landingFor } from '../../../shared/game/engine';
import { POS_GATE, POS_STABLE, type GameState } from '../../../shared/game/types';
import { COLOR_NAMES } from './colors';

/**
 * Button label for moving `horse` of the colour on turn, e.g. "Quân 2: ra quân",
 * "Quân 1: đi 4 ô", "Quân 3: lên bậc 5", with ", đá quân đỏ" when it kicks.
 * Falls back to the bare horse number if the move is not legal.
 */
export function describeMove(game: GameState, horse: number): string {
  const label = `Quân ${horse + 1}`;
  const dice = game.dice;
  const from = game.horses[game.turn]?.[horse];
  if (dice === null || from === undefined) return label;
  const landing = landingFor(game.horses, game.turn, horse, dice);
  if (landing === null) return label;
  let action: string;
  if (from === POS_STABLE) action = 'ra quân';
  else if (landing.to > POS_GATE) action = `lên bậc ${landing.to - POS_GATE}`;
  else action = `đi ${dice} ô`;
  const kick = landing.kicked ? `, đá quân ${COLOR_NAMES[landing.kicked.color]}` : '';
  return `${label}: ${action}${kick}`;
}
