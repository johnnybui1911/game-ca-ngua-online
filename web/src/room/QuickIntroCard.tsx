import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { Modal } from './Modal';
import { quickIntroLines } from './rules-copy';

/** Shown once per device when a quick match starts. The turn clock keeps running behind it. */
export function QuickIntroCard({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal labelledBy="quick-intro-title" testId="quick-intro" className="quick-intro" onClose={onClose}>
      <p className="ui-eyebrow">{t('intro.eyebrow')}</p>
      <h2 id="quick-intro-title" className="ui-title dialog-title">
        {t('intro.title')}
      </h2>
      <ol className="quick-intro-lines">
        {quickIntroLines(t).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <p className="ui-muted quick-intro-hint">
        {t('intro.reopenPre')}
        <Icon name="help" size="sm" label={t('rules.title')} />
        {t('intro.reopenPost')}
      </p>
      <button type="button" className="ui-btn ui-btn--primary" data-testid="quick-intro-ok" data-autofocus onClick={onClose}>
        <Icon name="check" />
        {t('intro.ok')}
      </button>
    </Modal>
  );
}
