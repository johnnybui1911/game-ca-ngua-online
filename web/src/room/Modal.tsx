import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Open modals, newest last: only the top one answers Escape and Tab. */
const stack: symbol[] = [];

interface Props {
  /** id of the heading that names the dialog. */
  labelledBy: string;
  testId: string;
  /** Escape calls this; omit when the dialog has no dismiss action (the win dialog). */
  onClose?: () => void;
  /** Renders the panel as a form so Enter submits. */
  onSubmit?: (e: FormEvent) => void;
  className?: string;
  children: ReactNode;
}

/**
 * Glass modal over the board. Focus moves to `[data-autofocus]` (or the first control), stays
 * inside while open, and returns to the opener when the dialog closes.
 */
export function Modal({ labelledBy, testId, onClose, onSubmit, className, children }: Props) {
  const ref = useRef<HTMLDivElement & HTMLFormElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = Symbol('modal');
    stack.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = ref.current;
    const items = () => [...(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => !el.hasAttribute('disabled'));
    (panel?.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0] ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id || !panel) return;
      if (e.key === 'Escape') {
        if (!onCloseRef.current) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = items();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      if (!panel.contains(document.activeElement)) {
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
      stack.splice(stack.indexOf(id), 1);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const panelClass = className ? `glass dialog ${className}` : 'glass dialog';
  const shared = {
    ref,
    className: panelClass,
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': labelledBy,
    'data-testid': testId,
    tabIndex: -1,
  } as const;

  // Rendered on `body`: a `.glass` ancestor (backdrop-filter) would otherwise become the containing
  // block of the fixed backdrop and clip the dialog inside it.
  return createPortal(
    <div className="dialog-backdrop">
      {onSubmit ? (
        <form {...shared} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div {...shared}>{children}</div>
      )}
    </div>,
    document.body,
  );
}
