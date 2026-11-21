import { useEffect, useRef } from 'react';
import { rulesFor } from '../../../shared/rules-text';

interface Props {
  /** Whole seconds left on the reader's own turn; null when it is not their turn. */
  secondsLeft: number | null;
  onClose: () => void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Modal rules sheet. Opening it never touches the turn clock. */
export function RulesSheet({ secondsLeft, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (!ref.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="dialog-backdrop">
      <div ref={ref} className="card dialog rules-sheet" role="dialog" aria-modal="true" aria-labelledby="rules-title" data-testid="rules-sheet">
        <div className="rules-head">
          <h2 id="rules-title">Luật chơi</h2>
          {secondsLeft !== null && (
            <span className="rules-countdown" data-testid="rules-countdown">
              Còn {secondsLeft} giây
            </span>
          )}
        </div>
        <div className="rules-body">
          {rulesFor().map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <ol>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <button type="button" className="btn btn-primary" data-testid="rules-close" data-autofocus onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  );
}

/** Round "?" button that opens the sheet. */
export function RulesButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="rules-button" aria-label="Luật chơi" data-testid="rules-button" onClick={onClick}>
      ?
    </button>
  );
}
