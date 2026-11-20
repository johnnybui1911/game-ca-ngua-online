import type { Color } from '../../../shared/game/types';

/** Horse colours; the app stylesheet uses exactly these values. */
export const HORSE_COLORS: Record<Color, string> = {
  0: '#D9392B', // đỏ
  1: '#2B6FD9', // xanh dương
  2: '#E8B923', // vàng
  3: '#2E9E57', // xanh lá
};

export const COLOR_NAMES: Record<Color, string> = {
  0: 'Đỏ',
  1: 'Xanh dương',
  2: 'Vàng',
  3: 'Xanh lá',
};

/** Warm neutrals of the board itself. */
export const BOARD = {
  wood: '#8a5a35',
  woodDark: '#5b3720',
  felt: '#e9d9b4',
  cell: '#f6ecd2',
  cellRim: '#b9975f',
  ink: '#4a3320',
  ground: '#2a1c14',
} as const;
