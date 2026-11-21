import { useEffect, useRef, useState } from 'react';
import { EMOTES, emoteLabel, type EmoteId } from '../../../shared/emotes';
import type { RoomClientMessage } from '../../../shared/protocol';
import { EMOTE_LOCK_MS } from './emote-feed';
import { emoteSettings, useEmotesMuted } from './emote-settings';

interface Props {
  send: (msg: RoomClientMessage) => void;
  /** The socket is not open. */
  offline: boolean;
}

export function EmotePicker({ send, offline }: Props) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const muted = useEmotesMuted();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

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
        type="button"
        className="btn btn-secondary"
        data-testid="emote-open"
        aria-expanded={open}
        disabled={disabled}
        title={locked ? 'Chờ một chút rồi gửi tiếp nhé' : offline ? 'Đang mất kết nối' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        💬 Biểu cảm
      </button>
      {open && !disabled && (
        <div className="emote-grid" role="group" aria-label="Biểu cảm nhanh">
          {EMOTES.map((e) => (
            <button key={e.id} type="button" className="emote-option" data-testid={`emote-${e.id}`} aria-label={emoteLabel(e.id)} onClick={() => pick(e.id)}>
              <span className="emote-option-emoji" aria-hidden="true">
                {e.emoji}
              </span>
              {e.text && (
                <span className="emote-option-text" aria-hidden="true">
                  {e.text}
                </span>
              )}
            </button>
          ))}
          <label className="emote-mute">
            <input type="checkbox" data-testid="emote-mute" checked={muted} onChange={(ev) => emoteSettings.setMuted(ev.target.checked)} />
            Ẩn biểu cảm
          </label>
        </div>
      )}
    </div>
  );
}
