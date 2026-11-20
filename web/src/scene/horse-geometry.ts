/**
 * Procedural knight-style horse. Local frame: +y up, the horse faces +z, the
 * base sits on y = 0. Three geometries per horse so materials can differ:
 * the coloured body, a dark set of details (mane, eyes, tail) and the base,
 * whose outline (round, square, hexagon, triangle) identifies the colour
 * without relying on hue.
 */
import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Color } from '../../../shared/game/types';
import { COLOR_SIDES } from './textures';

const m = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const s = new Vector3();
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Z = new Vector3(0, 0, 1);

interface Transform {
  at: [number, number, number];
  /** Rotation about x, then z, in radians. */
  pitch?: number;
  roll?: number;
  scale?: [number, number, number];
}

function placed(geometry: BufferGeometry, t: Transform): BufferGeometry {
  const rot = new Quaternion().setFromAxisAngle(AXIS_X, t.pitch ?? 0);
  if (t.roll) rot.premultiply(q.setFromAxisAngle(AXIS_Z, t.roll));
  const sc = t.scale ?? [1, 1, 1];
  m.compose(p.set(...t.at), rot, s.set(...sc));
  geometry.applyMatrix4(m);
  return geometry;
}

function sphere(r: number, t: Transform): BufferGeometry {
  return placed(new SphereGeometry(r, 20, 14), t);
}

/** Overall scale of body and details relative to the construction units below. */
const HORSE_SCALE = 1;

/** The horse body: torso, arched neck, head, ears. */
export function createHorseBody(): BufferGeometry {
  const torso = new LatheGeometry(
    [
      new Vector2(0.0, 0.14),
      new Vector2(0.32, 0.14),
      new Vector2(0.36, 0.22),
      new Vector2(0.33, 0.38),
      new Vector2(0.27, 0.55),
      new Vector2(0.22, 0.7),
      new Vector2(0.0, 0.76),
    ],
    28,
  );
  const parts: BufferGeometry[] = [
    torso,
    // Chest and haunch give the body a horse-like profile instead of a cone.
    sphere(0.3, { at: [0, 0.5, 0.12], scale: [1, 1.1, 1.15] }),
    sphere(0.27, { at: [0, 0.42, -0.15], scale: [1, 1, 1.1] }),
    // Neck: short and thick, leaning forward from the withers.
    placed(new CylinderGeometry(0.17, 0.25, 0.54, 18), { at: [0, 0.82, 0.18], pitch: 0.55 }),
    // Head: skull plus long muzzle, pitched down.
    sphere(0.2, { at: [0, 1.13, 0.33], scale: [0.95, 1.05, 1.1] }),
    placed(new CylinderGeometry(0.135, 0.165, 0.46, 16), { at: [0, 1.06, 0.58], pitch: 1.95 }),
    sphere(0.14, { at: [0, 0.97, 0.78], scale: [1, 0.95, 1.1] }),
    // Ears.
    placed(new ConeGeometry(0.07, 0.24, 12), { at: [-0.1, 1.4, 0.24], pitch: -0.15, roll: 0.22 }),
    placed(new ConeGeometry(0.07, 0.24, 12), { at: [0.1, 1.4, 0.24], pitch: -0.15, roll: -0.22 }),
  ];
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) throw new Error('Horse body geometry failed to merge');
  merged.scale(HORSE_SCALE, HORSE_SCALE, HORSE_SCALE);
  merged.computeBoundingSphere();
  return merged;
}

/** Dark accents: mane along the neck, tail, eyes, nostrils. */
export function createHorseDetails(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    parts.push(
      sphere(0.095 - t * 0.02, {
        at: [0, 1.3 - t * 0.6, 0.06 - t * 0.12],
        scale: [0.55, 1, 1.25],
      }),
    );
  }
  parts.push(placed(new ConeGeometry(0.12, 0.55, 12), { at: [0, 0.4, -0.42], pitch: -2.2 }));
  parts.push(sphere(0.04, { at: [-0.17, 1.2, 0.4] }));
  parts.push(sphere(0.04, { at: [0.17, 1.2, 0.4] }));
  parts.push(sphere(0.03, { at: [-0.06, 0.96, 0.9] }));
  parts.push(sphere(0.03, { at: [0.06, 0.96, 0.9] }));
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) throw new Error('Horse detail geometry failed to merge');
  merged.scale(HORSE_SCALE, HORSE_SCALE, HORSE_SCALE);
  merged.computeBoundingSphere();
  return merged;
}

/** Base outline radii, balanced so each polygon reads about equally big. */
const BASE_RADIUS: Record<Color, number> = { 0: 0.45, 1: 0.52, 2: 0.47, 3: 0.56 };

/** Base disc (colour shape) plus a collar ring, as one geometry. */
export function createHorseBase(color: Color): BufferGeometry {
  const sides = COLOR_SIDES[color];
  const r = BASE_RADIUS[color];
  const slab = new CylinderGeometry(r * 0.86, r, 0.14, sides);
  if (sides === 4) slab.rotateY(Math.PI / 4);
  if (sides === 3) slab.rotateY(Math.PI);
  slab.translate(0, 0.07, 0);
  const collar = placed(new TorusGeometry(0.27, 0.05, 8, 24), { at: [0, 0.15, 0], pitch: Math.PI / 2 });
  const merged = mergeGeometries([slab, collar], false);
  slab.dispose();
  collar.dispose();
  if (!merged) throw new Error('Horse base geometry failed to merge');
  return merged;
}
