/**
 * How the living-room set moves: lantern flicker and dust drift. Pure logic, no DOM or three.js.
 * Whether it may move at all comes from the motion setting (`../motion/motion-setting.ts`).
 */

/** How far a lantern's brightness swings around its resting level at full motion. */
export const FLICKER_AMPLITUDE = 0.16;

/**
 * Candle-like wobble in [-1, 1]: three sines with unrelated periods, so it never visibly repeats.
 * `seed` shifts the phase so neighbouring lanterns do not pulse together.
 */
export function flicker(time: number, seed: number): number {
  return (
    0.5 * Math.sin(time * 2.1 + seed * 1.7) +
    0.3 * Math.sin(time * 5.3 + seed * 3.1) +
    0.2 * Math.sin(time * 11.7 + seed * 5.9)
  );
}

/** Brightness multiplier of a lantern: exactly 1 without motion, within ±FLICKER_AMPLITUDE of 1 with it. */
export function lanternLevel(time: number, seed: number, motion: number): number {
  return 1 + FLICKER_AMPLITUDE * motion * flicker(time, seed);
}

/** Smooth 0..1 ramp used to bring the set up out of the dark. */
export function fadeLevel(elapsed: number, duration: number): number {
  const t = Math.min(1, Math.max(0, elapsed / duration));
  return t * t * (3 - 2 * t);
}
