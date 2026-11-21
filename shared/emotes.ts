/** Preset emotes a seated player can show to the room. The wire carries only the id; copy may change freely. */
export const EMOTES = [
  { id: 'taunt', emoji: '😈', text: 'Đá nè!' },
  { id: 'mercy', emoji: '🙏', text: 'Tha cho em' },
  { id: 'six', emoji: '🎲', text: 'Ra 6 đi!' },
  { id: 'nice', emoji: '👏', text: 'Hay quá' },
  { id: 'laugh', emoji: '😂', text: '' },
  { id: 'hurry', emoji: '⏳', text: 'Nhanh lên' },
  { id: 'sorry', emoji: '😅', text: 'Xin lỗi nha' },
  { id: 'unlucky', emoji: '😭', text: 'Xui quá' },
] as const;

export type EmoteId = (typeof EMOTES)[number]['id'];

export const EMOTE_IDS: readonly string[] = EMOTES.map((e) => e.id);

export function isEmoteId(v: unknown): v is EmoteId {
  return typeof v === 'string' && EMOTE_IDS.includes(v);
}

const BY_ID: ReadonlyMap<string, (typeof EMOTES)[number]> = new Map(EMOTES.map((e) => [e.id, e]));

export function emoteLabel(id: EmoteId): string {
  const e = BY_ID.get(id)!;
  return `${e.emoji} ${e.text}`.trim();
}

export function emoteText(id: EmoteId): string {
  return BY_ID.get(id)!.text;
}
