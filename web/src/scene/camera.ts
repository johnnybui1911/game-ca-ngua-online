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

/** Insets reserved for one viewport size. */
export interface ReservedInsets extends HudInsets {
  width: number;
  height: number;
}

/**
 * Reserve the largest panel heights seen at this viewport size, so panel
 * content coming and going (an error line, wrapping move buttons) never moves
 * the board. A different viewport size starts over from the new measurement.
 */
export function reserveInsets(prev: ReservedInsets | null, measured: HudInsets, width: number, height: number): ReservedInsets {
  if (!prev || prev.width !== width || prev.height !== height) return { width, height, ...measured };
  const top = Math.max(prev.top, measured.top);
  const bottom = Math.max(prev.bottom, measured.bottom);
  return top === prev.top && bottom === prev.bottom ? prev : { width, height, top, bottom };
}

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

/** Share of the way to the contact point the camera moves at full close-up. */
export const CLOSE_UP_DOLLY = 0.22;
/** Share of the way from the board centre to the contact point the camera's aim moves at full close-up. */
export const CLOSE_UP_AIM = 0.55;
/** Height above the board the close-up looks at: about the middle of a horse. */
export const CLOSE_UP_HEIGHT = 0.6;
/** Largest shake offset, board units, in the camera's own right/up plane. */
export const SHAKE_AMPLITUDE = 0.09;

/**
 * Camera framing for a close-up on ground point (`focusX`, `focusZ`), blended by `weight` (0 = the framing given
 * by `position` looking at the board centre, 1 = full close-up). Writes the camera position to `out[0..2]` and
 * the point to look at to `out[3..5]`.
 */
export function closeUpFraming(
  out: number[],
  positionX: number,
  positionY: number,
  positionZ: number,
  focusX: number,
  focusZ: number,
  weight: number,
): number[] {
  const dolly = CLOSE_UP_DOLLY * weight;
  const aim = CLOSE_UP_AIM * weight;
  out[0] = positionX + (focusX - positionX) * dolly;
  out[1] = positionY + (CLOSE_UP_HEIGHT - positionY) * dolly;
  out[2] = positionZ + (focusZ - positionZ) * dolly;
  out[3] = focusX * aim;
  out[4] = CLOSE_UP_HEIGHT * aim;
  out[5] = focusZ * aim;
  return out;
}

/**
 * Camera shake `time` seconds into a shake lasting `seconds`: a decaying wobble in the camera's right (`out[0]`)
 * and up (`out[1]`) directions, zero outside 0..seconds.
 */
export function shakeOffset(out: number[], time: number, seconds: number): number[] {
  if (time < 0 || time >= seconds) {
    out[0] = 0;
    out[1] = 0;
    return out;
  }
  const fade = 1 - time / seconds;
  const size = SHAKE_AMPLITUDE * fade * fade;
  out[0] = size * Math.sin(time * 83);
  out[1] = size * Math.cos(time * 67);
  return out;
}
