import type { Color } from '../../../shared/game/types';

/** Horse colours; the app stylesheet uses exactly these values. */
export const HORSE_COLORS: Record<Color, string> = {
  0: '#D9392B', // đỏ
  1: '#2B6FD9', // xanh dương
  2: '#E8B923', // vàng
  3: '#2E9E57', // xanh lá
};

/** Deeper tone of each colour: the badge behind a horse's number or name, under white text. */
export const HORSE_BADGE: Record<Color, string> = {
  0: '#b52a1e',
  1: '#1f56b3',
  2: '#9a6a00',
  3: '#1f7a41',
};

/** Wood stain per colour: the colour multiplies the grey grain of the horse model. */
export const HORSE_STAIN: Record<Color, string> = {
  0: '#ff7a5c',
  1: '#6fa3ff',
  2: '#ffd058',
  3: '#6fd48c',
};

export const COLOR_NAMES: Record<Color, string> = {
  0: 'Đỏ',
  1: 'Xanh dương',
  2: 'Vàng',
  3: 'Xanh lá',
};

/** Warm neutrals of the board itself. */
export const BOARD = {
  felt: '#e9d9b4',
  cell: '#f6ecd2',
  cellRim: '#b9975f',
  ink: '#4a3320',
  ground: '#2a1c14',
} as const;
