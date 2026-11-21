---
title: Horse names, sound, shake to roll, host pause and close
status: completed
---

# Horse names, sound, shake to roll, host pause and close

## Outcome

1. Every horse on the 3D board carries a label with its name; the default name is its number (1–4).
2. A seated player can rename the four horses of their own colour; everyone in the room sees the names on the board and in the move buttons.
3. The game has sound: background music on the entry, sign-in, lobby and waiting screens; different music during a match; a dice sound on every roll; hoof beats for every cell a horse moves (with a knock when it kicks an opponent home), timed with the board animation; a reminder chime when the turn reaches the local player (and once more when 10 seconds are left).
4. On a phone, shaking the device rolls the dice when it is the player's turn to roll.
5. The host can pause a running match and resume it; while paused nobody can roll or move, the turn clock and CPUs stop.
6. The host can close a running room; everyone is sent out with "Chủ phòng đã đóng phòng." and the room disappears from the lobby.

## Constraints

- Server stays authoritative: names, pause and close are room state changed only through `RoomClientMessage`, validated in `RoomDO`.
- Rooms persisted before this change must still load (new fields optional in storage).
- No third-party audio files: licences cannot be verified here, so all music and effects are synthesised with the Web Audio API.
- Browsers start audio only after a user gesture; iOS needs a permission tap for motion events.
- Cloudflare free tier; no D1 migration.

## Non-goals

Names remembered across rooms or stored on the account, per-track volume sliders, haptics, chat, a vote to pause, closing a room from the waiting screen, pausing on a timer.

## Acceptance criteria

1. Board labels show `1`–`4` by default and the new name after a rename, in both players' browsers.
2. A player cannot rename another colour's horses (server rejects); names are cleaned like display names and limited to 12 characters; an empty name falls back to the number.
3. Music changes between the lobby/waiting screens and the match; dice and turn sounds play; a sound toggle (music, effects) persists in `localStorage`.
4. On a coarse-pointer device with motion support, a shake rolls the dice on the player's roll turn only; iOS shows an enable button that requests motion permission.
5. While paused: roll/move are rejected with `paused`, no CPU plays, the countdown is hidden, and on resume the player on turn has the time that was left when the pause began. A host who stays disconnected through the waiting grace during a pause hands the role to a connected player so the room is not stuck.
6. Close: every socket receives `closed_by_host`, the clients show the message, the room is removed from the lobby and its URL answers 404.
7. `npm run typecheck`, `npm test` and `npm run e2e` pass.

## Decisions taken as defaults

- Names live on the seat and reset when its occupant changes (including a CPU taking over a leaver's seat); they survive a rematch.
- One message sets all four names (`{t:'horseNames', names}`): one write and one broadcast per edit.
- Resume keeps the remaining time instead of granting a new full turn, matching the existing "reconnecting never buys time" rule.
- The server accepts `closeRoom` in any status; the UI offers it in the match HUD while the game is not finished.
- Shake listening is on by default on Android-like browsers (no permission API) and behind a one-tap enable on iOS.

## Trade-offs

| Choice | Picked | Depends on | Fails first when |
|---|---|---|---|
| Labels | one DOM layer over the canvas, placed by the scene's frame loop | 16 small DOM nodes stay cheap | many more labels or very low-end phones; then switch to a canvas texture sprite |
| Labels (rejected) | drei `Html` | one React root per label | tried: under React 19 StrictMode the roots unmount mid-render and labels never appear |
| Labels (rejected) | troika `Text` | font fetched from a CDN with Vietnamese glyphs | offline / blocked CDN, broken diacritics |
| Audio | Web Audio synthesis | simple melodies are acceptable | users expect produced music; replace with licensed files behind the same `sound` API |
| Names scope | per seat in the room | names matter within one match | players want persistent names; add `localStorage` or account storage later |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Protocol and `RoomDO`: names, pause/resume, close; unit tests | done |
| 2 | Client: labels, rename dialog, pause/close UI, sound engine, hoof sounds, shake | done |
| 3 | e2e for rename, pause, close; typecheck, tests; PR | done |
