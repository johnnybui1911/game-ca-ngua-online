import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import type { SignUpRequest } from '../../../shared/protocol';
import { api, ApiRequestError } from '../api';
import { useT, type TFunction } from '../i18n';
import { errorText } from '../i18n/error-text';
import { AuthLayout } from './AuthLayout';
import { ProviderButtons } from './ProviderButtons';
import { sanitizeReturnTo } from './return-to';
import { useSession } from './session-context';

type Errors = { displayName?: string; email?: string; password?: string };

function validate(t: TFunction, displayName: string, email: string, password: string): Errors {
  const errors: Errors = {};
  const nameLength = [...displayName.trim()].length;
  if (nameLength < 2 || nameLength > 24) errors.displayName = t('auth.nameRange', { min: 2, max: 24 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = t('auth.emailInvalid');
  if (password.length < 8) errors.password = t('auth.passwordShort');
  return errors;
}

/** Rendered once the session is known (the shell waits for it), so a guest's current name can prefill the form. */
export function SignUpPage() {
  const t = useT();
  const { user, guest, refresh } = useSession();
  const [params] = useSearchParams();
  const returnTo = sanitizeReturnTo(params.get('returnTo'));

  const [displayName, setDisplayName] = useState(guest ? (user?.displayName ?? '') : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user && !guest) return <Navigate to={returnTo} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errors = validate(t, displayName, email, password);
    setFieldErrors(errors);
    setServerError(null);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      await api('/api/auth/signup', {
        method: 'POST',
        body: { email, password, displayName } satisfies SignUpRequest,
      });
      await refresh();
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? errorText(t, err.message) : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  const signInLink = `/dang-nhap${returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`;

  return (
    <AuthLayout title={guest ? t('auth.saveAccount') : t('auth.signUp')}>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="signup-name">{t('auth.displayName')}</label>
          <input
            id="signup-name"
            data-testid="signup-name"
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-invalid={!!fieldErrors.displayName}
            aria-describedby={fieldErrors.displayName ? 'signup-name-error' : undefined}
          />
          {fieldErrors.displayName && (
            <p className="field-error" id="signup-name-error" data-testid="signup-name-error">
              {fieldErrors.displayName}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            data-testid="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
          />
          {fieldErrors.email && (
            <p className="field-error" id="signup-email-error" data-testid="signup-email-error">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="signup-password">{t('auth.password')}</label>
          <input
            id="signup-password"
            data-testid="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'signup-password-error' : undefined}
          />
          {fieldErrors.password && (
            <p className="field-error" id="signup-password-error" data-testid="signup-password-error">
              {fieldErrors.password}
            </p>
          )}
        </div>
        {serverError && (
          <p className="form-error" role="alert" data-testid="signup-error">
            {serverError}
          </p>
        )}
        <button type="submit" className="ui-btn ui-btn--primary" data-testid="signup-submit" disabled={busy}>
          {busy ? t('auth.saving') : guest ? t('auth.saveAccount') : t('auth.signUp')}
        </button>
      </form>
      <ProviderButtons returnTo={returnTo} />
      <p className="switch-link">
        {t('auth.haveAccount')} <Link to={signInLink} data-testid="to-signin">{t('auth.signIn')}</Link>
      </p>
    </AuthLayout>
  );
}
