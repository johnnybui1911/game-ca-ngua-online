# Phase 2: accounts (email/password, Google, Facebook, X)

## Goal

Sign-up, sign-in and sign-out with email and password, plus sign-in through Google, Facebook and X, on a Cloudflare Worker (Hono) with D1, and the web app shell with the Vietnamese sign-in and sign-up pages.

## Read first

- `shared/protocol.ts`, section "accounts": request and response shapes and routes. Contract; do not edit.
- `worker/env.ts`, `worker/index.ts`, `wrangler.jsonc`, `vite.config.ts`, `index.html`.

## Files you own

- `worker/auth/**`, and the lines in `worker/index.ts` that mount your routes.
- `migrations/**` (D1 SQL; database binding `DB`).
- `web/src/main.tsx`, `web/src/App.tsx` (router), `web/src/auth/**`, `web/src/styles/**`, `web/src/api.ts`.
- `e2e/auth*.spec.ts`, `e2e/mock-oauth/**`, `playwright.config.ts`, and e2e-only configuration.

Do not create anything under `shared/`, `worker/rooms/`, `web/src/lobby/`, `web/src/room/`, `web/src/scene/`.

## Server requirements

- Tables: users (id, email unique nullable, display name, password hash nullable, created at), oauth accounts (provider, provider user id, user id; primary key on the first two), sessions (token hash, user id, expires at).
- Passwords: PBKDF2-SHA-256 through WebCrypto with a per-user random salt and 100000 iterations (the Workers runtime rejects more), constant-time comparison. Minimum length 8. Email normalised to lower case. Display name 2 to 24 characters.
- Sessions: 32 random bytes, only the SHA-256 hash stored, cookie `HttpOnly; Secure; SameSite=Lax; Path=/`, 30 days. Sign-out deletes the row and the cookie. `Secure` must not break `http://localhost` (browsers accept Secure cookies on localhost).
- Sign-in failures answer one generic message for unknown email and wrong password. A user created through a provider has no password and cannot sign in with one.
- State-changing routes reject cross-site requests (check `Origin` against the request host).
- Export from `worker/auth/session.ts`: `getSessionUser(request: Request, env: Env): Promise<PublicUser | null>`. The rooms piece authenticates HTTP and WebSocket upgrades with it; keep that signature.
- OAuth, authorization-code flow for all three, implemented with `fetch` (no SDK):
  - Google: OpenID Connect, scopes `openid email profile`.
  - Facebook: Graph API, scopes `public_profile,email`.
  - X: OAuth 2.0 with PKCE (S256), scopes `users.read tweet.read`, confidential client (Basic auth on the token request).
  - `state` (and the PKCE verifier) live in a short-lived HttpOnly cookie and are compared on callback. `returnTo` accepts only a same-origin path starting with a single `/`; anything else becomes `/`.
  - Redirect URI is `<request origin>/api/auth/oauth/<provider>/callback`.
  - Account resolution: an existing (provider, provider user id) signs that user in. Otherwise a new user is created, except when Google returns a verified email matching an existing user, in which case the provider account is linked to that user. Never link on an unverified or non-Google email. A provider email already taken by another user is not stored on the new user.
  - A provider whose client id or secret is missing is "not configured": `GET /api/auth/me` reports false for it and its start route redirects to `/dang-nhap?error=provider_not_configured`.
  - Provider failure or denial redirects to `/dang-nhap?error=oauth_failed`; never show provider error text to the user.
- Provider endpoints must be overridable for tests through one optional variable (for example `OAUTH_TEST_BASE_URL`, added to `worker/env.ts` by you, the only edit allowed there) so e2e runs against a local mock. The override must be impossible to set by a request.
- Errors use `ApiError` with stable `code` values and Vietnamese `message`.

## Client requirements

- React 19, `react-router`, plain CSS (no UI kit). Vietnamese copy with correct diacritics. Works from 360px wide up to desktop.
- Routes: `/dang-nhap`, `/dang-ky`, `/` (after sign-in; for now a page with the greeting "Xin chào, <tên>" and a "Đăng xuất" button; the rooms piece replaces its body with the lobby).
- A session context that loads `GET /api/auth/me` once and exposes `user`, `providers`, `refresh`, `signOut`. A `RequireAuth` wrapper sends signed-out visitors to `/dang-nhap?returnTo=<current path>`; after sign-in or sign-up (any method) they land on `returnTo`.
- Sign-in page: email, password, "Đăng nhập", link to sign-up, three provider buttons (Google, Facebook, X). A provider that is not configured renders a disabled button labelled "<Tên> (chưa cấu hình)". Field-level validation messages; server error shown inline.
- Visual direction: a warm board-game look (wood and felt tones, the four horse colours red, blue, yellow, green as accents), large touch targets. The same stylesheet tokens will be reused by the lobby and room pages, so put colour, spacing and type tokens in `web/src/styles/tokens.css`.
- Stable `data-testid` on inputs and buttons used by e2e.

## Tests

- Playwright (`npm run e2e`) against `vite` on port 5173 with a local D1 (`wrangler d1 migrations apply DB --local` in the web-server command or global setup), Chromium only:
  - sign up, land on `/`, reload keeps the session, sign out, sign in again; wrong password shows the generic error; duplicate email is rejected.
  - `returnTo`: visiting `/r/ABC234` signed out leads to sign-in and back to `/r/ABC234` afterwards (the page itself may be a 404 view for now).
  - for each of google, facebook, x: with the mock provider configured, the button completes the flow and the greeting shows the mock profile name; signing in a second time reuses the same user.
  - with no credentials configured the three buttons show "(chưa cấu hình)" and are disabled.
  - Google verified-email linking signs into the existing email account; Facebook with the same email creates a separate user.
- The mock provider is a small Node HTTP server under `e2e/mock-oauth/` started by Playwright, implementing the authorize, token and profile endpoints of the three providers and validating `redirect_uri`, `state`, the client credentials and the PKCE verifier.
- Vitest unit tests only where logic is non-trivial (password hashing round trip, `returnTo` sanitising).

## Done means

`npm run typecheck`, `npx vitest run` (if you added unit tests), `npm run build` and `npm run e2e` all pass. Stop every process you start (port 5173 and the mock port must be free when you finish).
