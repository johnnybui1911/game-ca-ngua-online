import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from './session-context';

/** Sends signed-out visitors to the name panel and brings them back to the page they asked for. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user } = useSession();
  const location = useLocation();
  // The board (or its poster) is already on screen; nothing to add until the session is known.
  if (!ready) return null;
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/bat-dau?returnTo=${returnTo}`} replace />;
  }
  return children;
}
