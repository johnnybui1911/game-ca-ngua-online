import { Route, Routes } from 'react-router';
import { NotFoundPage } from './auth/NotFoundPage';
import { RequireAuth } from './auth/RequireAuth';
import { SignInPage } from './auth/SignInPage';
import { SignUpPage } from './auth/SignUpPage';
import { LobbyPage } from './lobby/LobbyPage';
import { LobbyProvider } from './lobby/LobbyProvider';
import { RoomPage } from './room/RoomPage';

export function App() {
  return (
    <LobbyProvider>
      <Routes>
        <Route path="/dang-nhap" element={<SignInPage />} />
        <Route path="/dang-ky" element={<SignUpPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <LobbyPage />
            </RequireAuth>
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
              <NotFoundPage />
            </RequireAuth>
          }
        />
      </Routes>
    </LobbyProvider>
  );
}
