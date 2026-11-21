/**
 * Body language of a hopping horse: how tall it stands (squash and stretch) and how far it leans, as functions of
 * the normalised time inside each phase of a move. The phases meet without a jump: the crouch ends at the squash a
 * hop starts from, every hop lands in the squash the next one starts from, and the settle starts from that squash.
 *
 * A stretch factor scales the horse's height; the view narrows it by the matching amount so the volume stays put.
 */
import { clamp01, dampedSpring, smoothstep } from './curves';

/** Share of its height a horse loses at full squash. */
export const SQUASH = 0.22;
/** Share of its height a horse gains at full stretch. */
export const STRETCH = 0.16;
/** Largest forward lean of a hop, radians. */
export const LEAN = 0.2;
/** Hops of at least this many seconds play at full size; shorter ones shrink so a compressed move does not flicker. */
const FULL_ENERGY_SECONDS = 0.12;
const MIN_ENERGY = 0.45;

/** 0..1 size of a hop's squash, stretch and lift for its duration. */
export function hopEnergy(hopSeconds: number): number {
  return Math.min(1, Math.max(MIN_ENERGY, hopSeconds / FULL_ENERGY_SECONDS));
}

/** 1 at take-off and landing, falling away quickly to 0 in the air. */
function ground(u: number): number {
  const d = 2 * clamp01(u) - 1;
  const d2 = d * d;
  return d2 * d2 * d2;
}

/** Height factor during a hop: squashed on the ground, stretched right after take-off and before landing. */
export function hopStretch(u: number, energy: number): number {
  const v = clamp01(u);
  const g = ground(v);
  const air = (1 - g) * (1 - 0.55 * 4 * v * (1 - v));
  return 1 + energy * (STRETCH * air - SQUASH * g);
}

/** Forward lean during a hop, radians: into the jump on the way up, slightly back before landing, upright on the ground. */
export function hopLean(u: number, energy: number): number {
  const v = clamp01(u);
  return energy * LEAN * (0.55 * Math.sin(Math.PI * v) + 0.45 * Math.sin(2 * Math.PI * v));
}

/** Height factor while crouching before the first hop; ends at the squash `hopStretch` starts from. */
export function crouchStretch(u: number, energy: number): number {
  return 1 - energy * SQUASH * smoothstep(u);
}

/** Lean while crouching, radians: rocks back and returns upright. */
export function crouchLean(u: number, energy: number): number {
  return -0.6 * energy * LEAN * Math.sin(Math.PI * clamp01(u));
}

/** Height factor while settling on the last cell: springs out of the landing squash, overshoots once, ends at exactly 1. */
export function settleStretch(u: number, energy: number): number {
  return 1 - energy * SQUASH * dampedSpring(u, 1, 3);
}
