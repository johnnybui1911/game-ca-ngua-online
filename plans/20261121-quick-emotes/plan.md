---
title: Quick emotes (preset chat bubbles)
status: proposed
---

# Quick emotes (preset chat bubbles)

## Outcome

A seated player in a room, while it is waiting, being played, paused (PR #16) or finished, taps one of eight preset emotes ("😈 Đá nè!", "🙏 Tha cho em", "🎲 Ra 6 đi!", "👏 Hay quá", "😂", "⏳ Nhanh lên", ...). Every player in the room sees a bubble next to that player's seat for about three seconds. There is no free text, so there is nothing to moderate.

## Constraints

- Cloudflare free tier, no spend, no secrets in the repo; Vietnamese UI copy.
- Server-authoritative: the server decides who may send and how often, and stamps the seat; the client never names the sender.
- Emotes are ephemeral. They are never written to Durable Object storage, never part of `RoomSnapshot` or `RoomState`, never bump `seq`, never touch the alarm or the lobby push. Storage-row capacity is an open concern (issue #6) and `RoomDO.commit` writes the whole room on every call (`persistAndSchedule`), so an emote must not go through `commit`.
- Game rules in `shared/game/types.ts` are untouched.

## Non-goals

Free text or user-supplied emoji, history or replay of emotes, emotes in the lobby, moderation tooling, per-emote analytics, emotes from CPU seats, 3D (over-the-horse) bubbles (both are open questions below).

## Grounding in the current code

- Wire contract: `shared/protocol.ts` `RoomClientMessage` (addCpu, removeCpu, start, roll, move, rematch, leave) and `RoomServerMessage` (`state`, `error`).
- Server: `worker/rooms/room-do.ts` `handleMessage` (socket `TokenBucket(SOCKET_BURST=100, SOCKET_REFILL_PER_SEC=50)`, 1024-byte cap, `SessionGuard.hasEnded`) then `parseClientMessage` then `handle`. `handle` begins with `seatIndexOfUser(...) < 0 -> not_seated`. `admit` seats every connecting user or refuses and closes the socket, so every live socket belongs to a seated human: there are no spectators today. `leave` closes that user's sockets.
- Per-user budgets already exist in memory only: `hostBudget = new KeyedTokenBuckets(HOST_ACTION_BURST, HOST_ACTION_REFILL_PER_SEC)`; the emote budget follows this pattern, separate from it.
- Broadcast today: `commit` sends the same `stateMessage` string to `openSockets()`. Emotes need a second, write-free broadcast.
- Client: `web/src/room/useRoomConnection.ts` `onMessage` assumes every non-`state` message has a `code` (`msg.code in FAILURE_TEXT`); a message without `code` would throw, so the new message type needs its own branch. `batches.ts` carries only `state` batches keyed by `seq`; emotes deliberately stay outside it.
- UI: `MatchView.tsx` renders `<ul className="hud-players">` with `<li className="hud-player" data-testid="hud-player-<color>">` per occupied seat; `WaitingView.tsx` renders `<li className="seat" data-testid="seat-<i>">`.

## Acceptance criteria

1. In a waiting room with two browsers, A taps "😈 Đá nè!": both A and B show a bubble containing "Đá nè!" on A's seat (`emote-bubble-<seat>`), and it disappears after about 3 s.
2. The same works during a match (bubble on A's `hud-player-<color>` tile), while the game is paused, and on the finished screen.
3. An emote never changes `room.seq` and never causes a Durable Object storage write: a raw socket that records `state` messages sees none triggered by an emote, and `RoomDO` code for emotes calls neither `commit` nor `persistAndSchedule` nor `ctx.storage`.
4. A client that reconnects or reloads sees no bubbles from before; only emotes sent after it connected.
5. The server accepts at most a burst of 3 emotes per user and then one every 2 s; extra emotes are dropped silently, are not relayed, and do not close the socket. Two sockets of one user share that budget.
6. A message with an unknown emote id gets `error` code `bad_emote` and is not relayed; the wire carries the id only (no emoji or text).
7. Only a seated human can send; a user without a seat gets `not_seated` and nothing is relayed.
8. A local mute toggle ("Ẩn biểu cảm") hides incoming bubbles and silences their sound; it persists in `localStorage` and defaults to off (bubbles shown).
9. Screen readers get one polite announcement per shown emote ("<tên>: Đá nè!"); bubbles are `aria-hidden`; with `prefers-reduced-motion` the bubble does not animate.
10. With PR #16's effects sound on, another player's emote plays one soft sound; with effects off it is silent.
11. `npm run typecheck`, `npm test` and `npm run e2e` pass, including the new unit and e2e tests.

## Decisions taken as defaults

- Eight emotes, ids `taunt`, `mercy`, `six`, `nice`, `laugh`, `hurry`, `sorry`, `unlucky` (copy in phase 1). The catalogue lives in `shared/emotes.ts`; the wire carries `id` only.
- Server message `{ t: 'emote', seat, id }` where `seat` is the sender's index in `room.seats`, derived by the server from the socket's user. The sender receives it too (one rendering path).
- Budget: burst 3, then 1 per 2 s per user per room (`EMOTE_BURST = 3`, `EMOTE_REFILL_PER_SEC = 0.5`), in memory only. Over budget = silent drop (the picker also locks itself for 2 s after a tap, so a normal player never meets the drop).
- Bubble lasts 3 s; a newer emote from the same seat replaces the older one (one bubble per seat, no stacking).
- Emotes are allowed in every room status, including paused.
- Display in the HUD tile and the waiting-room seat only.
- No analytics counter.

## Open questions for the user

1. Should CPU seats react (for example a CPU with a "😈 Đá nè!" after it kicks a horse)? Default: no. It is cheap (server picks an id on a `kicked` event, same broadcast) but it changes the feel of playing the CPU and needs rate limiting per event.
2. Also show the bubble over the player's horses in 3D? Default: no, HUD only. PR #16's horse-name labels are a DOM layer positioned each frame (`GameScene.tsx`), so it is feasible later at the cost of overlapping name labels and more per-frame work.
3. Count emotes in the daily funnel (`shared/analytics.ts`, `daily_events`)? Default: no. Each `countEvent` is a D1 upsert, i.e. a row written per emote; the alternative is a once-per-match `match_with_emotes` event (at most one write per match). Decide whether the number is worth any D1 writes.
4. Emote set and copy: is the list of eight right, and should "😂" stay emoji-only? (Rules are not touched; this is only copy.)
5. Should a muted player still see their own bubbles? Default: yes, own bubbles always show so the tap has feedback.
6. Should emotes be sendable while the host has paused the game? Default: yes.

## Composition with PR #16 (assumed merged first)

PR #16 (`feat/horse-names-sound-host-controls`) adds `horseNames`, `pause`, `resume`, `closeRoom` client messages, `Seat.horseNames`, `RoomSnapshot.paused`, a `nameBudget` in `RoomDO`, the `sound` engine (`web/src/audio/sound.ts`, with `setSettings`, effects flag) and a Menu/`SoundControls` in the HUD. Overlaps to resolve at implementation time (rebase onto main after #16 lands; none is a semantic conflict):

| File | Overlap | Resolution |
|---|---|---|
| `shared/protocol.ts` | both extend `RoomClientMessage`/`RoomServerMessage` | append the `emote` variants after #16's; no shared fields |
| `worker/rooms/room-do.ts` | `parseClientMessage` switch, `handle` switch, budgets next to `hostBudget`/`nameBudget` | add one case to each switch and one `emoteBudget` field |
| `worker/rooms/constants.ts` | new constants | add `EMOTE_BURST`, `EMOTE_REFILL_PER_SEC` |
| `web/src/room/useRoomConnection.ts` | #16 adds `closed_by_host` failure text | add the `emote` branch before the `code in FAILURE_TEXT` check; add `emotes` to `RoomConnection` |
| `web/src/room/MatchView.tsx` | #16 adds pause/resume buttons, Menu, name dialog in the HUD | put the picker button in `hud-bottom` next to existing buttons; wrap bubble inside `hud-player` `li` |
| `web/src/room/WaitingView.tsx` | #16 adds the horse-names entry | add the picker under the seat list |
| `web/src/room/room.css` | styles | new `.emote-*` classes only |
| `web/src/audio/sound.ts` | effects | add `playEmote()` using the existing effects gate (`effectsContext()` returns null when effects are off) |
| `README.md` | message list | add emotes line |

If #16 does not merge first, phases 1 and 3 are independent of it; only the sound step in phase 2 and the paused-state e2e step depend on it.

## Phases

| # | Phase | Brief |
|---|---|---|
| 1 | Contract and server relay | [phase-01-contract-and-server.md](phase-01-contract-and-server.md) |
| 2 | Client picker, bubbles, mute, sound, accessibility | [phase-02-client-ui.md](phase-02-client-ui.md) |
| 3 | e2e, docs, optional counter, rollout | [phase-03-e2e-docs-rollout.md](phase-03-e2e-docs-rollout.md) |
