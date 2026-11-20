# Phase 3: rooms, lobby, invites and the match HUD

## Goal

Everything between "signed in" and "someone won": the lobby, creating and joining rooms, sharing and inviting, seats with humans and CPUs, the server-authoritative match loop, and the DOM controls around the 3D board.

## Read first

- `shared/protocol.ts`: rooms, room socket and lobby socket sections. Contract; do not edit.
- `shared/game/types.ts`, `shared/game/engine.ts`, `shared/game/cpu.ts`: the rules engine you drive. Read-only.
- `worker/auth/session.ts` (`getSessionUser`), `worker/index.ts`, `worker/env.ts`, `wrangler.jsonc`.
- `web/src/App.tsx`, `web/src/auth/**` (session context, `RequireAuth`), `web/src/styles/tokens.css`, `web/src/api.ts`.
- `web/src/scene/props.ts` and `web/src/scene/GameScene.tsx`: the 3D board is built by another piece at the same time. Mount it through `React.lazy(() => import('../scene/GameScene'))` with the `GameSceneProps` contract and never edit files under `web/src/scene/`. Until that piece lands the component renders an empty box, so every action must also be possible through your DOM controls.
- `playwright.config.ts`, `e2e/**`: the existing e2e setup you extend.

## Files you own

- `worker/rooms/**`; in `worker/index.ts` the lines mounting your routes and exporting your Durable Object classes; in `worker/env.ts` and `wrangler.jsonc` the Durable Object bindings and migrations (SQLite-backed classes, `new_sqlite_classes`, required on the free plan) plus any test-only timing variable.
- `web/src/lobby/**`, `web/src/room/**`; in `web/src/App.tsx` the routes `/` (lobby, replacing the greeting page body) and `/r/:code`, and the provider that keeps the lobby socket open.
- `e2e/room*.spec.ts`, `e2e/helpers/**`, and additions to `playwright.config.ts`.

## Server requirements

Routes (all require a session; answer 401 `ApiError` otherwise):

- `POST /api/rooms`: validates name (1 to 40 characters after trimming), visibility, seats (2 to 4); generates a code from `ROOM_CODE_ALPHABET` with a cryptographic RNG, retrying on collision; initialises the room with the caller as host, already seated in seat 0 (shown as disconnected until their socket opens; the usual disconnect grace applies from creation). A user may create at most 5 rooms per minute.
- `GET /api/rooms/:code`: summary or 404.
- `GET /api/rooms/:code/ws` and `GET /api/lobby/ws`: WebSocket upgrades, rejecting requests whose `Origin` is not the request's own origin.

`RoomDO` (one per code, `idFromName(code)`), using the WebSocket Hibernation API and persisting its state in Durable Object storage so a restart or hibernation loses nothing:

- Seats follow `SEAT_COLORS[seatCount]`.
- Connecting while `waiting`: a user already seated reconnects to their seat; otherwise they take the first empty seat; with no empty seat the socket gets `error` code `room_full` and closes. Connecting while `playing` or `finished`: a seated user reconnects; anyone else gets `game_in_progress` and closes. A user may hold several sockets (tabs); `connected` is true while at least one is open.
- `addCpu` / `removeCpu` / `start` / `rematch`: host only, validated against status. CPU names are "Máy 1".."Máy 3". `start` needs at least two occupied seats; the game uses exactly the colours of occupied seats; empty seats stay out of the game. This allows one human with one to three CPUs.
- `roll`: only the socket's user, on their turn, in phase `roll`. The server draws the die with `crypto.getRandomValues` and rejection sampling (uniform 1..6). `move`: validated against `legalHorses`.
- Every accepted action broadcasts one `state` message with the engine's events and a snapshot whose `seq` increased by one. Invalid actions answer `error` to that socket only and change nothing. Malformed JSON or unknown message types are ignored after an `error`; oversized messages (over 1 KB) close the socket.
- CPU seats and automatic play run from Durable Object alarms, one action (a roll, or a move) per alarm, so the client can animate each: CPU actions fire about 1.2 s after the previous event. A connected human has 30 s per action (`turnDeadline` in the snapshot); at the deadline the server acts for them (rolls, or moves the CPU's choice). A disconnected human's actions are taken by the CPU after 3 s, until they reconnect.
- `leave`, or a seated human who stays disconnected: while `waiting` the seat empties after 30 s of disconnection (immediately on `leave`); while `playing`, `leave` turns the seat into a CPU for the rest of the game. When the host leaves or loses the seat, the earliest-seated remaining human becomes host.
- The room closes (state deleted, lobby entry removed, alarms cancelled, later lookups answer 404) when no human is seated, when a `waiting` or `finished` room has had no connected human for 10 minutes, or when a `playing` room has had no connected human for 10 minutes.
- Timings come from one constants module; an optional test-only variable (for example `ROOM_FAST_TIMERS`) shortens CPU delay, the turn deadline and the disconnect grace so e2e can finish full games quickly. It must not be settable by a request and must be unset in production config.
- After every change the room pushes its `RoomSummary` and visibility to the lobby object through an RPC or internal fetch.

`LobbyDO` (single instance), Hibernation API:

- Tracks online users (at least one lobby socket) and the summaries of open rooms. Broadcasts `lobby` with public rooms that are `waiting` or `playing` and the online list (without duplicates, excluding nobody) on connect and on change; coalesce bursts so one change causes one broadcast.
- `invite`: the sender must be seated in room `code` (ask the room), the target must be online and not the sender; delivers `invited` to all of the target's sockets. Private rooms can be invited to. At most one invite per sender, target and room every 10 s; violations answer `error`.

## Client requirements

Vietnamese copy with correct diacritics, the existing design tokens, 360px phones to desktop, stable `data-testid`s for e2e.

- App-wide while signed in: one lobby socket (reconnecting with backoff). An incoming invite shows a toast "<Tên> mời bạn vào phòng <tên phòng>" with "Vào" and "Bỏ qua", on every page.
- Lobby `/`: greeting and sign-out; "Tạo phòng" (name, công khai / riêng tư, 2 to 4 seats) which navigates to the new room; "Nhập mã" (accepts lower case and pasted links, shows "Không tìm thấy phòng" on 404); the public room list with seats taken and status, "Vào" disabled when full or playing; empty state text.
- Room `/r/:code`, waiting view: room name and code; seats with colour, occupant, connection state; for the host "Thêm CPU" on empty seats, "Bỏ CPU" on CPU seats and "Bắt đầu" (disabled with the reason until two seats are occupied); for everyone "Sao chép link" (clipboard, with confirmation), "Chia sẻ" (`navigator.share` when available, hidden otherwise), "Mời người đang online" (list from the lobby socket, excluding people already seated, each with "Mời" and a sent state), "Rời phòng". Errors `room_full`, `game_in_progress` and 404 render a clear message with a link back to the lobby.
- Room, match view: the lazy-loaded `GameScene` filling the screen with a HUD on top: players with colour, name, CPU or offline badge and horses home count; whose turn it is ("Lượt của bạn" / "Lượt của <tên>"); the die value; "Đổ xúc xắc" when it is your roll; when it is your move, one button per legal horse describing the move ("Quân 2: ra quân", "Quân 1: đi 4 ô", "Quân 3: lên bậc 5", with "đá quân <màu>" when it kicks) in addition to tapping the horse in the scene; a countdown to `turnDeadline`; "Rời phòng" with confirmation. On `won`: a dialog "<Tên> thắng!" with "Chơi lại" (host; others see "Chờ chủ phòng") and "Về sảnh".
- The room socket reconnects with backoff and shows "Đang kết nối lại…"; after reconnecting the view is rebuilt from the snapshot. Reloading the page mid-game returns to the same seat.
- Pass `events` and `room` from the same server message to the scene.

## Tests

- Vitest for pure logic you write (for example move descriptions, code parsing from a pasted link).
- Playwright (Chromium), using the existing auth helpers to create users through the API:
  - create a private room, second user joins through `/r/CODE` while signed out (sign-up, then lands in the room), both see each other seated.
  - join by code from the lobby; unknown code shows the not-found message; a public room appears in another user's lobby list and a private one does not.
  - host adds and removes a CPU; start is disabled with one occupant and enabled with two.
  - invite: user B online in the lobby receives the toast from host A and "Vào" seats them in the room.
  - copy link puts the `/r/CODE` URL on the clipboard.
  - one human plus three CPUs play a full game to the win dialog (fast timers; the human clicks roll and the first move button whenever offered).
  - two humans in two browser contexts play a full game to the win dialog; both see the same winner.
  - reload mid-game returns to the same seat with the same board state; a non-member opening a playing room sees the in-progress message.
  - a client sending `roll` out of turn or `move` with an illegal horse gets `error` and the snapshot does not change.

## Done means

`npm run typecheck`, `npx vitest run`, `npm run build` and `npm run e2e` (the whole suite, including the existing auth specs) pass. Port 5173 and any mock port are free when you finish.
