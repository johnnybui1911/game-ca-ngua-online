import { EMOTES, type EmoteId } from '../../../shared/emotes';
import type { TFunction } from '../i18n';

/** An emote's words in the player's language (the wire carries only the id). */
export const emoteTextT = (t: TFunction, id: EmoteId): string => t(`emote.${id}`);

/** Emoji and words, e.g. "😈 Gotcha!". */
export function emoteLabelT(t: TFunction, id: EmoteId): string {
  const emoji = EMOTES.find((e) => e.id === id)?.emoji ?? '';
  return `${emoji} ${emoteTextT(t, id)}`.trim();
}
