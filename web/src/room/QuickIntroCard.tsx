import { QUICK_INTRO } from '../../../shared/rules-text';
import { Icon } from '../ui/Icon';
import { Modal } from './Modal';

/** Shown once per device when a quick match starts. The turn clock keeps running behind it. */
export function QuickIntroCard({ onClose }: { onClose: () => void }) {
  return (
    <Modal labelledBy="quick-intro-title" testId="quick-intro" className="quick-intro" onClose={onClose}>
      <p className="ui-eyebrow">Chế độ</p>
      <h2 id="quick-intro-title" className="ui-title dialog-title">
        Ván nhanh
      </h2>
      <ol className="quick-intro-lines">
        {QUICK_INTRO.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <p className="ui-muted quick-intro-hint">
        Xem lại luật bất cứ lúc nào bằng nút <Icon name="help" size="sm" label="Luật chơi" />.
      </p>
      <button type="button" className="ui-btn ui-btn--primary" data-testid="quick-intro-ok" data-autofocus onClick={onClose}>
        <Icon name="check" />
        Hiểu rồi
      </button>
    </Modal>
  );
}
