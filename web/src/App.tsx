import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { GuestEntryPage } from './auth/GuestEntryPage';
import { NotFoundPage } from './auth/NotFoundPage';
import { RequireAuth } from './auth/RequireAuth';
import { useSession } from './auth/session-context';
import { SignInPage } from './auth/SignInPage';
import { SignUpPage } from './auth/SignUpPage';
import { LobbyProvider } from './lobby/LobbyProvider';
import { RoomPage } from './room/RoomPage';
import { AppShell } from './shell/AppShell';
import { HomePage } from './shell/HomePage';
import { PanelHost } from './shell/PanelHost';

/** A page that is a card of its own, placed in the panel over the board once the session is known. */
function PanelPage({ children }: { children: ReactNode }) {
  const { ready } = useSession();
  if (!ready) return null;
  return <PanelHost>{children}</PanelHost>;
}

export function App() {
  return (
    <LobbyProvider>
      <Routes>
        {/* One canvas for the whole app: every page below is drawn over the same board. */}
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/bat-dau" element={<GuestEntryPage />} />
          <Route
            path="/dang-nhap"
            element={
              <PanelPage>
                <SignInPage />
              </PanelPage>
            }
          />
          <Route
            path="/dang-ky"
            element={
              <PanelPage>
                <SignUpPage />
              </PanelPage>
            }
          />
          <Route
            path="/r/:code"
            element={
              <RequireAuth>
                <RoomPage />
              </RequireAuth>
            }
          />
          <Route
            path="*"
            element={
              <RequireAuth>
                <PanelHost>
                  <NotFoundPage />
                </PanelHost>
              </RequireAuth>
            }
          />
        </Route>
      </Routes>
    </LobbyProvider>
  );
}
