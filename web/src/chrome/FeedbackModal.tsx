import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import { api } from '../api';
import { useT } from '../i18n';
import { FEEDBACK_CATEGORIES, FEEDBACK_LIMITS, type FeedbackCategory, type FeedbackResponse } from '../../../shared/feedback';
import { Modal } from '../room/Modal';
import { Icon } from '../ui/Icon';
import { EMPTY_DRAFT, buildRequest, checkDraft, hasErrors, roomCodeFromPath, sendErrorText, textLength, type DraftErrors } from './feedback-form';
import './chrome.css';

type Status = 'editing' | 'sending' | 'sent';

interface Props {
  onClose: () => void;
}

/**
 * Feedback form in a glass modal. The room code and the page/device context are attached on send,
 * never asked for. Everything typed is plain text: it is sent as JSON and never rendered as HTML.
 */
export function FeedbackModal({ onClose }: Props) {
  const t = useT();
  const { pathname } = useLocation();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [status, setStatus] = useState<Status>('editing');
  const [errors, setErrors] = useState<DraftErrors>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const inRoom = roomCodeFromPath(pathname) !== null;
  const sending = status === 'sending';
  const doneRef = useRef<HTMLButtonElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  // A disabled control cannot keep focus: hand it to the control that is next useful.
  useEffect(() => {
    if (status === 'sent') doneRef.current?.focus();
    else if (status === 'editing' && sendError) submitRef.current?.focus();
  }, [status, sendError]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || status === 'sent') return;
    const found = checkDraft(draft, t);
    setErrors(found);
    if (hasErrors(found)) return;
    setStatus('sending');
    setSendError(null);
    try {
      const body = buildRequest(draft, {
        pathname,
        width: window.innerWidth,
        height: window.innerHeight,
        userAgent: navigator.userAgent,
      });
      await api<FeedbackResponse>('/api/feedback', { method: 'POST', body });
      setStatus('sent');
    } catch (err) {
      setSendError(sendErrorText(err, t));
      setStatus('editing');
    }
  };

  const used = textLength(draft.message);
  const content =
    status === 'sent' ? (
      <>
        <div className="feedback-sent" role="status" data-testid="feedback-success">
          <Icon name="check" size="xl" />
          <h2 id="feedback-title" className="ui-title dialog-title">
            {t('feedback.thanks')}
          </h2>
          <p>{t('feedback.sent')}</p>
        </div>
        <div className="dialog-actions">
          <button ref={doneRef} type="button" className="ui-btn ui-btn--primary" data-testid="feedback-done" onClick={onClose}>
            {t('feedback.close')}
          </button>
        </div>
      </>
    ) : (
      <>
        <h2 id="feedback-title" className="ui-title dialog-title">
          {t('feedback.title')}
        </h2>
        <div className="form" data-testid="feedback-form">
          <div className="field">
            <label htmlFor="feedback-category">{t('feedback.category')}</label>
            <select
              id="feedback-category"
              className="glass-input glass-select feedback-control"
              data-testid="feedback-category"
              data-autofocus
              value={draft.category}
              disabled={sending}
              aria-invalid={errors.category ? true : undefined}
              aria-describedby={errors.category ? 'feedback-category-error' : undefined}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as FeedbackCategory | '' })}
            >
              <option value="" disabled>
                {t('feedback.pickCategory')}
              </option>
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`feedback.cat.${c}`)}
                </option>
              ))}
            </select>
            {errors.category && (
              <p id="feedback-category-error" className="field-error" role="alert">
                {errors.category}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="feedback-message">{t('feedback.content')}</label>
            <textarea
              id="feedback-message"
              className="glass-input feedback-control feedback-message"
              data-testid="feedback-message"
              rows={5}
              placeholder={t('feedback.placeholder')}
              value={draft.message}
              disabled={sending}
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={errors.message ? 'feedback-message-error feedback-counter' : 'feedback-counter'}
              onChange={(e) => setDraft({ ...draft, message: e.target.value })}
            />
            <div className="feedback-meta">
              {errors.message ? (
                <p id="feedback-message-error" className="field-error" role="alert">
                  {errors.message}
                </p>
              ) : (
                <span />
              )}
              <span
                id="feedback-counter"
                className={`feedback-counter${used > FEEDBACK_LIMITS.messageMax ? ' is-over' : ''}`}
                data-testid="feedback-counter"
              >
                {used}/{FEEDBACK_LIMITS.messageMax}
              </span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="feedback-contact">{t('feedback.contact')}</label>
            <input
              id="feedback-contact"
              type="text"
              data-testid="feedback-contact"
              placeholder={t('feedback.contactPlaceholder')}
              autoComplete="off"
              value={draft.contact}
              disabled={sending}
              aria-invalid={errors.contact ? true : undefined}
              aria-describedby={errors.contact ? 'feedback-contact-error' : undefined}
              onChange={(e) => setDraft({ ...draft, contact: e.target.value })}
            />
            {errors.contact && (
              <p id="feedback-contact-error" className="field-error" role="alert">
                {errors.contact}
              </p>
            )}
          </div>

          <p className="feedback-note">
            {inRoom ? t('feedback.noteRoom') : t('feedback.note')}
          </p>

          {sendError && (
            <p className="form-error" role="alert" data-testid="feedback-error">
              {sendError}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button ref={submitRef} type="submit" className="ui-btn ui-btn--primary" data-testid="feedback-submit" disabled={sending}>
            {sending ? t('feedback.sending') : t('feedback.submit')}
          </button>
          <button type="button" className="ui-btn ui-btn--ghost" data-testid="feedback-cancel" disabled={sending} onClick={onClose}>
            {t('feedback.cancel')}
          </button>
        </div>
      </>
    );

  // Portalled so a page or panel drawn after the corner slots cannot cover it.
  return createPortal(
    <Modal
      labelledBy="feedback-title"
      testId="feedback-modal"
      className="feedback-modal"
      onClose={sending ? undefined : onClose}
      onSubmit={(e) => void submit(e)}
    >
      {content}
    </Modal>,
    document.body,
  );
}
