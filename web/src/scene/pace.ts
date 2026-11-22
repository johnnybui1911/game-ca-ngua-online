/**
 * The pace this page animates at. Normally the default pace, the one the server keeps. In a development
 * build `?pace=current|vua|thu-thai` on the address the page was opened with picks another, to compare
 * them side by side; it is read once, when the page loads, and only changes this browser:
 * - games the page clocks itself (the home page's demo, the scene dev harness) play wholly at that pace;
 * - a match still gets its batches at the server's pace, so a slower choice is compressed to fit the
 *   server's pauses and a faster one leaves the board idle for longer.
 */
import { DEFAULT_PACE, PACES, isPaceName, longestBatchSeconds } from '../../../shared/game/pace';
import type { PaceName, PaceProfile, PaceTimings } from '../../../shared/game/pace';

function readPaceName(): PaceName {
  if (!import.meta.env.DEV || typeof window === 'undefined') return DEFAULT_PACE;
  const asked = new URLSearchParams(window.location.search).get('pace');
  return isPaceName(asked) ? asked : DEFAULT_PACE;
}

export const boardPaceName: PaceName = readPaceName();
const boardPace: PaceProfile = PACES[boardPaceName];
const serverPace: PaceProfile = PACES[DEFAULT_PACE];

/** Durations the board animates with, for a normal or a quick game. */
export function boardTimings(quick: boolean): PaceTimings {
  return quick ? boardPace.quick : boardPace.normal;
}

/** The pace the server commits a match's batches at. */
export function serverTimings(quick: boolean): PaceTimings {
  return quick ? serverPace.quick : serverPace.normal;
}

/** Longest a roll waits for the board to finish animating, in ms: the longest batch and a margin for a slow device. */
export function boardWaitMs(quick: boolean): number {
  return Math.ceil((longestBatchSeconds(boardTimings(quick)) + 0.5) * 1000);
}
