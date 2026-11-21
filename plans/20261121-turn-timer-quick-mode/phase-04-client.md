# Phase 4: client controls, countdown, animation budget, e2e

## Context

- `WaitingView.tsx` lists seats, host buttons (`add-cpu-<i>`, `remove-cpu-<i>`, `start-button`) and a read-only view for others (`await-host`). PR #16 adds `rename-horses`, `HorseNamesDialog`, `SoundButton` there.
- `MatchView.tsx` shows the countdown from `room.turnDeadline` through `useCountdown` / `secondsLeft` (`web/src/room/countdown.ts`), the roll button (`roll-button`) and one `move-button-<horse>` per legal horse. PR #16 adds pause/close controls and shake.
- `web/src/scene/director.ts`: a batch is scaled to `BATCH_BUDGET = 0.6` s in total (`total > BATCH_BUDGET`); more than `MAX_WAITING = 2` queued batches snaps to the latest state. `SceneContent.tsx` creates `new Director(createView(state), setBusy)`.
- `last-roll.ts` already handles a batch containing both a `rolled` and a `moved` event (newest roll in the batch wins), so the die display needs no change for merged batches.

## Requirements

1. Waiting room: host controls for turn time, "Ván nhanh" and "Tự đổ xúc xắc"; read-only summary for others.
2. Match: countdown unchanged for normal play; autopilot banner and "Tôi đã quay lại"; "Tự động" tag on an autopilot seat in the seat/HUD list.
3. Quick animation pacing that matches the server's `quickSegmentMs`.
4. No change to the normal match look and feel.

## Files to change

- `web/src/room/useRoomConnection.ts`: no change expected (`send` already takes `RoomClientMessage`); confirm.
- `web/src/room/WaitingView.tsx`: a "Cài đặt ván" section above the start row, rendered for everyone from `room.settings`:
  - `data-testid="turn-seconds"`: a `<select>` (host) / text (others), options from `TURN_SECONDS_OPTIONS`, label "Thời gian mỗi lượt", values "10 giây", ... "60 giây".
  - `data-testid="quick-toggle"`: checkbox "Ván nhanh" with hint "Tự đi khi chỉ có một nước, máy và hoạt ảnh nhanh hơn. Luật không đổi." Turning it on sends `{ t: 'settings', settings: { turnSeconds: 20, quick: true, autoRoll } }` only when the current `turnSeconds` is the default 30; turning it off keeps the chosen time.
  - `data-testid="auto-roll-toggle"`: checkbox "Tự đổ xúc xắc" with hint "Máy đổ giúp sau 1,5 giây."
  - Each change sends one `settings` message with the whole object; controls are disabled while the previous change is unacknowledged or on `too_fast`; the existing `actionError` area shows server errors.
- `web/src/room/MatchView.tsx`: when `room.settings.quick` show a small "Ván nhanh" tag in the HUD. For the local seat with `auto === true` show "Đang chơi tự động vì bạn không thao tác." with `data-testid="autopilot-banner"` and a button `data-testid="autopilot-back"` sending `{ t: 'back' }`. Other seats with `auto` get "(tự động)" in the existing seat list.
- `web/src/scene/director.ts`: constructor option `{ budgetPerSegment?: number }`; when set, a batch's budget is `budgetPerSegment × (number of roll and move segments)` instead of the fixed `BATCH_BUDGET`. Normal rooms pass nothing. Export `QUICK_SEGMENT_SECONDS = 0.35` (must stay below the server's `quickSegmentMs` of 400 ms so a batch never outlasts the interval to the next one; a comment states the relation).
- `web/src/scene/props.ts`, `GameScene.tsx`, `SceneContent.tsx`: pass `quick: boolean` from `room.settings.quick` down to the `Director` (these files are also touched by PR #16).
- `README.md`: a short "Cài đặt ván" paragraph (phase 5 owns the funnel part).

## Steps

1. Types flow from `shared/protocol.ts` (phase 2); fix compile errors in components that build a `RoomSnapshot` literal (tests, `scene/dev/DevApp.tsx`).
2. Waiting-room controls and match UI.
3. Director budget option and tests.
4. e2e.

## Tests

Unit (vitest):
- `director.test.ts`: with `budgetPerSegment: 0.35`, a combined roll+move batch finishes within `0.7 + 0.05` s; a roll-only batch within `0.35 + 0.05` s; the normal director still finishes within `BATCH_BUDGET + 0.05` (existing test). A quick CPU-only sequence of 100 combined batches arriving every `0.8` s never snaps (asserts the final state equals the game and `MAX_WAITING` is never exceeded).
- A small pure helper for the preselect rule (`nextSettings(current, change)`) with tests: quick on from 30 s gives 20 s; quick on from 15 s keeps 15 s; quick off keeps the time.

e2e (Playwright, `e2e/room-quick.spec.ts`, using `ROOM_FAST_TIMERS=1` so one second is 50 ms through `turnUnitMs`; no ports or servers started by this planning work):
- Host changes the turn time and toggles quick: a second browser (non-host) sees the same values read-only; the non-host has no enabled control.
- A quick 1 human + 3 CPUs match runs to the win dialog (same flow as `room-game.spec.ts`); the test asserts at least one `state` message whose `events` contain both `rolled` and `moved` for the same colour, observed through the existing page hooks used by the helpers in `e2e/helpers/rooms.ts`.
- Turn-time timeout and autopilot: with 10 s (500 ms in fast mode) a human who never acts is played for; after two misses `autopilot-banner` shows; clicking `autopilot-back` hides it.
- Settings survive a rematch (host rematches, the controls show the previous values).
- A normal match is unchanged: no `autopilot-banner`, no merged events.

## Validation

`npm run typecheck && npm test && npm run e2e`. Manual check on a phone-sized viewport that a 6-cell quick move is still legible at 0.35 s; if not, raise `QUICK_SEGMENT_SECONDS` and the server's `quickSegmentMs` together (never one alone).

## Risks

- Layout: the waiting room is narrow on phones; a stacked section with 44 px tap targets, checked in the e2e small viewport.
- Merge conflicts with PR #16 in `WaitingView.tsx` / `MatchView.tsx`: place the new section as its own component (`GameSettings.tsx`) so only one JSX line is added to each file.
- Hint text must not suggest the rules changed.

## Rollback

Remove the settings section and tag; the server keeps working on defaults.
