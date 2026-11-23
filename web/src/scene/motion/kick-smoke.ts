/**
 * Where everything in the cloud of a slow-motion kick is at a given time: cartoon smoke puffs that burst out low and
 * wide then billow up, a few dark puffs behind them, and dizzy stars circling on thin ellipses above. Pure functions of
 * the seconds since contact, with no allocation per call, so they can run every frame.
 */
import { clamp01, easeOutCubic } from './curves';

/** Seconds the whole effect lasts. */
export const KICK_FX_SECONDS = 1.2;

/** Fields stored per puff in the seeds array. */
const SEED_STRIDE = 5;
/** Share of the puffs that hug the ground as a skirt of dust. */
const SKIRT_SHARE = 0.45;
/** Dark puffs sitting behind the cloud, at most this many. */
const MAX_BACK_PUFFS = 7;
/** Drag of the outward burst: the puffs cover `speed / DRAG` before they stop. */
const DRAG = 3.4;
/** Seconds the puffs take to swell to full size. */
const SWELL_SECONDS = 0.28;
/** Share of the life the smoke stays at full strength. */
const THICK_SHARE = 0.2;
const SMOKE_OPACITY = 0.96;

export interface PuffPose {
  x: number;
  y: number;
  z: number;
  /** Per-axis scale of the unit sphere. */
  sx: number;
  sy: number;
  sz: number;
  /** 0 is clean white, 1 is the darkest grey. */
  shade: number;
}

export function makePuffPose(): PuffPose {
  return { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, shade: 0 };
}

/** Deterministic seeds so every kick looks the same and tests can pin it. */
export function puffSeeds(count: number): Float32Array {
  const out = new Float32Array(count * SEED_STRIDE);
  let s = 4242;
  for (let i = 0; i < out.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = s / 4294967296;
  }
  return out;
}

/** How many of `count` puffs are the dark ones behind the cloud. */
export function backPuffs(count: number): number {
  return Math.min(MAX_BACK_PUFFS, Math.floor(count * 0.2));
}

export function isBackPuff(i: number, count: number): boolean {
  return i >= count - backPuffs(count);
}

/** Pose of puff `i` of `count`, `t` seconds after contact, relative to the contact point. */
export function puffAt(seeds: Float32Array, i: number, count: number, t: number, out: PuffPose): PuffPose {
  const k = i * SEED_STRIDE;
  const angle = seeds[k]! * Math.PI * 2;
  const speed = 1.3 + seeds[k + 1]! * 1.5;
  const size = 0.14 + seeds[k + 2]! * 0.2;
  const rise = 0.3 + seeds[k + 3]! * 0.9;
  const jitter = seeds[k + 4]!;
  const u = clamp01(t / KICK_FX_SECONDS);
  const skirt = i < count * SKIRT_SHARE;
  const back = isBackPuff(i, count);

  const travel = ((1 - Math.exp(-DRAG * t)) / DRAG) * speed * (skirt ? 1.35 : 0.8);
  out.x = Math.cos(angle) * travel;
  out.z = Math.sin(angle) * travel;
  out.y = skirt ? 0.1 + size * 0.5 * easeOutCubic(t / SWELL_SECONDS) : 0.2 + (rise * (1 - Math.exp(-2.2 * t))) / 2.2 + jitter * 0.15;

  const s = size * (0.45 + easeOutCubic(t / SWELL_SECONDS)) * (1 + 0.55 * u) * (skirt ? 1.15 : 1);
  out.sx = s;
  out.sy = skirt ? s * 0.62 : s * (0.9 + jitter * 0.3);
  out.sz = s;
  out.shade = Math.min(1, u * 1.2 + jitter * 0.15) * 0.5;

  if (back) {
    // Behind and beside the cloud, lower and smaller, so the cloud reads as lit from the front.
    out.x = out.x * 0.9 + 0.55;
    out.z -= 0.5;
    out.y = 0.12 + size * 0.6;
    out.sx *= 0.8;
    out.sy *= 0.8;
    out.sz *= 0.8;
    out.shade = 1;
  }
  return out;
}

/** Opacity of the whole smoke: in at once, full while it is thick, then thinning away. */
export function smokeOpacity(t: number): number {
  if (t <= 0 || t >= KICK_FX_SECONDS) return 0;
  const u = t / KICK_FX_SECONDS;
  const fade = u < THICK_SHARE ? 1 : ((1 - u) / (1 - THICK_SHARE)) ** 1.4;
  return SMOKE_OPACITY * Math.min(1, t / 0.03) * fade;
}

export interface Orbit {
  /** Centre of the ellipse, relative to the contact point. */
  cx: number;
  cy: number;
  /** Half width along x and half depth along z. */
  rx: number;
  rz: number;
  /** Roll of the ellipse around the view axis, radians. */
  tilt: number;
  /** Radians per second; the sign is the direction. */
  spin: number;
  stars: number;
  /** World size of a star at its nearest. */
  size: number;
}

export const ORBITS: readonly Orbit[] = [
  { cx: -0.25, cy: 1.05, rx: 0.55, rz: 0.28, tilt: 0.12, spin: 5.0, stars: 3, size: 0.23 },
  { cx: 0.3, cy: 1.35, rx: 0.7, rz: 0.3, tilt: -0.1, spin: -4.2, stars: 3, size: 0.3 },
];

/** Seconds the rings and stars take to pop in. */
const ORBIT_IN_SECONDS = 0.15;
/** Share of the life they hold before thinning away. */
const ORBIT_HOLD_SHARE = 0.75;

/** 0..1: how present the rings and stars are. They pop in fast, hold, then thin out. */
export function orbitPresence(t: number): number {
  if (t <= 0 || t >= KICK_FX_SECONDS) return 0;
  const u = t / KICK_FX_SECONDS;
  const out = u < ORBIT_HOLD_SHARE ? 1 : (1 - u) / (1 - ORBIT_HOLD_SHARE);
  return easeOutCubic(t / ORBIT_IN_SECONDS) * out;
}

/** Scale and drop of a ring that is still popping in: it starts small and a little low. */
export function orbitPop(t: number): { scale: number; drop: number } {
  const p = easeOutCubic(t / ORBIT_IN_SECONDS);
  return { scale: 0.4 + 0.6 * p, drop: 0.25 * (1 - p) };
}

export interface StarPose {
  x: number;
  y: number;
  z: number;
  scale: number;
}

export function makeStarPose(): StarPose {
  return { x: 0, y: 0, z: 0, scale: 0 };
}

/** Star `i` of `orbit`, `t` seconds after contact. Stars at the back of the ellipse are smaller than those at the front. */
export function starAt(orbit: Orbit, i: number, t: number, out: StarPose): StarPose {
  const angle = orbit.spin * t + (i / orbit.stars) * Math.PI * 2;
  const pop = orbitPop(t);
  const local = Math.cos(angle) * orbit.rx * pop.scale;
  const depth = Math.sin(angle);
  // Roll the point around the ellipse centre by the tilt.
  const c = Math.cos(orbit.tilt);
  const s = Math.sin(orbit.tilt);
  out.x = orbit.cx + local * c;
  out.y = orbit.cy - pop.drop + local * s;
  out.z = depth * orbit.rz * pop.scale;
  out.scale = orbit.size * ((depth + 1.4) / 2.4) * (i === 0 ? 1.4 : 1);
  return out;
}
