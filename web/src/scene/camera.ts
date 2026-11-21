import type { Color } from '../../../shared/game/types';
import { SLAB_HALF, armDirection } from './layout';

/** Angle of the camera from straight above, radians, in a wide viewport. */
export const DEFAULT_POLAR = 0.95;
/** Tall viewports look down more steeply: less perspective inflation of the near edge, so the board can be bigger. */
const MIN_POLAR = 0.55;
/** Fraction of the half viewport the board may fill at the default view. */
const FILL = 0.96;

/** Default camera polar angle for a viewport aspect ratio (width / height). */
export function defaultPolar(aspect: number): number {
  return Math.min(DEFAULT_POLAR, Math.max(MIN_POLAR, MIN_POLAR + (aspect - 0.5) * 0.9));
}

/** Screen space (CSS px) covered by HUD panels at the top and bottom of the viewport. */
export interface HudInsets {
  top: number;
  bottom: number;
}

export const NO_INSETS: HudInsets = { top: 0, bottom: 0 };
/** The board never gets less than this share of the viewport height, however tall the HUD. */
const MIN_FREE = 0.3;

/**
 * The viewport band left between the HUD panels: `fraction` of the height, and
 * `shiftPx`, how far down the picture window must slide so the board centre
 * lands in the middle of that band instead of the viewport centre.
 */
export function freeBand(insets: HudInsets, viewportHeight: number): { fraction: number; shiftPx: number } {
  const h = Math.max(1, viewportHeight);
  let top = Math.max(0, insets.top);
  let bottom = Math.max(0, insets.bottom);
  const covered = top + bottom;
  if (covered > h * (1 - MIN_FREE)) {
    const k = (h * (1 - MIN_FREE)) / covered;
    top *= k;
    bottom *= k;
  }
  // The band centre is (bottom - top) / 2 above the viewport centre; a window moved down by that much shows content moved up.
  return { fraction: 1 - (top + bottom) / h, shiftPx: (bottom - top) / 2 };
}

/**
 * Smallest camera distance at which the whole slab is inside the free band
 * (`freeFraction` of the viewport height, centred on the board centre), for a
 * camera on an arm axis looking at the board centre. Exact corner
 * projection, so it holds for portrait and landscape alike.
 */
export function fitCameraDistance(aspect: number, verticalFovDeg: number, polar = defaultPolar(aspect), freeFraction = 1): number {
  const tanFull = Math.tan((verticalFovDeg * Math.PI) / 360);
  const tanV = tanFull * freeFraction;
  const tanH = tanFull * aspect;
  const sin = Math.sin(polar);
  const cos = Math.cos(polar);
  let need = 0;
  for (const sz of [-1, 1]) {
    // Corner (±SLAB_HALF, 0, sz·SLAB_HALF): camera-space x, y and the depth offset along the view axis.
    const x = SLAB_HALF;
    const y = SLAB_HALF * cos;
    const alongView = -sz * SLAB_HALF * sin;
    const dx = x / (FILL * tanH) - alongView;
    const dy = y / (FILL * tanV) - alongView;
    need = Math.max(need, dx, dy);
  }
  return need;
}

/** Camera position for a colour: on its arm axis, behind its stable side, `distance` from the centre. */
export function seatCameraPosition(color: Color, distance: number, polar = DEFAULT_POLAR): [number, number, number] {
  const dir = armDirection(color);
  const flat = distance * Math.sin(polar);
  return [dir.x * flat, distance * Math.cos(polar), dir.z * flat];
}
