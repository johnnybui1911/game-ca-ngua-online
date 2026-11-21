# Phase 5: funnel counters, docs, re-measure, rollout

## Context

- `shared/analytics.ts` lists server-only events (`match_started_solo`, `match_started_group`, `match_finished`, ...). `worker/rooms/room-do.ts` `count(...)` calls `countEvent(env, event, NO_SOURCE)` (`worker/analytics/count.ts`) inside `ctx.waitUntil`. The D1 table `daily_events` (`migrations/0004_daily_events.sql`) stores `event` as free `TEXT`, so new event names need no migration.
- README (section on the funnel, line about `match_started_solo`... `match_finished`) documents the list.

## Requirements

1. Measure whether quick matches are started and finished, without identifying anyone.
2. Document settings and counters.
3. Report measured before/after pacing and writes.

## Files to change

- `shared/analytics.ts`: add `'match_started_quick'` and `'match_finished_quick'` to `ServerEvent`. They are counted in addition to the existing events, never instead, so `match_started_solo + match_started_group` stays the total of matches started and `match_started_quick` is the quick share. Add a line to `shared/analytics.test.ts` only if it enumerates events.
- `worker/rooms/room-do.ts`: `count` accepts the two new events. In `start`, after the existing count, `if (settingsOf(room).quick) this.count('match_started_quick')`. Where `match_finished` is counted (`apply` and the `alarm()` branch), also count `match_finished_quick` when quick. Settings cannot change while playing, so no mismatch. A room that is closed or abandoned mid-game counts no finish; the gap `started - finished` per mode is the drop-off signal.
- `README.md`: funnel paragraph lists the two events and the query to compare completion rates:
  `SELECT event, SUM(n) FROM daily_events WHERE event IN ('match_started_solo','match_started_group','match_finished','match_started_quick','match_finished_quick') GROUP BY event` (documented, not run here). Also a paragraph for the settings (values, quick preset, autopilot, auto-roll).
- `plans/20261121-turn-timer-quick-mode/reports/after.md`: the phase 1 report re-run with the `quick` policy using the real `rollAndSettle`.

## Storage writes per match (issue #6)

Writes today: one `storage.put('room', room)` and one `setAlarm`/`deleteAlarm` per `commit`, i.e. per accepted action, per connection change that alters the room, and per host action (`persistAndSchedule`). Effect of each change:

| Change | Effect on commits per match | Why |
|---|---|---|
| Turn time setting | none | it only moves a deadline; one commit when the host edits it while waiting, rate-limited by `hostBudget` (4 burst, 2/s) |
| Idle autopilot | none per action; it avoids nothing but also adds nothing | a missed turn was already one automatic action; the `misses` counter is a field inside the same `room` value |
| Quick auto-move | reduces by `singleMoves` per match | two actions become one commit; the exact count is the phase 1 `singleMoves` mean, to be reported, not assumed |
| Auto-roll | none | the same roll, earlier |
| Faster pace | none per match, higher commit rate | same number of commits in less time; does not change rows per match |
| Settings object | slightly larger `room` value | a few bytes; each put already rewrites the whole object including `game` |

So the plan can only keep the write count equal or lower; it never adds writes per action. It does not solve issue #6 (the baseline remains hundreds to ~1900 commits for CPU-heavy matches); it is a partial reduction on quick matches. The follow-up in the issue (persist less often) stays separate. How the dashboard bills `setAlarm` and large values is not verified here [INFERENCE]; phase 5 compares the commit counts from the simulator with the dashboard rows for a real quick and normal match and writes the result into `reports/after.md`.

## Steps

1. Counters and README.
2. Run `PACING_REPORT=1 npx vitest run shared/game/pacing.test.ts`; commit `reports/after.md` with the before/after table (commits, projected pacing seconds, human prompts) per seat count.
3. Deploy path as in the README (`npm run deploy`): no migration step. Play one quick and one normal match on production with the host's account, read both counters back with the documented query.
4. Compare with the acceptance criteria; update plan status.

## Tests

- Unit: a room that starts quick calls `count('match_started_quick')` (inject/spy `countEvent` the way existing room tests do, or test a pure `startEvents(room)` helper returning the list of events to count).
- e2e: none beyond phase 4.

## Risks

- Counting both a generic and a quick event can be misread as double counting; the README states the relation.
- If quick turns out to hurt completion (`finished_quick / started_quick` below the normal ratio), the funnel shows it before any default changes.

## Rollback

Stop counting by removing the two `count` calls; rows already written are harmless. Disable the feature by hiding the controls (phase 4) or by forcing `quick` false in `settingsOf`.
