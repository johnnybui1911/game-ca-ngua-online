/**
 * Where every piece of the living-room set stands, and the sight-line check that keeps the
 * set out of the way of the board. Pure and table driven, like the board layout.
 *
 * The board lies on a low lacquer platform. Each of the four sides carries the same tableau,
 * laid out for the player sitting opposite it: an offering at the centre, two lanterns and a
 * pair of couplets behind it, and a vase of blossom on each corner. A player looks down at the
 * board, so the far side shows at the top of the picture, the two neighbouring sides at its left
 * and right edges, and the near side stays below the frame.
 */
import { COLORS } from '../../../../shared/game/types';
import type { Color } from '../../../../shared/game/types';
import { SLAB_HALF, armDirection } from '../layout';

/** Top of the platform: a hair under the board slab and the floor light of the render pipeline. */
export const TABLE_TOP_Y = -0.76;
/** Half side of the platform top. */
export const TABLE_HALF = 19.5;
/** The tiled floor the platform stands on. */
export const FLOOR_Y = -4.4;

export type PieceKind = 'offering' | 'lantern' | 'couplet' | 'blossom';

export interface SetPiece {
  kind: PieceKind;
  /** Seat whose player faces this piece across the board; for a blossom, the corner index. */
  side: Color;
  /** Which of the kind's looks to use (offering type, couplet line, blossom colour). */
  variant: number;
  x: number;
  z: number;
  /** Yaw that turns the piece's front (+z) towards the board. */
  yaw: number;
  /** Bounding cylinder, standing on the platform top. */
  radius: number;
  height: number;
}

const OFFERING_DEPTH = 14.6;
const LANTERN_ACROSS = 4.4;
const LANTERN_DEPTH = 16.2;
const COUPLET_ACROSS = 8.2;
const COUPLET_DEPTH = 15.6;
const BLOSSOM_CORNER = 15.2;

/** How far a lantern hangs in front of its stand, and how high above the platform top. */
export const LANTERN_REACH = 1.5;
export const LANTERN_HEIGHT = 2.5;

/** Ground point of a side's tableau: `depth` away from the centre, `across` to the facing player's right. */
function sidePoint(side: Color, across: number, depth: number): { x: number; z: number } {
  const arm = armDirection(side);
  // Away from the seat, and that direction turned a quarter to the viewer's right.
  const dx = -arm.x;
  const dz = -arm.z;
  return { x: dx * depth - dz * across, z: dz * depth + dx * across };
}

function sideYaw(side: Color): number {
  const arm = armDirection(side);
  return Math.atan2(arm.x, arm.z);
}

function buildPieces(): SetPiece[] {
  const out: SetPiece[] = [];
  for (const side of COLORS) {
    const yaw = sideYaw(side);
    out.push({ kind: 'offering', side, variant: side, ...sidePoint(side, 0, OFFERING_DEPTH), yaw, radius: 2.21, height: 3.96 });
    for (const hand of [-1, 1]) {
      out.push({ kind: 'lantern', side, variant: 0, ...sidePoint(side, hand * LANTERN_ACROSS, LANTERN_DEPTH), yaw, radius: 0.9, height: LANTERN_HEIGHT + 2.2 });
      // The first line of a couplet hangs on the reader's right.
      out.push({ kind: 'couplet', side, variant: hand > 0 ? 0 : 1, ...sidePoint(side, hand * COUPLET_ACROSS, COUPLET_DEPTH), yaw, radius: 1.2, height: 4.8 });
    }
    // One corner per side, to the facing player's left; yellow and pink alternate around the platform.
    const corner = sidePoint(side, -BLOSSOM_CORNER, BLOSSOM_CORNER);
    out.push({ kind: 'blossom', side, variant: side % 2, ...corner, yaw: Math.atan2(-corner.x, -corner.z), radius: 2.9, height: 5.6 });
  }
  return out;
}

export const SET_PIECES: readonly SetPiece[] = buildPieces();

export function piecesOf(kind: PieceKind): SetPiece[] {
  return SET_PIECES.filter((p) => p.kind === kind);
}

export type Point3 = readonly [number, number, number];

/** Centre of the paper body of the lantern on a stand. */
export function lanternCentre(stand: SetPiece): Point3 {
  return [
    stand.x + Math.sin(stand.yaw) * LANTERN_REACH,
    TABLE_TOP_Y + LANTERN_HEIGHT,
    stand.z + Math.cos(stand.yaw) * LANTERN_REACH,
  ];
}

export const LANTERN_CENTRES: readonly Point3[] = piecesOf('lantern').map(lanternCentre);

/** Where the warm light of each side's two lanterns is gathered into one lamp. */
export const SIDE_LIGHTS: readonly Point3[] = COLORS.map((side) => {
  const p = sidePoint(side, 0, LANTERN_DEPTH - LANTERN_REACH);
  return [p.x, TABLE_TOP_Y + LANTERN_HEIGHT, p.z];
});

/** Height above the board top that must stay in view: a standing horse and its base. */
export const PROTECTED_HEIGHT = 2;

/**
 * Whether a point of the set hides part of the board from an eye: the sight line through the
 * point goes on into the box over the board top that holds the cells, the stables and the horses.
 */
export function hidesBoard(eye: Point3, point: Point3): boolean {
  const lo: Point3 = [-SLAB_HALF, 0, -SLAB_HALF];
  const hi: Point3 = [SLAB_HALF, PROTECTED_HEIGHT, SLAB_HALF];
  // Slab test on the ray eye + t (point - eye), keeping only what lies behind the point (t > 1).
  let near = 1;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const origin = eye[axis]!;
    const dir = point[axis]! - origin;
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo[axis]! || origin > hi[axis]!) return false;
      continue;
    }
    const a = (lo[axis]! - origin) / dir;
    const b = (hi[axis]! - origin) / dir;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  return near < far;
}

/** Points on a cylinder standing on the platform: rim and axis at the base, the middle and the top. */
function cylinderOutline(x: number, z: number, radius: number, height: number): Point3[] {
  const out: Point3[] = [];
  for (const level of [0, 0.5, 1]) {
    const y = TABLE_TOP_Y + height * level;
    out.push([x, y, z]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      out.push([x + Math.cos(a) * radius, y, z + Math.sin(a) * radius]);
    }
  }
  return out;
}

/** Radius of the space a hanging lantern takes up, tassel and caps included. */
export const LANTERN_CLEARANCE = 1.3;

/**
 * Points on the outer shape of a piece, for sight-line checks: its bounding cylinder, and for a
 * lantern stand also the lantern hanging in front of it and the tip of the arm that carries it.
 */
export function pieceOutline(piece: SetPiece): Point3[] {
  const out = cylinderOutline(piece.x, piece.z, piece.radius, piece.height);
  if (piece.kind !== 'lantern') return out;
  const [x, , z] = lanternCentre(piece);
  out.push(...cylinderOutline(x, z, LANTERN_CLEARANCE, LANTERN_HEIGHT + LANTERN_CLEARANCE));
  out.push([x, TABLE_TOP_Y + piece.height, z]);
  return out;
}
