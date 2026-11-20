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

/**
 * Smallest camera distance at which the whole slab is inside the viewport, for
 * a camera on an arm axis looking at the board centre. Exact corner
 * projection, so it holds for portrait and landscape alike.
 */
export function fitCameraDistance(aspect: number, verticalFovDeg: number, polar = defaultPolar(aspect)): number {
  const tanV = Math.tan((verticalFovDeg * Math.PI) / 360);
  const tanH = tanV * aspect;
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
