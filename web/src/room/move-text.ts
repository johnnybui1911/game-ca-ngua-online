import { isLocked, landingFor } from '../../../shared/game/engine';
import { POS_GATE, POS_STABLE, type GameState } from '../../../shared/game/types';
import { translatorFor, type TFunction } from '../i18n';
import { colorName } from './colors';

/**
 * Button label for moving `horse` of the colour on turn, e.g. "Quân 2: ra quân",
 * "Quân 1: đi 4 ô", "Quân 3: lên bậc 5", with ", đá quân đỏ" when it kicks. A renamed horse
 * is called by its name ("Xích Thố: đi 4 ô"). Falls back to the bare label if the move is not legal.
 */
export function describeMove(game: GameState, horse: number, names?: readonly string[], t: TFunction = translatorFor('vi')): string {
  const label = names?.[horse] || t('move.horse', { n: horse + 1 });
  const dice = game.dice;
  const from = game.horses[game.turn]?.[horse];
  if (dice === null || from === undefined) return label;
  const landing = landingFor(game.horses, game.turn, horse, dice, isLocked(game, game.turn));
  if (landing === null) return label;
  let action: string;
  if (from === POS_STABLE) action = t('move.out');
  else if (landing.to > POS_GATE) action = t('move.climb', { step: landing.to - POS_GATE });
  else action = t('move.walk', { n: dice });
  const kick = landing.kicked ? t('move.kick', { color: colorName(t, landing.kicked.color) }) : '';
  return `${label}: ${action}${kick}`;
}
