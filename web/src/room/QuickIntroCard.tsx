import { useEffect, useRef } from 'react';
import { QUICK_INTRO } from '../../../shared/rules-text';

/** Shown once per device when a quick match starts. The turn clock keeps running behind it. */
export function QuickIntroCard({ onClose }: { onClose: () => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ok.current?.focus();
  }, []);
  return (
    <div className="dialog-backdrop">
      <div className="card dialog quick-intro" role="dialog" aria-modal="true" aria-labelledby="quick-intro-title" data-testid="quick-intro">
        <h2 id="quick-intro-title">Ván nhanh</h2>
        <ol className="quick-intro-lines">
          {QUICK_INTRO.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <p className="muted">Xem lại luật bất cứ lúc nào bằng nút ?.</p>
        <button ref={ok} type="button" className="btn btn-primary" data-testid="quick-intro-ok" onClick={onClose}>
          Hiểu rồi
        </button>
      </div>
    </div>
  );
}
