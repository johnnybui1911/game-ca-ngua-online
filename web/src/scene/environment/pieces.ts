/**
 * The furniture and offerings of the set as plain lathe, box and cylinder shapes. Every
 * function adds one prop to the builder, standing on the platform top at the given transform
 * with its front towards +z.
 */
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  QuadraticBezierCurve3,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
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

/** Mâm ngũ quả: a footed lacquer tray with a hand of green bananas cradling a pomelo, oranges, persimmons and a custard apple. */
export function fruitTray(b: SetBuilder, m: Matrix4): void {
  const profile = [
    [0.85, 0],
    [0.95, 0.06],
    [0.5, 0.2],
    [0.45, 0.4],
    [1.2, 0.6],
    [2.02, 0.7],
    [2.12, 0.78],
    [1.98, 0.76],
    [0, 0.72],
  ].map(([r, y]) => new Vector2(r, y));
  b.add('gloss', new LatheGeometry(profile, 28), RED, m);
  b.add('metal', new TorusGeometry(2.08, 0.045, 6, 32), GOLD, place(m, [0, 0.78, 0], [QUARTER, 0, 0]));
  const y0 = 0.74;

  b.add('matte', new SphereGeometry(0.82, 18, 12), '#cdb53a', place(m, [0, y0 + 0.78, -0.25], [0, 0, 0], [1, 0.95, 1]));
  b.add('matte', new CylinderGeometry(0.05, 0.07, 0.14, 6), '#4d5a22', place(m, [0, y0 + 1.6, -0.25]));

  for (let i = 0; i < 6; i++) {
    const turn = (i - 2.5) * 0.36;
    const at = (r: number, y: number) => new Vector3(Math.sin(turn) * r, y, Math.cos(turn) * r + 0.15);
    const curve = new QuadraticBezierCurve3(at(0.25, y0 + 0.24), at(1.72, y0 + 0.12), at(2.02, y0 + 1.22));
    b.add('matte', new TubeGeometry(curve, 10, 0.19, 6, false), i % 2 === 0 ? '#8fa63a' : '#a6b040', m);
    const tip = at(2.02, y0 + 1.22);
    b.add('matte', new SphereGeometry(0.2, 6, 5), '#6f7d2c', place(m, [tip.x, tip.y, tip.z]));
    b.add('matte', new SphereGeometry(0.07, 5, 4), '#35260f', place(m, [tip.x, tip.y + 0.19, tip.z]));
  }
  b.add('matte', new BoxGeometry(0.5, 0.3, 0.42), '#5d6b2a', place(m, [0, y0 + 0.2, 0.38]));

  const round = [110, 150, 180, 210, 250];
  round.forEach((degrees, i) => {
    const a = (degrees * Math.PI) / 180;
    const persimmon = i % 2 === 1;
    b.add(
      'matte',
      new SphereGeometry(0.42, 12, 9),
      persimmon ? '#c9401f' : '#e58a2b',
      place(m, [Math.sin(a) * 1.42, y0 + (persimmon ? 0.33 : 0.42), Math.cos(a) * 1.42], [0, 0, 0], [1, persimmon ? 0.78 : 1, 1]),
    );
  });
  b.add('matte', new IcosahedronGeometry(0.42, 1), '#86a653', place(m, [-0.62, y0 + 1.2, -1.05]));
  b.add('matte', new SphereGeometry(0.4, 12, 9), '#c9401f', place(m, [0.62, y0 + 1.17, -1.05], [0, 0, 0], [1, 0.8, 1]));
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
