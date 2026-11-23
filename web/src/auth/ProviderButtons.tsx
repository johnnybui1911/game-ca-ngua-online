import type { OAuthProvider } from '../../../shared/protocol';
import { useT } from '../i18n';
import { useSession } from './session-context';

const LABELS: Record<OAuthProvider, string> = { google: 'Google', facebook: 'Facebook', x: 'X' };
const ORDER: OAuthProvider[] = ['google', 'facebook', 'x'];

/** One button per configured provider, after a "hoặc" divider. Renders nothing when none is configured. */
export function ProviderButtons({ returnTo, divider = true }: { returnTo: string; divider?: boolean }) {
  const t = useT();
  const { providers } = useSession();
  const configured = ORDER.filter((p) => providers[p]);
  if (configured.length === 0) return null;
  return (
    <>
      {divider && (
        <div className="divider" data-testid="provider-divider">
          <span>{t('auth.or')}</span>
        </div>
      )}
      <div className="provider-list">
        {configured.map((p) => (
          <button
            key={p}
            type="button"
            className={`ui-btn ui-btn--secondary btn-provider provider-${p}`}
            data-testid={`oauth-${p}`}
            onClick={() => window.location.assign(`/api/auth/oauth/${p}/start?returnTo=${encodeURIComponent(returnTo)}`)}
          >
            <span className="provider-mark" aria-hidden="true" />
            {t('auth.continueWith', { provider: LABELS[p] })}
          </button>
        ))}
      </div>
    </>
  );
}
