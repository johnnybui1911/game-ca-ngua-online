/**
 * How much the living-room set may move: lantern flicker and dust drift follow the system
 * "reduce motion" preference and the player's motion setting. Pure logic, no DOM or three.js.
 */

/** Local storage key of the player's motion setting. */
export const MOTION_STORAGE_KEY = 'ca-ngua:motion';

/** How far a lantern's brightness swings around its resting level at full motion. */
export const FLICKER_AMPLITUDE = 0.16;

const REDUCED_WORDS: Record<string, true> = { reduced: true, reduce: true, off: true, none: true, low: true, minimal: true };

function asksForLess(value: unknown): boolean {
  if (value === false) return true;
  if (typeof value === 'string') return REDUCED_WORDS[value.trim().toLowerCase()] === true;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return record.reduced === true || asksForLess(record.level) || asksForLess(record.motion);
  }
  return false;
}

/** Whether a stored motion setting asks for less motion. Accepts a bare word or JSON; anything else means "no opinion". */
export function storedMotionReduced(stored: string | null): boolean {
  if (stored === null) return false;
  try {
    return asksForLess(JSON.parse(stored));
  } catch {
    return asksForLess(stored);
  }
}

/** 1 = lanterns flicker and dust drifts, 0 = both hold still. Either source can ask for stillness. */
export function motionScale(prefersReducedMotion: boolean, stored: string | null): number {
  return prefersReducedMotion || storedMotionReduced(stored) ? 0 : 1;
}

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
