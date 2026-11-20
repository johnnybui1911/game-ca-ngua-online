import { Route, Routes } from 'react-router';
import { HomePage } from './auth/HomePage';
import { NotFoundPage } from './auth/NotFoundPage';
import { RequireAuth } from './auth/RequireAuth';
import { SignInPage } from './auth/SignInPage';
import { SignUpPage } from './auth/SignUpPage';

export function App() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<SignInPage />} />
      <Route path="/dang-ky" element={<SignUpPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
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
  );
}
