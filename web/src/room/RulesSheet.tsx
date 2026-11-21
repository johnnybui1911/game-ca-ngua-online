import { rulesFor } from '../../../shared/rules-text';
import { Icon } from '../ui/Icon';
import { Modal } from './Modal';

interface Props {
  /** The room's settings: a quick room lists the quick-match differences first. */
  settings: { quick: boolean };
  /** Whole seconds left on the reader's own turn; null when it is not their turn. */
  secondsLeft: number | null;
  onClose: () => void;
}

/** Modal rules sheet. Opening it never touches the turn clock. */
export function RulesSheet({ settings, secondsLeft, onClose }: Props) {
  return (
    <Modal labelledBy="rules-title" testId="rules-sheet" className="rules-sheet" onClose={onClose}>
      <div className="rules-head">
        <h2 id="rules-title" className="ui-title dialog-title">
          Luật chơi
        </h2>
        {secondsLeft !== null && (
          <span className="rules-countdown" data-testid="rules-countdown">
            <Icon name="timer" size="sm" />
            Còn {secondsLeft} giây
          </span>
        )}
      </div>
      <div className="rules-body">
        {rulesFor(settings).map((section) => (
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
      <button type="button" className="ui-btn ui-btn--primary" data-testid="rules-close" data-autofocus onClick={onClose}>
        <Icon name="close" />
        Đóng
      </button>
    </Modal>
  );
}

/** Round help button that opens the sheet. */
export function RulesButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ui-btn ui-btn--icon" aria-label="Luật chơi" data-testid="rules-button" onClick={onClick}>
      <Icon name="help" />
    </button>
  );
}
