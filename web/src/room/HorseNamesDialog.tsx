import { useState, type FormEvent } from 'react';
import { HORSES_PER_COLOR, type Color } from '../../../shared/game/types';
import { MAX_HORSE_NAME, MAX_HORSE_NAME_WORDS, countWords, type RoomClientMessage } from '../../../shared/protocol';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { COLOR_VARS, colorName } from './colors';
import { Modal } from './Modal';

interface Props {
  color: Color;
  /** Current names of the four horses ('' = default number). */
  names: readonly string[];
  send: (msg: RoomClientMessage) => void;
  onClose: () => void;
}

/** Renames the four horses of the local player's colour; an empty field keeps the number. */
export function HorseNamesDialog({ color, names, send, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState(() => Array.from({ length: HORSES_PER_COLOR }, (_, i) => names[i] ?? ''));
  // Same measure as the server: characters (code points) after NFC, so emoji and NFD input count fairly.
  const tooLong = draft.map((n) => {
    const name = n.trim().normalize('NFC');
    return [...name].length > MAX_HORSE_NAME || countWords(name) > MAX_HORSE_NAME_WORDS;
  });
  const invalid = tooLong.some(Boolean);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    send({ t: 'horseNames', names: draft.map((n) => n.trim()) });
    onClose();
  };

  return (
    <Modal labelledBy="horse-names-title" testId="horse-names-dialog" onClose={onClose} onSubmit={submit}>
      <h2 id="horse-names-title" className="ui-title dialog-title">
        {t('horse.title')}
      </h2>
      <p className="ui-muted">
        {t('horse.intro', { color: colorName(t, color), max: MAX_HORSE_NAME, words: MAX_HORSE_NAME_WORDS })}
      </p>
      <div className="horse-name-fields">
        {draft.map((value, i) => (
          <label key={i} className="horse-name-field">
            <span className="horse-name-number" style={{ borderColor: COLOR_VARS[color] }}>
              {i + 1}
            </span>
            <input
              className="glass-input"
              data-testid={`horse-name-${i}`}
              value={value}
              aria-invalid={tooLong[i]}
              placeholder={t('move.horse', { n: i + 1 })}
              aria-label={t('horse.fieldLabel', { n: i + 1 })}
              onChange={(e) => setDraft((d) => d.map((n, j) => (j === i ? e.target.value : n)))}
            />
          </label>
        ))}
      </div>
      {invalid && (
        <p className="form-error" role="alert" data-testid="horse-names-error">
          {t('horse.error', { max: MAX_HORSE_NAME, words: MAX_HORSE_NAME_WORDS })}
        </p>
      )}
      <div className="dialog-actions">
        <button type="submit" className="ui-btn ui-btn--primary" data-testid="horse-names-save" disabled={invalid}>
          <Icon name="check" />
          {t('horse.save')}
        </button>
        <button type="button" className="ui-btn ui-btn--secondary" data-testid="horse-names-cancel" onClick={onClose}>
          {t('horse.cancel')}
        </button>
      </div>
    </Modal>
  );
}
