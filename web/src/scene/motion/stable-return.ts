/**
 * How code outside the canvas asks the board to send every horse back to its stable, and waits
 * for it: the board attaches the animation, the caller requests it and gets a promise. Timed on
 * the clock rather than on drawn frames, so a canvas that stops drawing (a hidden tab) never
 * leaves the caller waiting.
 */

/** Starts the flight and returns the seconds it takes; 0 when there is nothing to fly home. */
export type StableReturnHandler = () => number;

/** Slack after the animation's own length, for the frame that draws its last pose. */
const SETTLE_SECONDS = 0.05;

export function createStableReturn(setTimer: (fn: () => void, ms: number) => unknown = setTimeout) {
  let handler: StableReturnHandler | null = null;
  let pending: Promise<void> | null = null;
  return {
    /** Called by the board that can play the flight; returns its removal. */
    attach(next: StableReturnHandler): () => void {
      handler = next;
      return () => {
        if (handler === next) handler = null;
      };
    },
    /**
     * Sends the horses home and resolves when they have landed: at once without a board or with
     * nothing out of its stable. A request made during a flight joins it.
     */
    request(): Promise<void> {
      if (pending) return pending;
      const seconds = handler?.() ?? 0;
      if (seconds <= 0) return Promise.resolve();
      const flight = new Promise<void>((resolve) => {
        setTimer(() => {
          pending = null;
          resolve();
        }, (seconds + SETTLE_SECONDS) * 1000);
      });
      pending = flight;
      return flight;
    },
  };
}

export const stableReturn = createStableReturn();
