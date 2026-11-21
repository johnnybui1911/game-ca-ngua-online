# Phase 2: settings, turn timer, idle autopilot

## Context

- `Timings` (`worker/rooms/constants.ts`) is built once per Durable Object from the environment: `this.timings = timingsFor(env)` in the `RoomDO` constructor. `turnMs` (30 s) and `cpuDelayMs` (700 ms) are global.
- `planTurn` (`room-state.ts`) sets `dueAt = now + dueDelay(...)` and `actionDueAt = now + timings.turnMs` for a human seat. `dueDelay` returns `turnMs` for a connected human and `max(cpuDelayMs, playingDisconnectMs)` for a disconnected one.
- `reconcileConnections`, `resumeGame` (PR #16) and `leave` also read `cpuDelayMs` / `playingDisconnectMs`.
- `alarm()` plays one action when `now >= dueAt`: `applyRoll(game, drawDie())` or `applyMove(game, chooseCpuMove(game))`, then `planTurn`. A timed-out human keeps the seat and gets a full `turnMs` for the next action.
- `toSnapshot` publishes `turnDeadline = dueAt` for a connected human on turn.

## Requirements

1. `RoomSettings` in the contract and room state; defaults reproduce today's behaviour exactly.
2. Host-only `settings` message while `waiting`, validated server side.
3. Effective timings per room: `turnMs = turnSeconds × timings.turnUnitMs`.
4. Idle autopilot after 2 consecutive timeouts, reversible.
5. No new storage key and no new write path: the settings ride in `room` and are written by the commit the host action already causes.

## Files to change

- `shared/protocol.ts`
  - `export const TURN_SECONDS_OPTIONS = [10, 15, 20, 30, 60] as const;`
  - `export interface RoomSettings { turnSeconds: (typeof TURN_SECONDS_OPTIONS)[number]; quick: boolean; autoRoll: boolean }`
  - `export const DEFAULT_ROOM_SETTINGS: RoomSettings = { turnSeconds: 30, quick: false, autoRoll: false };`
  - `RoomSnapshot.settings: RoomSettings`; `Seat.auto: boolean` (autopilot, derived from the stored miss count).
  - `RoomClientMessage` gains `{ t: 'settings'; settings: RoomSettings }` ("Host only, while waiting") and `{ t: 'back' }` ("End your own autopilot").
- `worker/rooms/constants.ts`: `Timings` gains `turnUnitMs` (NORMAL 1000, FAST 50: a 10 s choice is 500 ms in e2e) and `autoRollMs` (NORMAL 1500, FAST 20). Keep the existing `turnMs` field as the default for rooms without settings, or derive it and remove it; pick one in implementation and migrate all callers (`room-state.test.ts` builds a literal `Timings` at line 19). Export `export const IDLE_AUTOPLAY_AFTER = 2;`.
- `worker/rooms/room-state.ts`
  - `RoomState.settings?: RoomSettings`; `StoredSeat.misses?: number` (optional so persisted rooms load; absent = 0).
  - `export function settingsOf(state): RoomSettings` (state.settings ?? DEFAULT).
  - `export function timingsOf(state, base: Timings): Timings` returning `{ ...base, turnMs: settingsOf(state).turnSeconds * base.turnUnitMs }`. All call sites that now take `this.timings` for a specific room take `timingsOf(room, this.timings)`: `planTurn` (start, apply, alarm), `reconcileConnections`, `resumeGame`, `nextWake`, `leave`, `onConnectionChange`, `commit`.
  - `dueDelay`: a connected human whose seat is on autopilot (`misses >= IDLE_AUTOPLAY_AFTER`) gets `cpuDelayMs`; `planTurn` sets `actionDueAt = null` for that seat so no countdown is shown.
  - `toSnapshot`: `settings`, `Seat.auto`, and `turnDeadline` from `actionDueAt` (equal to `dueAt` for a connected human today; phase 3 makes them differ with auto-roll).
- `worker/rooms/room-do.ts`
  - `parseClientMessage`: `case 'settings'` accepts only `{turnSeconds ∈ TURN_SECONDS_OPTIONS, quick: boolean, autoRoll: boolean}` (strict `typeof`/`includes`, no coercion) else `RoomError('bad_message', 'Tin nhắn không hợp lệ.')`; `case 'back'` returns `{ t: 'back' }`.
  - `handle`: `case 'settings'`: `needHostBudget()`; `bad_state` "Chỉ đổi cài đặt khi đang chờ." unless `waiting`; set `room.settings`; `await this.commit([])`. `case 'back'`: clear own `misses`, and if the seat is on turn re-run `planTurn`; commit. In `roll` and `move` clear the sender's `misses` before `apply`.
  - `alarm()` human timeout: when the action is played for a connected human because `now >= actionDueAt` (not because of auto-roll, phase 3), increment that seat's `misses`; a disconnected human's takeover (3 s grace) and CPU turns never count.
  - `rematch` and `start`: delete every seat's `misses`.
  - `create`: leave `settings` unset (default) so stored shape is unchanged for rooms that never touch it.

## Message shapes

```ts
// client -> server
{ t: 'settings', settings: { turnSeconds: 20, quick: true, autoRoll: false } }
{ t: 'back' }
// server -> client: RoomSnapshot.settings, Seat.auto in every `state`
```

Errors (Vietnamese): `not_host` "Chỉ chủ phòng mới làm được việc này.", `bad_state` "Chỉ đổi cài đặt khi đang chờ.", `bad_message`, `too_fast`.

## Steps

1. Protocol types and constants; typecheck breaks every `Timings`/`RoomSnapshot` literal, fix them.
2. `settingsOf`/`timingsOf`; switch all room-specific timing reads; delete the now-redundant global `turnMs` read paths.
3. Autopilot in `dueDelay`/`planTurn`/`alarm`; `back` handler.
4. Host message; clear misses on human action, rematch and start.
5. Unit tests, then phase 3 builds on `timingsOf`.

## Tests (vitest, `worker/rooms/room-state.test.ts` pattern)

- `timingsOf` for each allowed value; default object equals today's 30 000 ms.
- `planTurn` with `turnSeconds: 10` sets `actionDueAt = now + 10 × turnUnitMs`; a room without `settings` still gets 30 000.
- Reconnect keeps the original `actionDueAt` (existing test stays green with settings present).
- Missed-turn counting: two alarm timeouts of a connected human give `misses === 2` and `Seat.auto === true`; the third action is scheduled at `cpuDelayMs` with `actionDueAt === null`; `back` or a `roll` resets it; a disconnect takeover and a CPU action do not increment.
- Parse tests: invalid `turnSeconds` (0, 31, "30", 30.5), non-boolean `quick`, extra shapes are rejected; `settings` from a non-host is `not_host`; during `playing` is `bad_state`.
- Rematch keeps `settings`, clears `misses`.
- Pause (PR #16): while paused no miss accrues; after `resumeGame` the player keeps the remaining time computed with the room's `turnMs`.
- A persisted room without `settings` and seats without `misses` loads and plays.

## Validation

`npm run typecheck && npm test`. e2e is phase 4.

## Risks

- Forgetting one `this.timings` call site leaves a room on the 30 s default: grep `this.timings` and `timings.` after the change; every remaining use must be room-independent (`waitingDisconnectMs`, `idleCloseMs`).
- `turnDeadline` source change (`actionDueAt`): verify it equals the old value in the existing tests before phase 3.
- The seat on autopilot is still `human` in `StoredSeat`; `leave` and host-succession logic must not special-case it.

## Rollback

Settings are optional in storage and default to current behaviour; reverting the code leaves harmless extra fields in stored rooms (they are ignored). Hide the controls (phase 4) to disable without a deploy of server logic.
