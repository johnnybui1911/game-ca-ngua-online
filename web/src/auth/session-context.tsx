import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GuestRequest, MeResponse, MeUser, OAuthProvider } from '../../../shared/protocol';
import { api } from '../api';

interface Session {
  /** False until the first `/api/auth/me` answer arrives. */
  ready: boolean;
  user: MeUser | null;
  /** True when signed in as a guest (a name and a session, no account yet). */
  guest: boolean;
  providers: Record<OAuthProvider, boolean>;
  /** Re-reads the session and returns the user now signed in, or null. */
  refresh: () => Promise<MeUser | null>;
  signOut: () => Promise<void>;
  /** Creates a guest user with this name and signs in as it. Throws `ApiRequestError`. */
  playAsGuest: (displayName: string) => Promise<void>;
  /** Takes over the session state from an auth response that already describes it. */
  adopt: (me: MeResponse) => void;
}

const NONE: Record<OAuthProvider, boolean> = { google: false, facebook: false, x: false };

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ ready: boolean; user: MeUser | null; providers: Record<OAuthProvider, boolean> }>({
    ready: false,
    user: null,
    providers: NONE,
  });

  const refresh = useCallback(async (): Promise<MeUser | null> => {
    try {
      const me = await api<MeResponse>('/api/auth/me');
      setState({ ready: true, user: me.user, providers: me.providers });
      return me.user;
    } catch {
      setState((s) => ({ ...s, ready: true, user: null }));
      return null;
    }
  }, []);

  const signOut = useCallback(async () => {
    await api<void>('/api/auth/signout', { method: 'POST' });
    await refresh();
  }, [refresh]);

  const playAsGuest = useCallback(async (displayName: string) => {
    const me = await api<MeResponse>('/api/auth/guest', { method: 'POST', body: { displayName } satisfies GuestRequest });
    setState({ ready: true, user: me.user, providers: me.providers });
  }, []);

  const adopt = useCallback((me: MeResponse) => {
    setState({ ready: true, user: me.user, providers: me.providers });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ ...state, guest: state.user?.guest === true, refresh, signOut, playAsGuest, adopt }),
    [state, refresh, signOut, playAsGuest, adopt],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
