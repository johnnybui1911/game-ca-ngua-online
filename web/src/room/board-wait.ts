/**
 * Whether the roll waits for the board. The board reports when it starts and finishes animating
 * what the server sent; until its first report (the match has only just mounted, the demo's horses
 * are still flying home, the 3D code is still loading) it counts as busy, so the roll is held
 * from the very first frame of a match.
 */

/** What the board last reported: animating or not; null before its first report. */
export type BoardReport = boolean | null;

/**
 * True while the roll must wait: the board is busy (or has not reported yet) and the wait for
 * state `seq` has not run out (`expiredAt` is the `seq` whose wait did).
 */
export function rollHeld(report: BoardReport, seq: number, expiredAt: number | null): boolean {
  return (report ?? true) && expiredAt !== seq;
}

/**
 * The report to go on once a wait has run out: a board that never reported at all (no WebGL, a
 * canvas that failed) is taken as idle from then on, so it holds the roll once and never again.
 */
export function reportAfterExpiry(report: BoardReport): boolean {
  return report ?? false;
}
