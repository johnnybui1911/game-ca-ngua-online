/**
 * When a software rasteriser draws. Every picture costs it whole CPU cores, and a match that
 * redraws an unchanged board at the display rate starves the page it sits under. So the frame
 * loop keeps running (animations stay on the clock) but a picture is only drawn when something
 * on the board or the camera moved, and no more often than `MOTION_FPS`. Pulsing glows change
 * materials only; they are served by a slow steady rate. Pure logic, no DOM or three.js.
 */

/** Pictures a second while something moves. */
export const MOTION_FPS = 12;
/** Pictures a second while only glows pulse. */
export const AMBIENT_FPS = 2;

/** Timer and frame callbacks jitter around their slot; a picture this much early still counts as on time. */
const SLACK_MS = 4;

export interface FrameGate {
  /** Signature of the last picture drawn; null before the first. */
  drawn: number | null;
  /** When it was drawn, in milliseconds. */
  drawnAt: number;
}

export function createFrameGate(): FrameGate {
  return { drawn: null, drawnAt: 0 };
}

/**
 * Whether to draw now. `signature` identifies where everything is (see `sceneSignature`): a
 * picture that differs from the last one drawn is due at the motion rate, so the pose an
 * animation ends on is always drawn; an identical one is due at the ambient rate.
 */
export function frameDue(gate: FrameGate, signature: number, now: number): boolean {
  if (gate.drawn === null) return true;
  const fps = signature === gate.drawn ? AMBIENT_FPS : MOTION_FPS;
  return now - gate.drawnAt >= 1000 / fps - SLACK_MS;
}

/** Records the picture just drawn. */
export function frameDrawn(gate: FrameGate, signature: number, now: number): void {
  gate.drawn = signature;
  gate.drawnAt = now;
}

/** Folds numbers into a 32-bit signature, a thousandth apart being different. */
export function foldSignature(hash: number, values: ArrayLike<number>, count = values.length): number {
  let h = hash;
  for (let i = 0; i < count; i++) h = (Math.imul(h, 31) + Math.round(values[i]! * 1024)) | 0;
  return h;
}
