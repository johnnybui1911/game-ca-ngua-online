# Phase 1: guest identity, upgrade paths, entry screen and prompt

## Context

Today every page sits behind `RequireAuth` and every room route calls `getSessionUser`. A person who receives a room link must register before entering. The `users` table already allows a null email and a null password hash, and rooms, lobby and invites only ask "which user owns this session", so a guest is a user row with a display name and a session. Nothing under `worker/rooms/` needs to know about guests except the one route change below.

## Read first

- `plan.md` in this directory (outcome, acceptance criteria, defaults).
- `shared/protocol.ts` (accounts section), `worker/auth/**`, `migrations/0001_auth.sql`.
- `web/src/App.tsx`, `web/src/auth/**`, `web/src/lobby/LobbyPage.tsx`, `web/src/room/MatchView.tsx`, `web/src/room/RoomPage.tsx`.
- `e2e/**`, `playwright.config.ts`, `e2e/run.mjs`, `.dev.vars.e2e-*`, `e2e/prod/smoke.spec.ts`.
- `docs/oauth-setup.md`, `README.md`.

## Server

Schema (new migration file, never edit `0001_auth.sql`):

- `users.is_guest INTEGER NOT NULL DEFAULT 0`.
- A small table for counting guest creations per client address and time window.

Contract (`shared/protocol.ts`, accounts section; you may edit this section only):

- `MeResponse.user` gains `guest: boolean`. `PublicUser` itself is unchanged, so room and lobby messages are unchanged.
- `POST /api/auth/guest` with `{ displayName }` answers `MeResponse` and sets the session cookie.

Behaviour:

- `POST /api/auth/guest`: same-origin check like the other state-changing routes; the display name goes through the existing validation; creates a user with `is_guest = 1`, no email, no password, and a normal session. A request that already carries a valid session answers 409 `already_signed_in`.
- Limit: at most 10 guest creations per client address per hour, answering 429 `too_many_guests` with a Vietnamese message. The address comes from `CF-Connecting-IP` (a fixed key when the header is absent, as in local dev); store a hash of it, not the address. The limit value may be overridden by one optional variable read from the worker environment (for local e2e env files only, never `wrangler.jsonc`), so the suite can create many guests and one spec can prove the 429 with a low limit or by exhausting the default.
- `POST /api/auth/signup` while the session belongs to a guest upgrades that user in place: sets email, password hash and display name, clears `is_guest`, keeps the user id and the session. A taken email answers 409 `email_taken` and changes nothing. Without a guest session it behaves as today.
- `POST /api/auth/signin` while the session belongs to a guest signs in to the existing account as today, then deletes the guest user (its sessions go with it).
- OAuth callback while the session belongs to a guest:
  - provider account already linked to a user: sign in as that user and delete the guest user;
  - Google-verified email owned by another user: the existing linking rule applies to that user (including clearing its password and sessions), then delete the guest user;
  - otherwise: link the provider account to the guest user, clear `is_guest`, store the verified email on it when no other user holds it, keep the display name the guest chose, keep the user id.
  The guest is identified from the session cookie at callback time; nothing about it may be taken from a query parameter.
- Deleting a guest user must not break rooms: a deleted user simply never reconnects.
- Cleanup: when a guest is created, also delete guests that have no unexpired session (bounded work per request, for example at most 50 rows).
- `GET /api/rooms/:code` answers its summary without a session, so the entry screen can name the room. Every other room and lobby route still requires a session. This is the only edit allowed under `worker/rooms/`.

## Client

- New entry screen at `/bat-dau` (Vietnamese copy, existing design tokens, 360px to desktop): heading, one display-name field, primary button "Chơi ngay", secondary link "Đã có tài khoản? Đăng nhập". With `returnTo=/r/CODE` it loads the room summary and shows "Vào phòng <tên phòng> của <chủ phòng>" with the button "Vào phòng"; an unknown code shows "Không tìm thấy phòng" with a way to continue to the lobby. After creating the guest it navigates to `returnTo` (sanitised as elsewhere) or `/`.
- `RequireAuth` sends signed-out visitors to `/bat-dau?returnTo=...` instead of the sign-in page. A signed-in visitor (guest or registered) opening `/bat-dau` is sent on to `returnTo`.
- The session context exposes `guest` and a `playAsGuest(displayName)` action.
- Sign-in and sign-up pages stay reachable. A provider without credentials is not rendered at all; when none is configured the "hoặc" divider is not rendered either. On the sign-up page a guest sees their current name prefilled and the heading "Lưu tài khoản".
- Lobby: a guest sees a compact notice "Bạn đang chơi với tư cách khách" with a "Lưu tài khoản" link to `/dang-ky?returnTo=/`, and the sign-out control reads "Thoát" with a confirmation that the guest name and seats will be lost. Registered players see what they see today.
- End-of-match dialog (`MatchView`): a guest additionally sees a save-account block: one line of copy, an inline form (email, password) that calls sign-up without leaving the room, and a button per configured provider that starts the OAuth flow with `returnTo` set to the room. On success the block is replaced by a short confirmation and the session context reflects the registered user. The block can be dismissed and must not hide "Chơi lại" or "Về sảnh". Registered players never see it.
- Stable `data-testid`s for everything e2e touches.

## Tests

Vitest for pure logic you add (the per-address window counter, any name or state helpers).

Playwright, mock run unless stated:

- A fresh context opening `/r/CODE` lands on the entry screen naming the room, enters a name, and is seated; the host sees the name. No email field is shown on the way.
- A fresh context opening `/` enters a name and reaches the lobby; reload keeps the same user id.
- A guest creates a room, a second guest joins by link, they play a match to the end; the guest winner and loser both see the save-account block; a registered player in the same kind of match does not.
- Upgrade by email from the end-of-match block: same user id before and after, still in the room with the same seat, reload keeps the session, and signing in with that email and password in a new context yields the same user id.
- Upgrade with a taken email shows the inline error and leaves the guest a guest.
- Guest, provider never seen before: after the flow the user id is unchanged, the name the guest chose is kept, `guest` is false.
- Guest, provider already linked to another user: after the flow the user id is that other user's and the guest id no longer signs in anywhere (its old session cookie yields no user).
- Guest signing in by email to an existing account: switched to that account.
- The 429 on guest creation.
- No-credentials run: no provider button and no divider on sign-in, sign-up, or the end-of-match block.
- Update existing specs whose expectations change (signed-out redirects, the "(chưa cấu hình)" checks), without weakening what they prove.
- `e2e/prod/smoke.spec.ts`: the second player and the solo player enter as guests through the entry screen; add a guest-to-email upgrade inside a room that asserts the same seat afterwards. Guests created by the smoke use display names starting with `Khoi-smoke-` and upgraded emails keep the `prod-smoke-` prefix, so both can be removed from the database afterwards.

## Docs

- `docs/oauth-setup.md`: unconfigured providers are hidden, not labelled; a guest signing in with a provider keeps or switches user as described above.
- `README.md`: one paragraph on guest play and the save-account prompt.

## Done means

`npm run typecheck`, `npx vitest run`, `npm run build` and the whole `npm run e2e` pass (e2e twice in a row, both green). Ports 5173 and 5199 free afterwards.
