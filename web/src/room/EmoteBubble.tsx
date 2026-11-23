import { useEffect, useRef, useState } from 'react';
import { EMOTES, type EmoteId } from '../../../shared/emotes';
import { useT } from '../i18n';
import { EMOTE_SHOW_MS, isShown, type EmoteBySeat, type ShownEmote } from './emote-feed';
import { emoteLabelT, emoteTextT } from './emote-text';
import { useEmotesMuted } from './emote-settings';

const BY_ID = new Map<string, (typeof EMOTES)[number]>(EMOTES.map((e) => [e.id, e]));

/** Bubble for one seat; disappears after EMOTE_SHOW_MS. Decorative: screen readers use `EmoteLive`. */
export function EmoteBubble({ seat, emote, mine }: { seat: number; emote: ShownEmote | undefined; mine: boolean }) {
  const t = useT();
  const muted = useEmotesMuted();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!emote) return;
    const left = EMOTE_SHOW_MS - (Date.now() - emote.at);
    if (left <= 0) return;
    const id = setTimeout(() => tick((n) => n + 1), left);
    return () => clearTimeout(id);
  }, [emote]);

  if (!emote || !isShown(emote, Date.now()) || (muted && !mine)) return null;
  const def = BY_ID.get(emote.id);
  if (!def) return null;
  return (
    <span key={emote.n} className="emote-bubble" aria-hidden="true" data-testid={`emote-bubble-${seat}`} data-emote={emote.id}>
      {def.emoji} {emoteTextT(t, def.id)}
    </span>
  );
}

/** One polite announcement per shown emote ("<name>: <emote>"); empty for others' emotes while muted. */
export function EmoteLive({ emotes, mySeat, nameOf }: { emotes: EmoteBySeat; mySeat: number; nameOf: (seat: number) => string }) {
  const t = useT();
  const muted = useEmotesMuted();
  const [text, setText] = useState('');
  const seen = useRef(0);
  const nameRef = useRef(nameOf);
  nameRef.current = nameOf;

  useEffect(() => {
    let latest: { seat: number; e: ShownEmote } | null = null;
    for (const [k, e] of Object.entries(emotes)) if (!latest || e.n > latest.e.n) latest = { seat: Number(k), e };
    if (!latest || latest.e.n <= seen.current) return;
    seen.current = latest.e.n;
    if (muted && latest.seat !== mySeat) return;
    setText(`${nameRef.current(latest.seat)}: ${emoteLabelT(t, latest.e.id as EmoteId)}`);
    const id = setTimeout(() => setText(''), EMOTE_SHOW_MS);
    return () => clearTimeout(id);
  }, [emotes, muted, mySeat, t]);

  return (
    <p role="status" aria-live="polite" className="sr-only" data-testid="emote-live">
      {text}
    </p>
  );
}
