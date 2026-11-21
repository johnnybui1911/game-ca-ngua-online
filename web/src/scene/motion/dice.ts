/**
 * The die's throw as a function of normalised time: it drops in, bounces twice with less height each time, then
 * rocks on an edge and comes to rest. The director turns these numbers into a position and Euler angles around
 * the face that was rolled, so the die always ends flat with that face up.
 */
import { arc, clamp01, dampedWobble } from './curves';

/** Normalised times of the first landing, the second and the last; the settle fills the rest. */
export const DIE_LANDINGS = [0.3, 0.56, 0.74] as const;
/** Height of the die centre above its resting height when thrown, and at the top of each bounce. */
export const DIE_HEIGHTS = [1.9, 0.72, 0.22] as const;
/** Largest tilt of the settling rock, radians. */
export const DIE_ROCK = 0.26;

export interface DieTumble {
  /** 1 at the start of the throw, 0 once the die has reached its resting spot. */
  travel: number;
  /** Height of the centre above the resting height. */
  lift: number;
  /** 1 at the start, 0 from the last landing on: how much of the tumbling rotation is left. */
  spin: number;
  /** Tilt about the die's resting edge during the settle, radians. */
  rock: number;
}

export function createDieTumble(): DieTumble {
  return { travel: 1, lift: 0, spin: 1, rock: 0 };
}

/** Fill `out` for normalised time `u`; at `u` = 1 everything is at rest. */
export function dieTumble(u: number, out: DieTumble): DieTumble {
  const v = clamp01(u);
  const [t1, t2, t3] = DIE_LANDINGS;
  const [h0, h1, h2] = DIE_HEIGHTS;
  if (v < t1) {
    const f = v / t1;
    out.lift = h0 * (1 - f * f);
  } else if (v < t2) {
    out.lift = h1 * arc((v - t1) / (t2 - t1));
  } else if (v < t3) {
    out.lift = h2 * arc((v - t2) / (t3 - t2));
  } else {
    out.lift = 0;
  }
  const left = 1 - Math.min(1, v / t3);
  out.travel = left * left;
  out.spin = left * left;
  out.rock = v > t3 ? DIE_ROCK * dampedWobble((v - t3) / (1 - t3), 1.5, 3) : 0;
  return out;
}

/** How much higher a cube of half edge `half` sits when tilted by `angle` about a bottom edge. */
export function tiltedRise(half: number, angle: number): number {
  const a = Math.abs(angle);
  return half * (Math.cos(a) + Math.sin(a) - 1);
}
