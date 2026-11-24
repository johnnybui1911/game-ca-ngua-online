import { useState, type FormEvent } from 'react';
import type { MeResponse, SignUpRequest } from '../../../shared/protocol';
import { api, ApiRequestError } from '../api';
import { useT } from '../i18n';
import { errorText } from '../i18n/error-text';
import { ProviderButtons } from './ProviderButtons';
import { useSession } from './session-context';

/**
 * Offers a guest to keep their name and seat by registering, without leaving the page.
 * Shows a short confirmation once the session is no longer a guest's.
 */
export function SaveAccountBlock({ returnTo, onDismiss }: { returnTo: string; onDismiss: () => void }) {
  const t = useT();
  const { user, guest, adopt } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!guest) {
    return (
      <p className="save-account save-account-done" role="status" data-testid="save-account-done">
        {t('auth.saved')}
      </p>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('auth.emailInvalid'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordShort'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const me = await api<MeResponse>('/api/auth/signup', {
        method: 'POST',
        body: { email, password, displayName: user?.displayName ?? '' } satisfies SignUpRequest,
      });
      // The answer already describes the upgraded session; no second request that could fail.
      adopt(me);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorText(t, err.message) : t('auth.genericError'));
      setBusy(false);
    }
  }

  return (
    <section className="save-account" aria-labelledby="save-account-title" data-testid="save-account">
      <h3 id="save-account-title">{t('auth.saveAccount')}</h3>
      <p>{t('auth.savePitch')}</p>
      <form className="form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor="save-email">Email</label>
          <input
            id="save-email"
            data-testid="save-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="save-password">{t('auth.password')}</label>
          <input
            id="save-password"
            data-testid="save-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="form-error" role="alert" data-testid="save-error">
            {error}
          </p>
        )}
        <button type="submit" className="ui-btn ui-btn--primary" data-testid="save-submit" disabled={busy}>
          {busy ? t('auth.saving') : t('auth.saveAccount')}
        </button>
      </form>
      <ProviderButtons returnTo={returnTo} />
      <button type="button" className="ui-btn ui-btn--ghost save-dismiss" data-testid="save-dismiss" onClick={onDismiss}>
        {t('auth.later')}
      </button>
    </section>
  );
}
