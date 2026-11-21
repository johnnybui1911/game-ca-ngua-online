import { useState, type FormEvent } from 'react';
import type { MeResponse, SignUpRequest } from '../../../shared/protocol';
import { api, ApiRequestError } from '../api';
import { ProviderButtons } from './ProviderButtons';
import { useSession } from './session-context';

/**
 * Offers a guest to keep their name and seat by registering, without leaving the page.
 * Shows a short confirmation once the session is no longer a guest's.
 */
export function SaveAccountBlock({ returnTo, onDismiss }: { returnTo: string; onDismiss: () => void }) {
  const { user, guest, adopt } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!guest) {
    return (
      <p className="save-account save-account-done" role="status" data-testid="save-account-done">
        Đã lưu tài khoản. Lần sau bạn đăng nhập bằng email này.
      </p>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Vui lòng nhập email hợp lệ.');
      return;
    }
    if (password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự.');
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
      setError(err instanceof ApiRequestError ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.');
      setBusy(false);
    }
  }

  return (
    <section className="save-account" aria-labelledby="save-account-title" data-testid="save-account">
      <h3 id="save-account-title">Lưu tài khoản</h3>
      <p>Lưu bằng email để giữ tên và chỗ ngồi của bạn, lần sau vào lại không cần nhập tên.</p>
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
          <label htmlFor="save-password">Mật khẩu</label>
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
        <button type="submit" className="btn btn-primary" data-testid="save-submit" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu tài khoản'}
        </button>
      </form>
      <ProviderButtons returnTo={returnTo} />
      <button type="button" className="btn-link" data-testid="save-dismiss" onClick={onDismiss}>
        Để sau
      </button>
    </section>
  );
}
