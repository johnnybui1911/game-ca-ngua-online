import type { Color } from '../../../shared/game/types';
import type { TFunction } from '../i18n';

export const COLOR_NAMES: Record<Color, string> = {
  0: 'đỏ',
  1: 'xanh dương',
  2: 'vàng',
  3: 'xanh lá',
};

/** A colour's name in the player's language. */
export const colorName = (t: TFunction, color: Color): string => t(`color.${color}`);

export const COLOR_VARS: Record<Color, string> = {
  0: 'var(--horse-red)',
  1: 'var(--horse-blue)',
  2: 'var(--horse-yellow)',
  3: 'var(--horse-green)',
};
