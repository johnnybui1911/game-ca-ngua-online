# Phase 3: quick match on the server

## Context

- `RoomDO.apply` (human `roll`/`move`) and `alarm()` (CPU, timeouts, takeover) each apply one action and call `planTurn` then `commit`. A roll whose result has `phase === 'move'` always waits for a second action, even when `legalHorses` has one entry (`applyRoll` in `shared/game/engine.ts`).
- `chooseCpuMove` with one legal horse necessarily returns it, so auto-move gives the same outcome a CPU or a clicking human would get.
- The client already handles several events in one `state` message: `appendBatch` (`web/src/room/batches.ts`) queues one batch per `seq`, and the director builds a `Seg[]` per batch and scales the batch to `BATCH_BUDGET` (0.6 s) when longer.

## Requirements

1. With `settings.quick`, a roll yielding exactly one legal horse is followed by `applyMove` in the same step, for humans, CPUs, timeouts and takeovers alike.
2. With `settings.quick`, the delay before the next automatic action is `quickSegmentMs × animated segments of the last commit` (segments = number of `rolled` + `moved` events), so the client can animate what it received before the next batch arrives.
3. With `settings.autoRoll`, a human on a roll phase is rolled for after `autoRollMs`, without counting a missed turn and without touching `actionDueAt`.
4. Normal rooms behave exactly as before (pace 700 ms per action).

## Files to change

- `shared/game/engine.ts` (or a new `shared/game/step.ts`, no rule change): `export function rollAndSettle(state, dice, autoMove: boolean): StepResult` = `applyRoll`, then when `autoMove && result.state.phase === 'move' && result.state.legalHorses.length === 1` apply the move and concatenate events (`rolled`, `moved`, `won`?/`turn`). Pure and testable; used by both `RoomDO` paths and by phase 1's `quick` policy (replace its inline version).
- `worker/rooms/constants.ts`: `Timings.quickSegmentMs` (NORMAL 400, FAST 15).
- `worker/rooms/room-state.ts`: `planTurn(state, connected, now, timings, segments = 1)`; `dueDelay` returns `quick ? quickSegmentMs * segments : cpuDelayMs` for a CPU seat and for an autopilot or disconnected-takeover seat; for a connected human on `phase === 'roll'` with `autoRoll`, `dueAt = now + min(turnMs, autoRollMs)` while `actionDueAt` stays `now + turnMs`. Reconnect logic that does `state.dueAt = state.actionDueAt ?? state.dueAt` is adjusted so a returning player is not rolled for before the roll delay has elapsed again (re-derive instead of copying).
- `worker/rooms/room-do.ts`: in `handle` `roll` and in `alarm()` replace `applyRoll(game, drawDie())` by `rollAndSettle(game, drawDie(), settingsOf(room).quick)`; pass `segmentsOf(result.events)` to `planTurn`. `move` handler unchanged (a human move ends the action). In `alarm()` distinguish an auto-roll firing (`now < actionDueAt`) from a timeout (`now >= actionDueAt`): only the latter increments `misses` (phase 2).
- `worker/rooms/room-state.ts`: `segmentsOf(events: GameEvent[]): number`.

## Message shapes

No new messages. A quick commit's `state` message carries `events: [rolled, moved, turn]` or `[rolled, moved, won]` and the final `room.game`; `legalHorses` of the intermediate state is never sent.

## Steps

1. `rollAndSettle` + tests (pure).
2. Wire into `handle`/`alarm`; keep `apply` as the single place that handles `phase === 'finished'` (so `match_finished` counting and `status = 'finished'` stay in one path; the `alarm()` branch duplicates it today, keep both consistent).
3. Pace and auto-roll in `planTurn`/`dueDelay`.
4. Unit tests.

## Tests

- `rollAndSettle`: one legal horse, autoMove on → phase `roll`/next turn, events `[rolled, moved, turn]`, board identical to applyRoll then applyMove; two legal horses → phase `move`; none → same as `applyRoll`; winning move yields `won` and phase `finished`; autoMove off equals `applyRoll`.
- A roll of 1 or 6 followed by an auto-move keeps the same colour on turn (extra roll), `turn.extraRoll === true`.
- `planTurn` quick CPU: delay `quickSegmentMs × 2` after a combined commit, `× 1` after a roll without move; normal: always `cpuDelayMs`.
- Auto-roll: human on a roll phase gets `dueAt = now + autoRollMs`, `actionDueAt = now + turnMs`; the alarm at `dueAt` rolls and does not add a miss; the timeout at `actionDueAt` does.
- Pause (PR #16) shifts `dueAt` and `actionDueAt` by the pause length; the auto-roll still fires after resume at the shifted time.
- Property test over 200 seeded games using the phase 1 simulator: the winner and final board equal the non-quick game for the same dice and the same deterministic chooser (single-horse moves are forced).

## Validation

`npm run typecheck && npm test`.

## Risks

- A merged batch is longer on screen than a single action; if `quickSegmentMs` is shorter than the animation the director snaps (`MAX_WAITING`): phase 4 sets the animation budget from the same per-segment figure and checks it in a unit test.
- Players may not notice the move happened without a click; the HUD shows the existing move text for the last event (phase 4).
- `quick` merges only forced moves; do not extend it to a CPU's multi-horse choice.

## Rollback

`quick` and `autoRoll` default to false; reverting the call sites to `applyRoll` restores the old path.
