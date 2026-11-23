import { useEffect, useRef, useState } from 'react';
import { EMOTES, type EmoteId } from '../../../shared/emotes';
import type { RoomClientMessage } from '../../../shared/protocol';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { EMOTE_LOCK_MS } from './emote-feed';
import { emoteLabelT, emoteTextT } from './emote-text';
import { emoteSettings, useEmotesMuted } from './emote-settings';

interface Props {
  send: (msg: RoomClientMessage) => void;
  /** The socket is not open. */
  offline: boolean;
}

export function EmotePicker({ send, offline }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const muted = useEmotesMuted();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = (id: EmoteId) => {
    send({ t: 'emote', id });
    setOpen(false);
    setLocked(true);
    timer.current = setTimeout(() => setLocked(false), EMOTE_LOCK_MS);
  };

  const disabled = offline || locked;
  return (
    <div className="emote-picker">
      <button
        ref={toggle}
        type="button"
        className="ui-btn ui-btn--secondary emote-open"
        data-testid="emote-open"
        aria-expanded={open}
        aria-label={t('emote.title')}
        disabled={disabled}
        title={locked ? t('emote.wait') : offline ? t('emote.offline') : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="emote" />
        <span className="emote-open-label" aria-hidden="true">
          {t('emote.title')}
        </span>
      </button>
      {open && !disabled && (
        <div className="glass emote-grid" role="group" aria-label={t('emote.quick')}>
          {EMOTES.map((e) => (
            <button key={e.id} type="button" className="emote-option" data-testid={`emote-${e.id}`} aria-label={emoteLabelT(t, e.id)} onClick={() => pick(e.id)}>
              <span className="emote-option-emoji" aria-hidden="true">
                {e.emoji}
              </span>
              {emoteTextT(t, e.id) && (
                <span className="emote-option-text" aria-hidden="true">
                  {emoteTextT(t, e.id)}
                </span>
              )}
            </button>
          ))}
          <label className="room-switch emote-mute">
            <input
              type="checkbox"
              role="switch"
              className="switch-input"
              data-testid="emote-mute"
              checked={muted}
              onChange={(ev) => emoteSettings.setMuted(ev.target.checked)}
            />
            {t('emote.hide')}
          </label>
        </div>
      )}
    </div>
  );
}
