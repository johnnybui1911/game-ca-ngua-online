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
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

/**
 * The skin of a melon as a unit sphere with its poles on the y axis, cut into `stripes` pairs of
 * a narrow light band and a wide dark one that run from pole to pole. The edges between the
 * bands waver, each in its own rhythm, and straighten towards the poles where the bands meet.
 */
export function createMelonSkin(stripes: number, rows: number): { dark: BufferGeometry; light: BufferGeometry } {
  const pitch = (Math.PI * 2) / stripes;
  const lightWidth = pitch * 0.36;
  const sway = lightWidth * 0.3;
  /** Longitude of edge `e` at polar angle `theta`: even edges open a light band, odd ones close it. */
  const edge = (e: number, theta: number) =>
    Math.floor(e / 2) * pitch + (e % 2 === 0 ? -0.5 : 0.5) * lightWidth + sway * Math.sin(theta) * Math.sin(5 * theta + e * 2.4);
  type Column = (theta: number) => number;
  /** Adds the strip between the first and the last column to a skin, as a grid of shared points. */
  const band = (out: { positions: number[]; index: number[] }, columns: Column[]) => {
    const first = out.positions.length / 3;
    const at = (row: number, column: number) => first + row * columns.length + column;
    for (let row = 0; row <= rows; row++) {
      const theta = (row / rows) * Math.PI;
      for (const column of columns) {
        const phi = column(theta);
        out.positions.push(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column + 1 < columns.length; column++) {
        // At a pole the row is a single point, and the triangle along it is empty.
        if (row > 0) out.index.push(at(row, column), at(row, column + 1), at(row + 1, column));
        if (row < rows - 1) out.index.push(at(row, column + 1), at(row + 1, column + 1), at(row + 1, column));
      }
    }
  };
  const light = { positions: [] as number[], index: [] as number[] };
  const dark = { positions: [] as number[], index: [] as number[] };
  for (let s = 0; s < stripes; s++) {
    const [open, close, next] = [2 * s, 2 * s + 1, 2 * s + 2].map((e): Column => (theta) => edge(e, theta)) as [Column, Column, Column];
    band(light, [open, close]);
    // The wide band bends once more in the middle, so the melon stays round.
    band(dark, [close, (theta) => (close(theta) + next(theta)) / 2, next]);
  }
  const skin = ({ positions, index }: { positions: number[]; index: number[] }) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    // On a unit sphere a point is its own normal.
    geometry.setAttribute('normal', new Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    return geometry;
  };
  return { dark: skin(dark), light: skin(light) };
}

export interface SeedSpot {
  x: number;
  z: number;
  /** Yaw of the seed lying there. */
  turn: number;
}

/** Evenly spread places for `count` seeds on a disc: a sunflower spiral, the same every time. */
export function seedSpots(count: number, radius: number): SeedSpot[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const r = radius * Math.sqrt((i + 0.5) / count);
    return { x: Math.cos(i * golden) * r, z: Math.sin(i * golden) * r, turn: (i * 1.7) % Math.PI };
  });
}

/** One geometry from many small ones, which are released. */
function gathered(parts: BufferGeometry[]): BufferGeometry {
  const out = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return out;
}

const PORCELAIN = '#ebe8de';
const COBALT = '#28489a';

/** A white porcelain dish with a cobalt lip; returns the height of its well. */
function porcelainDish(b: SetBuilder, m: Matrix4, radius: number, height: number, segments: number): number {
  const lathe = (profile: number[][]) => new LatheGeometry(profile.map(([r, y]) => new Vector2(r! * radius, y! * height)), segments);
  b.add('gloss', lathe([[0.55, 0], [0.6, 0.18], [0.9, 0.7], [0.89, 0.85], [0.6, 0.42], [0, 0.36]]), PORCELAIN, m);
  b.add('gloss', lathe([[0.9, 0.7], [1, 0.88], [0.98, 1], [0.89, 0.85]]), COBALT, m);
  return 0.36 * height;
}

/** Half length and half thickness of the watermelon, and the bands of its skin. */
const MELON_LENGTH = 1.5;
const MELON_GIRTH = 1.12;
const MELON_STRIPES = 10;
const MELON_SEEDS = 34;

/**
 * Dưa hấu and hạt dưa: a whole striped watermelon lying on a porcelain plate, its stem end
 * turned towards the player opposite, and beside it a small dish heaped with red melon seeds.
 */
export function watermelonPlates(b: SetBuilder, m: Matrix4): void {
  const plate = place(m, [-0.6, 0, 0]);
  const well = porcelainDish(b, plate, 1.55, 0.26, 24);
  // Lying on its side: the poles of the skin along the plate, sunk a little into the well.
  const lying = place(plate, [0, well + MELON_GIRTH - 0.03, 0], [0, -0.5, QUARTER]);
  const skin = createMelonSkin(MELON_STRIPES, 12);
  const body = place(lying, [0, 0, 0], [0, 0, 0], [MELON_GIRTH, MELON_LENGTH, MELON_GIRTH]);
  b.add('gloss', skin.dark, '#17502a', body);
  b.add('gloss', skin.light, '#86b84e', body);
  b.add('matte', new CylinderGeometry(0.035, 0.06, 0.26, 5), '#6b6a35', place(lying, [0.04, -MELON_LENGTH - 0.09, 0], [0, 0, -0.35]));

  const dish = place(m, [1.7, 0, 0.35]);
  const floor = porcelainDish(b, dish, 0.68, 0.3, 16);
  const heap = 0.2;
  b.add('matte', new SphereGeometry(1, 10, 3, 0, Math.PI * 2, 0, QUARTER), '#8c1512', place(dish, [0, floor, 0], [0, 0, 0], [0.54, heap, 0.54]));
  const shades: BufferGeometry[][] = [[], []];
  seedSpots(MELON_SEEDS, 0.48).forEach((spot, i) => {
    const y = floor + heap * Math.sqrt(1 - (Math.hypot(spot.x, spot.z) / 0.54) ** 2) + 0.012;
    shades[i % 2]!.push(new SphereGeometry(1, 4, 2).applyMatrix4(place(dish, [spot.x, y, spot.z], [0, spot.turn, 0], [0.05, 0.028, 0.09])));
  });
  b.add('matte', gathered(shades[0]!), '#c9211c', new Matrix4());
  b.add('matte', gathered(shades[1]!), '#e2482c', new Matrix4());
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
