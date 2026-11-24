# Phase 2: web, e2e, docs

## Files

- `web/src/lobby/LobbyPage.tsx` `RoomList`: `joinable = playing && (r.takeoverSeats ?? 0) > 0`; label "Đang chơi · còn chỗ máy" when joinable; button disabled for `full && !joinable` or `playing && !joinable` (a playing room with CPUs is "full" by seat count, so the full check must yield).
- `web/src/lobby/LobbyProvider.tsx`: `LobbyValue.notify(text)` pushes a `notice` toast (reuses the stack and `lobby-notice`).
- `web/src/room/takeover-notice.ts` (new, pure): `takeoversAfter(queue, consumedSeq, myId): string[]` compares each unconsumed batch with the one before it in the queue and returns "<name> đã vào thay <cpu name>" for every seat that went from CPU to a human other than `myId`. Unit test `takeover-notice.test.ts`.
- `web/src/room/MatchView.tsx`: effect over `batches` (consumed seq in a ref, like `useGameSounds`) calling `notify` per text; menu button `menu-invite` "Mời người vào thay máy" while a CPU seat exists and the game is not finished: copies `inviteLink(room.code)`, notifies "Đã sao chép link mời." (or the failure text) and calls `reportInviteShared()`.
- `web/src/room/useRoomConnection.ts`: `FAILURE_TEXT.game_in_progress` = the new server text.
- `e2e/room-takeover.spec.ts` (new): host creates a public room with a CPU and starts; a second browser joins via the invite link → its seat label shows its name in place of "Máy 1", host sees the toast, joiner rolls when its turn comes; second scenario joins from the lobby list ("Đang chơi · còn chỗ máy", "Vào"). A third browser on a room with no CPU seat sees the refusal.
- `README.md`: one sentence where joining/leaving during a game is described.

## Validation

`npm run typecheck`, `npm test`, `npm run build`, `/tmp/ca-ngua-orch/e2e-lock.sh e2e/room-takeover.spec.ts` (+ `room-flow.spec.ts`, `room-presence.spec.ts` which cover join/leave).
