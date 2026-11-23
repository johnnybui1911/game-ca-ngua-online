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

/**
 * The HUD shows a state only once the board has finished showing it: a roll or move the server
 * reported plays on the board first, and the turn text, the roll button and the die read the state
 * before it until then. A state with a roll or move in it arrives as a `Pending`; the board's busy
 * reports (which come a render later than the state) then end it.
 */
export interface Pending {
  /** The newest state the board has to finish showing. */
  seq: number;
  /** The board has reported busy since the state arrived (or was already busy): its next idle report ends the wait. */
  sawBusy: boolean;
}

/** Whether a state with these events has something to play on the board. */
export function playsOnBoard(events: readonly { type: string }[]): boolean {
  return events.some((e) => e.type === 'rolled' || e.type === 'moved');
}

/** A state with something to play arrived while the board's last report was `report`. */
export function pendingAfterArrival(pending: Pending | null, seq: number, report: BoardReport): Pending {
  return { seq, sawBusy: pending ? pending.sawBusy : report === true };
}

/**
 * The wait after the board reported. An idle report from before the board took the state up (it comes
 * a render late) changes nothing; the one after busy ends the wait.
 */
export function pendingAfterReport(pending: Pending | null, busy: boolean): Pending | null {
  if (!pending) return null;
  if (busy) return pending.sawBusy ? pending : { ...pending, sawBusy: true };
  return pending.sawBusy ? null : pending;
}

/** The wait after `maxWaitMs` ran out for state `seq`: a slow or absent board must not hold the player up. */
export function pendingAfterExpiry(pending: Pending | null, seq: number): Pending | null {
  return pending && pending.seq === seq ? null : pending;
}
