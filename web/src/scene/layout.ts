/**
 * Mapping from the abstract board model (shared/game/types.ts) to 3D ground
 * coordinates. Pure and table driven so the scene, the animation director and
 * the tests all read the same numbers.
 *
 * World: y is up, the board top is y = 0, one cell is one unit. Colour 0's arm
 * points to +z (towards the default camera), colours then follow clockwise
 * seen from above: 1 at -x, 2 at -z, 3 at +x.
 *
 * One arm is laid out in "arm space" (X right, Y up, clockwise travel) and
 * colour c's arm is that layout turned a quarter turn clockwise c times:
 *   - a colour's 14 track cells, in travel order, are the six cells of the
 *     counter-clockwise neighbour arm's near lane (entry first), the corner
 *     and the seven cells of the up arm's left lane ending at the tip cell
 *     of the middle lane, which is the colour's gate (progress 55);
 *   - the entry cell (progress 0) follows the gate near the tip row, and the
 *     home column runs from the gate straight to the centre.
 * Track lanes are offset outward for visual clearance while cell indices and game rules remain unchanged.
 */
import {
  CELLS_PER_COLOR,
  COLORS,
  HOME_STEPS,
  HORSES_PER_COLOR,
  POS_GATE,
  TRACK_LENGTH,
  trackCell,
} from '../../../shared/game/types';
import type { Color, HorsePos } from '../../../shared/game/types';

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/** Arm length: lane cells from the centre block to the tip. */
const ARM = 7;
export const INLAY_HALF_WIDTH = 1.74;
export const INLAY_HALF_LENGTH = 7.92;
export const LANE_HALF_WIDTH = 0.62;
export const LANE_END = 6.66;
/** Outward shift of track lanes from home columns, in board units. */
export const TRACK_OUTSET = (INLAY_HALF_WIDTH + LANE_HALF_WIDTH) / 2 - 1;
/** Centre the gate between the end of the coloured lane and the inlay edge. */
export const GATE_DISTANCE = (INLAY_HALF_LENGTH + LANE_END) / 2;
/** Half extent of the playable cross, in cells, measured to the tip row centre. */
export const BOARD_HALF = ARM + 0.5;
/** Half side of the wooden slab. */
export const SLAB_HALF = 8.4;

/** Rotate arm-space (X,Y) a quarter turn clockwise `turns` times, then project to world. */
function toWorld(color: number, armX: number, armY: number): Vec2 {
  let x = armX;
  let y = armY;
  for (let i = 0; i < color; i++) {
    const nx = y;
    y = -x;
    x = nx;
  }
  // Colour 0's arm (+Y in arm space) must face the camera at +z; a half turn
  // of the arm-space picture seen from above gives world x = -X, z = Y.
  return { x: x === 0 ? 0 : -x, z: y };
}

/** Colour 0's track cell k (0..13) in arm space. */
function armTrackCell(k: number): [number, number] {
  if (k === 0) return [-GATE_DISTANCE, 1 + TRACK_OUTSET];
  if (k < 6) return [-ARM + k - TRACK_OUTSET, 1 + TRACK_OUTSET];
  if (k === 12) return [-1 - TRACK_OUTSET, GATE_DISTANCE];
  if (k < 13) return [-1 - TRACK_OUTSET, 1 + (k - 6) + TRACK_OUTSET];
  return [0, GATE_DISTANCE];
}

export const TRACK: readonly Vec2[] = Array.from({ length: TRACK_LENGTH }, (_, i) => {
  // Cells c*14 .. c*14+13 end at the tip of the next colour's arm (its gate).
  const [x, y] = armTrackCell(i % CELLS_PER_COLOR);
  return toWorld((Math.floor(i / CELLS_PER_COLOR) + 1) % COLORS.length, x, y);
});

/** HOME[color][step - 1], step 1..6, step 1 right next to the gate. */
export const HOME: readonly (readonly Vec2[])[] = COLORS.map((color) =>
  Array.from({ length: HOME_STEPS }, (_, s) => toWorld(color, 0, ARM - 1 - s)),
);

/** Centre of each colour's stable tray, in the corner next to its entry cell. */
const STABLE_CENTER = 4.9;
export const STABLE_CENTERS: readonly Vec2[] = COLORS.map((color) =>
  toWorld(color, STABLE_CENTER, STABLE_CENTER),
);
export const STABLE_TRAY_SIZE = 4.4;
const SLOT_OFFSET = 0.95;

/** STABLE[color][horse]: 2x2 grid of parking slots inside the tray. */
export const STABLE: readonly (readonly Vec2[])[] = COLORS.map((color) =>
  Array.from({ length: HORSES_PER_COLOR }, (_, h) =>
    toWorld(
      color,
      STABLE_CENTER + (h % 2 === 0 ? -SLOT_OFFSET : SLOT_OFFSET),
      STABLE_CENTER + (h < 2 ? SLOT_OFFSET : -SLOT_OFFSET),
    ),
  ),
);

/** Where a colour's die comes to rest: just outside the stable tray, towards the centre. */
export const DIE_REST: readonly Vec2[] = COLORS.map((color) => toWorld(color, 2.55, 3.4));

/** Ground position of a horse of `color` at model position `pos`. */
export function horseGround(color: Color, horse: number, pos: HorsePos): Vec2 {
  if (pos < 0) return stableSlot(color, horse);
  if (pos <= POS_GATE) return trackPosition(trackCell(color, pos));
  return homePosition(color, pos - POS_GATE);
}

/** How much each home step rises above the one before it: the home column is a staircase up to the centre. */
export const STAIR_RISE = 0.12;

/** Height of the ground a horse at model position `pos` stands on, above the board top. */
export function groundHeight(pos: HorsePos): number {
  return pos > POS_GATE ? (pos - POS_GATE) * STAIR_RISE : 0;
}

export function trackPosition(cell: number): Vec2 {
  const v = TRACK[cell];
  if (!v) throw new RangeError(`Track cell out of range: ${cell}`);
  return v;
}

export function homePosition(color: Color, step: number): Vec2 {
  const v = HOME[color]?.[step - 1];
  if (!v) throw new RangeError(`Home step out of range: ${color}/${step}`);
  return v;
}

export function stableSlot(color: Color, horse: number): Vec2 {
  const v = STABLE[color]?.[horse];
  if (!v) throw new RangeError(`Stable slot out of range: ${color}/${horse}`);
  return v;
}

/** Yaw (rotation about y, model faces +z) pointing from `a` to `b`. */
export function yawBetween(a: Vec2, b: Vec2): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/**
 * Yaw a resting horse faces: along the direction of travel on the track, then
 * towards the board centre on the home column and in the stable.
 */
export function restYaw(color: Color, horse: number, pos: HorsePos): number {
  const here = horseGround(color, horse, pos);
  if (pos >= 0 && pos < POS_GATE) {
    return yawBetween(here, horseGround(color, horse, pos + 1));
  }
  return Math.atan2(-here.x, -here.z);
}

/** Camera azimuth direction: the unit vector from the centre towards a colour's arm tip. */
export function armDirection(color: Color): Vec2 {
  const tip = toWorld(color, 0, 1);
  return tip;
}

/** The base radius of a cell disc, including its outer rim. */
export const CELL_RADIUS = 0.5;

/** Top of the inlay and the footprints of the stairs and centre dais, in board units. */
export const INLAY_TOP = 0.04;
export const TREAD_WIDTH = 0.9;
export const DAIS_WIDTH = 0.88;
/** Scale of the floating medallion, keeping it clear of the full-size home discs. */
export const HUB_SCALE = 0.78;
/** Outer radius of the gold ring around the floating centre medallion. */
export const HUB_RING_RADIUS = 0.55 * HUB_SCALE;

/**
 * Height above the board top of the tallest stair tread, or the dais in the centre, that a disc of `radius`
 * centred on ground point (`x`, `z`) touches: 0 where it is clear of all of them. The treads run along each
 * colour's home column, `TREAD_WIDTH` wide and one cell long, and rise by `STAIR_RISE` with every step.
 */
export function obstacleHeight(x: number, z: number, radius: number): number {
  let top = 0;
  const daisReach = DAIS_WIDTH / 2 + radius;
  if (Math.abs(x) < daisReach && Math.abs(z) < daisReach) top = INLAY_TOP + (HOME_STEPS + 1) * STAIR_RISE;
  for (const color of COLORS) {
    const dir = armDirection(color);
    const steps = HOME[color]!;
    for (let i = steps.length - 1; i >= 0; i--) {
      const height = INLAY_TOP + (i + 1) * STAIR_RISE;
      // Higher treads come last in a column, so a tread that cannot beat what is found is not worth testing.
      if (height <= top) break;
      const c = steps[i]!;
      const along = (x - c.x) * dir.x + (z - c.z) * dir.z;
      const across = (x - c.x) * dir.z - (z - c.z) * dir.x;
      if (Math.abs(along) < 0.5 + radius && Math.abs(across) < TREAD_WIDTH / 2 + radius) {
        top = height;
        break;
      }
    }
  }
  return top;
}
