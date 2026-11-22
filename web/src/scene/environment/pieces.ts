/**
 * The furniture and offerings of the set as plain lathe, box and cylinder shapes. Every
 * function adds one prop to the builder, standing on the platform top at the given transform
 * with its front towards +z.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  LatheGeometry,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
} from 'three';
import { createHorseBody, createHorseDetails } from '../horse-geometry';
import type { Spray } from './blossom';
import { FLOOR_Y, LANTERN_HEIGHT, LANTERN_REACH, TABLE_HALF, TABLE_TOP_Y } from './layout';
import { place } from './set-builder';
import type { SetBuilder } from './set-builder';

const WOOD = '#2c1610';
const LACQUER = '#31100b';
const LACQUER_DEEP = '#200a07';
const RED = '#8d1b13';
const GOLD = '#d2a84c';
const QUARTER = Math.PI / 2;

/** Paper body of a lantern: a flattened globe open at both ends. */
export const LANTERN_RADIUS = 1.2;
const LANTERN_HALF_HEIGHT = 1.02;
const LANTERN_MOUTH = 0.44;

export function createLanternBody(): BufferGeometry {
  const limit = Math.acos(LANTERN_MOUTH / LANTERN_RADIUS);
  const profile: Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = -limit + (i / 10) * 2 * limit;
    profile.push(new Vector2(LANTERN_RADIUS * Math.cos(t), (LANTERN_HALF_HEIGHT * Math.sin(t)) / Math.sin(limit)));
  }
  return new LatheGeometry(profile, 16);
}

/** Size and height of the paper face of a couplet scroll on its stand. */
export const SCROLL_WIDTH = 1.18;
export const SCROLL_HEIGHT = 3.8;
export const SCROLL_CENTRE_Y = 2.35;

/** The low platform the board lies on: a thick lacquer top on a recessed apron and four turned-in legs. */
export function platform(b: SetBuilder): void {
  const origin = new Matrix4();
  // The inlaid sheet lies on top of this body.
  const top = TABLE_TOP_Y - 0.012;
  b.add('gloss', new BoxGeometry(TABLE_HALF * 2, 0.8, TABLE_HALF * 2), LACQUER, place(origin, [0, top - 0.4, 0]));
  b.add('metal', new BoxGeometry(TABLE_HALF * 2 + 0.06, 0.07, TABLE_HALF * 2 + 0.06), GOLD, place(origin, [0, top - 0.62, 0]));
  const apronTop = top - 0.8;
  b.add('gloss', new BoxGeometry(TABLE_HALF * 2 - 2.6, 1.2, TABLE_HALF * 2 - 2.6), LACQUER_DEEP, place(origin, [0, apronTop - 0.6, 0]));
  const legHeight = apronTop - FLOOR_Y - 0.3;
  const reach = TABLE_HALF - 1.9;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add('gloss', new CylinderGeometry(1.6, 1.05, legHeight, 4), LACQUER, place(origin, [sx * reach, FLOOR_Y + 0.3 + legHeight / 2, sz * reach], [0, Math.PI / 4, 0]));
      b.add('gloss', new BoxGeometry(2.5, 0.3, 2.5), LACQUER_DEEP, place(origin, [sx * reach, FLOOR_Y + 0.15, sz * reach]));
    }
  }
}

/** A wooden stand with an arm reaching towards the board, and the gilt caps, cord and tassel of the lantern hanging from it. */
export function lanternStand(b: SetBuilder, m: Matrix4): void {
  const h = LANTERN_HEIGHT;
  const r = LANTERN_REACH;
  b.add('gloss', new BoxGeometry(1.3, 0.2, 1.3), WOOD, place(m, [0, 0.1, 0]));
  b.add('gloss', new BoxGeometry(0.85, 0.16, 0.85), WOOD, place(m, [0, 0.28, 0]));
  // The arm clears the top of the lantern by the length of its cord.
  const arm = h + 1.75;
  b.add('gloss', new BoxGeometry(0.24, arm - 0.12, 0.24), WOOD, place(m, [0, 0.36 + (arm - 0.12) / 2, 0]));
  b.add('gloss', new BoxGeometry(0.2, 0.2, r + 0.55), WOOD, place(m, [0, arm, (r + 0.55) / 2 - 0.25]));
  b.add('gloss', new BoxGeometry(0.2, 0.42, 0.2), WOOD, place(m, [0, arm + 0.16, r + 0.2]));
  b.add('gloss', new BoxGeometry(0.14, 0.14, 1), WOOD, place(m, [0, arm - 0.42, 0.45], [-Math.PI / 4, 0, 0]));

  const capY = LANTERN_HALF_HEIGHT + 0.06;
  b.add('matte', new CylinderGeometry(0.025, 0.025, arm - 0.1 - (h + capY), 5), '#150c08', place(m, [0, (arm - 0.1 + h + capY) / 2, r]));
  b.add('metal', new CylinderGeometry(0.4, 0.48, 0.2, 12), GOLD, place(m, [0, h + capY, r]));
  b.add('metal', new CylinderGeometry(0.48, 0.4, 0.2, 12), GOLD, place(m, [0, h - capY, r]));
  b.add('metal', new SphereGeometry(0.12, 8, 6), GOLD, place(m, [0, h - capY - 0.2, r]));
  b.add('matte', new CylinderGeometry(0.04, 0.15, 0.6, 6), '#b3201a', place(m, [0, h - capY - 0.56, r]));
}

/** A two-post stand with the paper back and the rollers of a hanging scroll; the lettered face is a separate sheet. */
export function coupletStand(b: SetBuilder, m: Matrix4): void {
  const top = SCROLL_CENTRE_Y + SCROLL_HEIGHT / 2;
  const bottom = SCROLL_CENTRE_Y - SCROLL_HEIGHT / 2;
  const post = SCROLL_WIDTH / 2 + 0.25;
  for (const sx of [-1, 1]) {
    b.add('gloss', new BoxGeometry(0.3, 0.18, 1.3), WOOD, place(m, [sx * post, 0.09, 0]));
    b.add('gloss', new BoxGeometry(0.15, top + 0.3, 0.15), WOOD, place(m, [sx * post, 0.18 + (top + 0.3) / 2, 0]));
    b.add('metal', new SphereGeometry(0.12, 8, 6), GOLD, place(m, [sx * post, top + 0.56, 0]));
    for (const y of [top, bottom]) {
      b.add('metal', new CylinderGeometry(0.1, 0.1, 0.08, 8), GOLD, place(m, [sx * (SCROLL_WIDTH / 2 + 0.13), y, 0], [0, 0, QUARTER]));
    }
  }
  b.add('gloss', new BoxGeometry(post * 2 + 0.5, 0.16, 0.2), WOOD, place(m, [0, top + 0.18, 0]));
  b.add('matte', new BoxGeometry(SCROLL_WIDTH, SCROLL_HEIGHT, 0.03), '#8f1710', place(m, [0, SCROLL_CENTRE_Y, 0]));
  for (const y of [top, bottom]) {
    b.add('gloss', new CylinderGeometry(0.085, 0.085, SCROLL_WIDTH + 0.23, 8), WOOD, place(m, [0, y, 0], [0, 0, QUARTER]));
  }
}

/** Branches of a blossom spray, rising from the vase that stands at the transform. */
export function sprayBranches(b: SetBuilder, m: Matrix4, spray: Spray): void {
  for (const branch of spray.branches) {
    const curve = new CatmullRomCurve3(branch.points, false, 'catmullrom', 0.12);
    b.add('matte', new TubeGeometry(curve, (branch.points.length - 1) * 3, branch.radius, 5, false), '#3a2418', m);
  }
}

/** Lower and upper tier of the lacquer base under the golden horse: width, height, depth. */
const BASE_FOOT = [2.9, 0.3, 1.9] as const;
const BASE_STEP = [2.2, 0.14, 1.5] as const;
/** Size of the statue horse against a horse on the board, and how far it turns its flank to the player opposite. */
const STATUE_SCALE = 1.49;
const STATUE_TURN = 0.7;
/** Height at which the body of a horse from `horse-geometry` starts: the room its playing base takes. */
const HORSE_FOOT = 0.14;

const STATUE_GOLD = '#ffd25a';
const BRONZE = '#3d2610';

/** Lettered face of the nameplate that leans against the front of the base, top edge back. */
export const PLAQUE_WIDTH = 1.9;
export const PLAQUE_HEIGHT = 0.32;
export const PLAQUE_TILT = -0.5;
const PLAQUE_THICKNESS = 0.04;
const PLAQUE_CENTRE = [0, 0.2, BASE_FOOT[2] / 2 + 0.08] as const;
/** Where the lettered sheet lies, a hair above the plate. */
export const PLAQUE_FACE: readonly [number, number, number] = [
  PLAQUE_CENTRE[0],
  PLAQUE_CENTRE[1] - Math.sin(PLAQUE_TILT) * (PLAQUE_THICKNESS / 2 + 0.004),
  PLAQUE_CENTRE[2] + Math.cos(PLAQUE_TILT) * (PLAQUE_THICKNESS / 2 + 0.004),
];

/**
 * "Mã đáo thành công": a gilt horse, the horse of the board at a larger size, on a two-tier
 * red lacquer base with gilt edges. It shows its flank to the player opposite, its head still
 * towards the board, and a gilt nameplate leans against the front of the base; the lettered
 * face of the plate is a separate sheet.
 */
export function goldenHorse(b: SetBuilder, m: Matrix4): void {
  const [footW, footH, footD] = BASE_FOOT;
  const [stepW, stepH, stepD] = BASE_STEP;
  const top = footH + stepH;
  b.add('gloss', new BoxGeometry(footW, footH, footD), RED, place(m, [0, footH / 2, 0]));
  b.add('metal', new BoxGeometry(footW + 0.05, 0.05, footD + 0.05), GOLD, place(m, [0, 0.045, 0]));
  b.add('metal', new BoxGeometry(footW + 0.05, 0.04, footD + 0.05), GOLD, place(m, [0, footH - 0.03, 0]));
  b.add('gloss', new BoxGeometry(stepW, stepH, stepD), RED, place(m, [0, footH + stepH / 2, 0]));
  b.add('metal', new BoxGeometry(stepW + 0.04, 0.035, stepD + 0.04), GOLD, place(m, [0, top - 0.025, 0]));

  const horse = place(m, [0, top - HORSE_FOOT * STATUE_SCALE, 0], [0, STATUE_TURN, 0], STATUE_SCALE);
  b.add('metal', createHorseBody(), STATUE_GOLD, horse);
  b.add('metal', createHorseDetails(), BRONZE, horse);
  // A gilt collar where the body meets the base.
  b.add('metal', new TorusGeometry(0.35 * STATUE_SCALE, 0.04, 6, 28), GOLD, place(m, [0, top + 0.03, 0], [QUARTER, 0, 0]));

  const plate = place(m, PLAQUE_CENTRE, [PLAQUE_TILT, 0, 0]);
  b.add('metal', new BoxGeometry(PLAQUE_WIDTH + 0.12, PLAQUE_HEIGHT + 0.1, PLAQUE_THICKNESS), GOLD, plate);
}

/** Height of the tray floor the tea service model stands on. */
export const TEA_TRAY_TOP = 0.16;

/** A rimmed wooden tray; the tea service model stands on it. */
export function teaTray(b: SetBuilder, m: Matrix4): void {
  b.add('gloss', new BoxGeometry(4.9, TEA_TRAY_TOP, 3.1), '#4b2416', place(m, [0, TEA_TRAY_TOP / 2, 0]));
  for (const s of [-1, 1]) {
    b.add('gloss', new BoxGeometry(4.9, 0.32, 0.12), WOOD, place(m, [0, 0.16, s * 1.55]));
    b.add('gloss', new BoxGeometry(0.12, 0.32, 3.22), WOOD, place(m, [s * 2.45, 0.16, 0]));
  }
}

/** Two bánh chưng tied with bamboo strips on a plate, and a fan of red lì xì envelopes. */
export function riceCakes(b: SetBuilder, m: Matrix4): void {
  b.add('gloss', new CylinderGeometry(1.75, 1.6, 0.08, 28), '#e8dcc0', place(m, [-0.6, 0.04, -0.15]));
  const cake = (x: number, y: number, z: number, yaw: number) => {
    const c = place(m, [x, y, z], [0, yaw, 0]);
    b.add('matte', new BoxGeometry(1.7, 0.62, 1.7), '#4c7430', c);
    for (const o of [-0.32, 0.32]) {
      b.add('matte', new BoxGeometry(1.74, 0.66, 0.07), '#d8c690', place(c, [0, 0, o]));
      b.add('matte', new BoxGeometry(0.07, 0.66, 1.74), '#d8c690', place(c, [o, 0, 0]));
    }
  };
  cake(-0.6, 0.39, -0.15, 0.25);
  cake(-0.5, 1.03, -0.1, -0.4);
  for (let i = 0; i < 3; i++) {
    const envelope = place(m, [1.5 + i * 0.1, 0.012 + i * 0.024, 0.75], [0, 0.55 - i * 0.4, 0]);
    b.add('matte', new BoxGeometry(0.75, 0.022, 1.2), '#c21d1a', envelope);
    b.add('metal', new BoxGeometry(0.28, 0.026, 0.28), GOLD, place(envelope, [0, 0.002, -0.2]));
  }
}

/** Khay mứt: a round lacquer box of candied fruit and seeds, six wedges around a lidded cup. */
export function sweetsBox(b: SetBuilder, m: Matrix4): void {
  const profile = [
    [0, 0],
    [1.95, 0],
    [2.05, 0.08],
    [2.05, 0.5],
    [1.92, 0.5],
    [1.92, 0.1],
    [0, 0.1],
  ].map(([r, y]) => new Vector2(r, y));
  b.add('gloss', new LatheGeometry(profile, 32), RED, m);
  b.add('metal', new TorusGeometry(1.985, 0.04, 6, 36), GOLD, place(m, [0, 0.5, 0], [QUARTER, 0, 0]));
  const sweets = ['#ece2cc', '#b8382a', '#dba640', '#86aa55', '#8a4b2a', '#e58aa0'];
  sweets.forEach((colour, i) => {
    const start = (i / sweets.length) * Math.PI * 2 + 0.04;
    b.add('matte', new CylinderGeometry(1.86, 1.86, 0.34, 7, 1, false, start, Math.PI / 3 - 0.08), colour, place(m, [0, 0.27, 0]));
  });
  b.add('gloss', new CylinderGeometry(0.58, 0.58, 0.46, 18), RED, place(m, [0, 0.33, 0]));
  b.add('metal', new SphereGeometry(0.1, 8, 6), GOLD, place(m, [0, 0.6, 0]));
}
