import type { ReactElement } from 'react';
import type { OAuthProvider } from '../../../shared/protocol';
import { useT } from '../i18n';
import { useSession } from './session-context';

const LABELS: Record<OAuthProvider, string> = { google: 'Google', facebook: 'Facebook', x: 'X' };
const ICONS: Record<OAuthProvider, ReactElement> = {
  google: (
    <svg viewBox="0 0 24 24" focusable="false">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.72-4.95H1.28v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l4-3.09z" />
      <path fill="#EA4335" d="M12 4.76c1.76 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.09C6.22 6.87 8.87 4.76 12 4.76z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" focusable="false">
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.69.23 2.69.23v2.95h-1.51c-1.49 0-1.96.93-1.96 1.88V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" focusable="false">
      <path fill="currentColor" d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.63 7.58H.49l8.6-9.83L0 1.15h7.6l5.24 6.93zm-1.29 19.5h2.04L6.48 3.24H4.3z" />
    </svg>
  ),
};
// Facebook and X stay wired on the server but have no button yet; add them here to show them.
const ORDER: OAuthProvider[] = ['google'];

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
            <span className="provider-mark" aria-hidden="true">
              {ICONS[p]}
            </span>
            <span className="provider-label">{t('auth.continueWith', { provider: LABELS[p] })}</span>
          </button>
        ))}
      </div>
    </>
  );
}
