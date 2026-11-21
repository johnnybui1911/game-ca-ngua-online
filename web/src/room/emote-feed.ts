import type { EmoteId } from '../../../shared/emotes';

/** How long a bubble stays on screen. */
export const EMOTE_SHOW_MS = 3000;
/** The picker locks this long after a tap; it matches the server refill so a normal player never meets the drop. */
export const EMOTE_LOCK_MS = 2000;

/** `n` is a client counter: it makes the same id twice in a row a new bubble. `at` is local receipt time. */
export interface ShownEmote {
  id: EmoteId;
  n: number;
  at: number;
}

export type EmoteBySeat = Record<number, ShownEmote>;

/** The newest emote of a seat replaces its older one; other seats are untouched. */
export function receiveEmote(prev: EmoteBySeat, seat: number, id: EmoteId, n: number, now: number): EmoteBySeat {
  return { ...prev, [seat]: { id, n, at: now } };
}

export function isShown(e: ShownEmote | undefined, now: number): boolean {
  return e !== undefined && now - e.at < EMOTE_SHOW_MS;
}
