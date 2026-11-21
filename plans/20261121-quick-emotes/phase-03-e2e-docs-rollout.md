# Phase 3: e2e, docs, optional counter, rollout

## Context

`e2e/helpers/rooms.ts` provides `newPlayer`, `createRoom`, `startTwoPlayerGame`, and the raw-socket helpers `openRawSocket`, `rawSend`, `rawLog`, `rawCloses`, `lastRawState`. `e2e/room-presence.spec.ts` shows the two-browser style. Playwright runs the app with fast timers; emote timings are not shortened by `ROOM_FAST_TIMERS`, so tests use real 2-3 s waits.

## Files to change

- `e2e/room-emotes.spec.ts` (new).
- `README.md`: the room socket message list (add `emote`, ephemeral), the DO storage note (emotes never written).
- `shared/analytics.ts` and `worker/rooms/room-do.ts` only if open question 3 is answered "count".

## e2e scenarios (`e2e/room-emotes.spec.ts`)

1. Waiting room, two browsers: A clicks `emote-open` then `emote-taunt`; A and B both show `emote-bubble-0` containing "Đá nè!"; `emote-live` on B holds the same text; after about 3.5 s the bubble is gone on both.
2. Match: `startTwoPlayerGame`; B sends `emote-hurry`; A sees the bubble inside `hud-player-<B's colour>`; the board stays clickable (bubble has `pointer-events: none`; assert A can still start auto play afterwards).
3. Ephemeral: with a raw socket `R` for A recording messages, send an emote from B and verify `R` gets `{t:'emote', seat, id}` and no `state` message follows it, and `room.seq` from `lastRawState` is unchanged before and after.
4. Reconnect: B reloads after A's emote; B shows no `emote-bubble-*`.
5. Flood: raw socket sends 10 `{t:'emote', id:'laugh'}` in one tick; `rawLog` of a second raw socket contains at most 3 `emote` messages (`EMOTE_BURST`); `rawCloses` of the flooding socket is empty (silent drop, no `rate_limited` close); after 2.2 s one more emote is relayed.
6. Validation: `rawSend({ t: 'emote', id: 'nope' } as never)` -> `error` with code `bad_emote`, and no `emote` message reaches the other socket. An emote with extra text field (`text: 'hi'`) relays only `id` and `seat` (asserts nothing free-form travels).
7. Mute: B ticks `emote-mute`; A's emote shows no bubble on B but A still sees its own; reload B keeps the mute (localStorage).
8. Paused (needs PR #16): host pauses, a guest sends an emote, it is shown.
9. Seatless: a third user opening a raw socket mid-game is refused with `game_in_progress` (existing behaviour) and cannot send; assert no `emote` relayed. Optionally also assert a raw socket after `leave` gets closed with 4001 and an emote sent is not relayed.

## Docs

- `README.md`: one bullet under the WebSocket/architecture section: emotes are a fixed catalogue in `shared/emotes.ts`, relayed by `RoomDO` without storage, rate limited per user (`EMOTE_BURST`, `EMOTE_REFILL_PER_SEC`).
- No funnel change by default: the README funnel paragraph stays as is.

## Optional counter (only if open question 3 is "count")

Add `'match_with_emotes'` to `ServerEvent` in `shared/analytics.ts`; in `RoomDO` keep an in-memory boolean `emotesSentThisMatch`, set on the first accepted emote of a match, `countEvent(this.env, 'match_with_emotes', NO_SOURCE)` once via `ctx.waitUntil`, reset when `status` becomes `'playing'` (in the `start` case) . Cost: at most one D1 upsert per match; the flag is lost on hibernation, which can at worst count a match twice. Do not count per emote: each `countEvent` is an `INSERT ... ON CONFLICT DO UPDATE` (see `worker/analytics/count.ts`), a row written per call, and emotes are the most frequent message type this feature adds. Add a count test in the analytics test file if one exists for events.

## Validation

`npm run typecheck`, `npm test`, `npm run e2e -- room-emotes` then the whole suite. Do not run against shared ports used by other sessions without coordinating.

## Rollout

1. Merge PR #16, rebase this branch, resolve the overlaps listed in `plan.md`.
2. Implement phases 1-3 in this worktree, one PR.
3. Deploy with the normal pipeline; no migration, no secret, no new binding.
4. Production smoke: two real browsers, one emote each way.

## Risks

- e2e timing flakiness on the 3 s expiry: assert disappearance with `toHaveCount(0, { timeout: 6000 })` rather than a fixed sleep.
- Flood test counts messages across a tick; the DO handles a socket's messages serially (`KeyedQueue`), so ordering is deterministic and 3 accepted is exact unless the budget refills mid-test (the 10 sends take far less than 2 s).

## Rollback

Revert the PR; nothing persisted, no D1 change (unless the optional counter was added, which only leaves an unused event name in `daily_events` rows).
