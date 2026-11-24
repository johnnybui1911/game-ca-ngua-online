import { LANGS, langStore, useLang, type Lang } from './lang';
import { useT } from './index';
import './lang-switch.css';

const SHORT: Record<Lang, string> = { vi: 'VI', en: 'EN' };

/** VI / EN toggle. Applies at once, is remembered in this browser, and never touches the game connection. */
export function LangSwitch({ className }: { className?: string }) {
  const lang = useLang();
  const t = useT();
  return (
    <div className={`lang-switch${className ? ` ${className}` : ''}`} role="group" aria-label={t('lang.label')} data-testid="lang-switch">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className="lang-switch-btn"
          lang={l}
          aria-pressed={lang === l}
          aria-label={t(`lang.${l}`)}
          title={t(`lang.${l}`)}
          data-testid={`lang-${l}`}
          onClick={() => langStore.set(l)}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}
