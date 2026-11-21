/**
 * Timing curves shared by the piece and camera animation. All pure functions of a normalised time `u` in 0..1,
 * with no allocation, so they can run every frame.
 */

const TAU = Math.PI * 2;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease in and out: 0 at 0, 1 at 1, flat at both ends. */
export function smoothstep(u: number): number {
  const v = clamp01(u);
  return v * v * (3 - 2 * v);
}

/** Fast start, slow arrival. */
export function easeOutCubic(u: number): number {
  const v = 1 - clamp01(u);
  return 1 - v * v * v;
}

/** Height of a ballistic arc of unit apex: 0 at take-off and landing, 1 half way. */
export function arc(u: number): number {
  const v = clamp01(u);
  return 4 * v * (1 - v);
}

/** Signed shortest turn from angle `a` to angle `b`, in -π..π. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

/** Interpolate from angle `a` to `b` the short way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * t;
}

/**
 * A displacement released at rest position: starts at 1, swings through zero `cycles` times while it decays,
 * and is exactly 0 at the end. Never larger in size than `exp(-decay * u)`.
 */
export function dampedSpring(u: number, cycles: number, decay: number): number {
  if (u <= 0) return 1;
  if (u >= 1) return 0;
  return Math.exp(-decay * u) * Math.cos(TAU * cycles * u) * (1 - u);
}

/**
 * A rocking motion that starts and ends at rest: 0 at both ends, swinging `cycles` times in between with a
 * decaying size no larger than `exp(-decay * u)`.
 */
export function dampedWobble(u: number, cycles: number, decay: number): number {
  if (u <= 0 || u >= 1) return 0;
  return Math.exp(-decay * u) * Math.sin(TAU * cycles * u) * (1 - u);
}
