import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from './session-context';

/** Sends signed-out visitors to sign-in and brings them back to the page they asked for. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user } = useSession();
  const location = useLocation();
  if (!ready) return <p className="page-status" role="status">Đang tải…</p>;
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/dang-nhap?returnTo=${returnTo}`} replace />;
  }
  return children;
}
