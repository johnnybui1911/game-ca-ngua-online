import type { OAuthProvider } from '../../../shared/protocol';
import { useSession } from './session-context';

const LABELS: Record<OAuthProvider, string> = { google: 'Google', facebook: 'Facebook', x: 'X' };
const ORDER: OAuthProvider[] = ['google', 'facebook', 'x'];

export function ProviderButtons({ returnTo }: { returnTo: string }) {
  const { providers } = useSession();
  return (
    <div className="provider-list">
      {ORDER.map((p) =>
        providers[p] ? (
          <button
            key={p}
            type="button"
            className={`btn btn-provider provider-${p}`}
            data-testid={`oauth-${p}`}
            onClick={() => window.location.assign(`/api/auth/oauth/${p}/start?returnTo=${encodeURIComponent(returnTo)}`)}
          >
            Tiếp tục với {LABELS[p]}
          </button>
        ) : (
          <button key={p} type="button" className={`btn btn-provider provider-${p}`} data-testid={`oauth-${p}`} disabled>
            {LABELS[p]} (chưa cấu hình)
          </button>
        ),
      )}
    </div>
  );
}
