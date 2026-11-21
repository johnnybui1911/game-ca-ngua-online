import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import type { SignInRequest } from '../../../shared/protocol';
import { api, ApiRequestError } from '../api';
import { AuthLayout } from './AuthLayout';
import { ProviderButtons } from './ProviderButtons';
import { sanitizeReturnTo } from './return-to';
import { useSession } from './session-context';

const QUERY_ERRORS: Record<string, string> = {
  provider_not_configured: 'Phương thức đăng nhập này chưa được cấu hình.',
  oauth_failed: 'Đăng nhập không thành công. Vui lòng thử lại.',
};

export function SignInPage() {
  const { ready, user, guest, refresh } = useSession();
  const [params] = useSearchParams();
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const queryError = QUERY_ERRORS[params.get('error') ?? ''] ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <p className="page-status" role="status">Đang tải…</p>;
  if (user && !guest) return <Navigate to={returnTo} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Vui lòng nhập email hợp lệ.';
    if (!password) errors.password = 'Vui lòng nhập mật khẩu.';
    setFieldErrors(errors);
    setServerError(null);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      await api('/api/auth/signin', { method: 'POST', body: { email, password } satisfies SignInRequest });
      await refresh();
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const signUpLink = `/dang-ky${returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`;
  const shownError = serverError ?? queryError;

  return (
    <AuthLayout title="Đăng nhập">
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="signin-email">Email</label>
          <input
            id="signin-email"
            data-testid="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'signin-email-error' : undefined}
          />
          {fieldErrors.email && (
            <p className="field-error" id="signin-email-error" data-testid="signin-email-error">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="signin-password">Mật khẩu</label>
          <input
            id="signin-password"
            data-testid="signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'signin-password-error' : undefined}
          />
          {fieldErrors.password && (
            <p className="field-error" id="signin-password-error" data-testid="signin-password-error">
              {fieldErrors.password}
            </p>
          )}
        </div>
        {shownError && (
          <p className="form-error" role="alert" data-testid="signin-error">
            {shownError}
          </p>
        )}
        <button type="submit" className="ui-btn ui-btn--primary" data-testid="signin-submit" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      <ProviderButtons returnTo={returnTo} />
      <p className="switch-link">
        Chưa có tài khoản? <Link to={signUpLink} data-testid="to-signup">Đăng ký</Link>
      </p>
    </AuthLayout>
  );
}
