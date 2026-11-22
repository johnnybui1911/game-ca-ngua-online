import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { FeedbackModal } from './FeedbackModal';
import './chrome.css';

/** Floating "Góp ý" pill. A match has no room for it above its bottom bar, so there it lives in the match menu. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="feedback-pill" data-testid="feedback-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="feedback" />
        <span className="feedback-pill-label">Góp ý</span>
        <span className="feedback-live" aria-hidden="true" />
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}
