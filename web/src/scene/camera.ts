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
 * Screen space (CSS px) covered by panels at the edges of the viewport: the match HUD strips at the
 * top and bottom, the home page's title and call-to-action band, a glass panel beside the board.
 */
export interface HudInsets {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
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

/** `freeBand` across the width: the band left between side panels, and how far right the picture window slides. */
export function freeBandX(insets: HudInsets, viewportWidth: number): { fraction: number; shiftPx: number } {
  return freeBand({ top: insets.left ?? 0, bottom: insets.right ?? 0 }, viewportWidth);
}

/**
 * Smallest camera distance at which the whole slab is inside the free band
 * (`freeFraction` of the viewport height and `freeFractionX` of its width, centred on the board
 * centre), for a camera on an arm axis looking at the board centre. Exact corner
 * projection, so it holds for portrait and landscape alike.
 */
export function fitCameraDistance(
  aspect: number,
  verticalFovDeg: number,
  polar = defaultPolar(aspect),
  freeFraction = 1,
  freeFractionX = 1,
): number {
  const tanFull = Math.tan((verticalFovDeg * Math.PI) / 360);
  const tanV = tanFull * freeFraction;
  const tanH = tanFull * aspect * freeFractionX;
  return fitTurned(tanH, tanV, polar, 0);
}

/**
 * Distance needed with the board turned by `turn` radians about its centre, relative to a camera on an arm axis.
 * Exact projection of the four slab corners into the band whose half extents have tangents `tanH` and `tanV`.
 */
function fitTurned(tanH: number, tanV: number, polar: number, turn: number): number {
  const sin = Math.sin(polar);
  const cos = Math.cos(polar);
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  let need = 0;
  for (const [cx, cz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    // Corner in a frame where the camera sits over +z: across the view, up the view, and towards the camera.
    const across = SLAB_HALF * (cx * c + cz * s);
    const toward = SLAB_HALF * (cz * c - cx * s);
    const alongView = -toward * sin;
    const dx = Math.abs(across) / (FILL * tanH) - alongView;
    const dy = Math.abs(toward * cos) / (FILL * tanV) - alongView;
    need = Math.max(need, dx, dy);
  }
  return need;
}

/**
 * `fitCameraDistance` for a camera that may stand anywhere around the board (the home orbit, a
 * view the player dragged): the slab stays inside the free band at every angle.
 */
export function fitOrbitDistance(aspect: number, verticalFovDeg: number, polar = defaultPolar(aspect), freeFraction = 1, freeFractionX = 1): number {
  const tanFull = Math.tan((verticalFovDeg * Math.PI) / 360);
  const tanV = tanFull * freeFraction;
  const tanH = tanFull * aspect * freeFractionX;
  let need = 0;
  // The slab is square: a quarter turn covers every angle.
  for (let i = 0; i < 12; i++) need = Math.max(need, fitTurned(tanH, tanV, polar, (i * Math.PI) / 24));
  return need;
}

/** Camera position for a colour: on its arm axis, behind its stable side, `distance` from the centre. */
export function seatCameraPosition(color: Color, distance: number, polar = DEFAULT_POLAR): [number, number, number] {
  const dir = armDirection(color);
  const flat = distance * Math.sin(polar);
  return [dir.x * flat, distance * Math.cos(polar), dir.z * flat];
}

/** Where the camera is around the board centre: angles in radians, `zoom` as a multiple of the fitted distance. */
export interface CameraPose {
  /** Angle around the vertical axis, 0 on +z, growing towards +x. */
  azimuth: number;
  /** Angle from straight above. */
  polar: number;
  zoom: number;
}

/** Seconds for one turn of the home page's slow orbit. */
export const HOME_ORBIT_SECONDS = 140;
/** Seconds the camera takes from wherever it is to a seat when a match takes the board. */
export const SEAT_FLIGHT_SECONDS = 1.6;
/** Time constant, seconds, with which the framing follows panels opening and closing. */
export const FRAMING_SECONDS = 0.28;

/** The pose of a camera at `position`, relative to the fitted distance `fit`. */
export function poseOf(position: readonly [number, number, number], fit: number): CameraPose {
  const [x, y, z] = position;
  const r = Math.max(1e-6, Math.hypot(x, y, z));
  return { azimuth: Math.atan2(x, z), polar: Math.acos(Math.min(1, Math.max(-1, y / r))), zoom: r / fit };
}

/** The default view of a colour's seat: behind its stable, at the fitted distance. */
export function seatPose(color: Color, polar = DEFAULT_POLAR): CameraPose {
  const dir = armDirection(color);
  return { azimuth: Math.atan2(dir.x, dir.z), polar, zoom: 1 };
}

/** The home page's opening view: between two stables, so no single colour looks like the player's own. */
export function homePose(polar = DEFAULT_POLAR): CameraPose {
  return { azimuth: seatPose(0, polar).azimuth + Math.PI / 5, polar, zoom: 1 };
}

/** Pose `t` (0..1) of the way from one pose to another, turning the shorter way round the board. */
export function mixPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const k = Math.min(1, Math.max(0, t));
  const turn = Math.atan2(Math.sin(to.azimuth - from.azimuth), Math.cos(to.azimuth - from.azimuth));
  return {
    azimuth: from.azimuth + turn * k,
    polar: from.polar + (to.polar - from.polar) * k,
    zoom: from.zoom + (to.zoom - from.zoom) * k,
  };
}

/** Camera position of a pose at the fitted distance `fit`. */
export function posePosition(pose: CameraPose, fit: number): [number, number, number] {
  const r = pose.zoom * fit;
  const flat = r * Math.sin(pose.polar);
  return [flat * Math.sin(pose.azimuth), r * Math.cos(pose.polar), flat * Math.cos(pose.azimuth)];
}

/** Share of the remaining distance a value following its target covers in `dt` seconds. */
export function followShare(dt: number, seconds = FRAMING_SECONDS): number {
  return seconds <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / seconds);
}

/** Far plane of the match camera; kept short for depth precision. */
export const BASE_FAR = 80;
/** Radius of the lit floor around the board that must stay inside the far plane. */
const FLOOR_RADIUS = 32;

/**
 * Far plane for a camera `distance` from the board centre: the match value, until the camera
 * stands so far back (a tall phone on the home orbit) that the lit floor behind the board would be cut off.
 */
export function farPlane(distance: number): number {
  return Math.max(BASE_FAR, Math.ceil(distance + FLOOR_RADIUS));
}
