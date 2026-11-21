import { useState, type FormEvent } from 'react';
import { HORSES_PER_COLOR, type Color } from '../../../shared/game/types';
import { MAX_HORSE_NAME, type RoomClientMessage } from '../../../shared/protocol';
import { COLOR_NAMES, COLOR_VARS } from './colors';

interface Props {
  color: Color;
  /** Current names of the four horses ('' = default number). */
  names: readonly string[];
  send: (msg: RoomClientMessage) => void;
  onClose: () => void;
}

/** Renames the four horses of the local player's colour; an empty field keeps the number. */
export function HorseNamesDialog({ color, names, send, onClose }: Props) {
  const [draft, setDraft] = useState(() => Array.from({ length: HORSES_PER_COLOR }, (_, i) => names[i] ?? ''));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send({ t: 'horseNames', names: draft.map((n) => n.trim()) });
    onClose();
  };

  return (
    <div className="dialog-backdrop">
      <form className="card dialog" role="dialog" aria-modal="true" aria-labelledby="horse-names-title" data-testid="horse-names-dialog" onSubmit={submit}>
        <h2 id="horse-names-title">Đặt tên quân</h2>
        <p className="muted">
          Quân {COLOR_NAMES[color]} của bạn. Để trống để dùng số. Tối đa {MAX_HORSE_NAME} ký tự.
        </p>
        <div className="horse-name-fields">
          {draft.map((value, i) => (
            <label key={i} className="horse-name-field">
              <span className="horse-name-number" style={{ borderColor: COLOR_VARS[color] }}>
                {i + 1}
              </span>
              <input
                data-testid={`horse-name-${i}`}
                value={value}
                maxLength={MAX_HORSE_NAME}
                placeholder={`Quân ${i + 1}`}
                aria-label={`Tên quân ${i + 1}`}
                onChange={(e) => setDraft((d) => d.map((n, j) => (j === i ? e.target.value : n)))}
              />
            </label>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="submit" className="btn btn-primary" data-testid="horse-names-save">
            Lưu tên
          </button>
          <button type="button" className="btn btn-secondary" data-testid="horse-names-cancel" onClick={onClose}>
            Huỷ
          </button>
        </div>
      </form>
    </div>
  );
}
