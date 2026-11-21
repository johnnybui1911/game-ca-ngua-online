# Phase 1: baseline measurement

## Context

Issue #6 quotes "about 1900 actions (median, CPU simulation)" for four players and 450 for two, but the repo has no script that produces those numbers. `shared/game/engine.test.ts` ("simulation") plays 200 seeded CPU games with `mulberry32` and `chooseCpuMove`, but only asserts they finish with a consistent board. Every claim in this plan about "faster" and "fewer writes" is checked against a number produced here, before and after.

## Requirements

- A pure, deterministic simulator in `shared`, no I/O, with the dice source and the move chooser as parameters (the CPU difficulty plan changes `chooseCpuMove`; both must be able to measure).
- It counts, per game: `actions` (every roll and every move, which is what `RoomDO` plays today), `commits` under a given policy, `humanPrompts` (moves where `legalHorses.length >= 2`, i.e. a real choice), `singleMoves` (move phase with exactly one legal horse), `extraRolls`.
- Policies: `normal` (one commit per action, as `RoomDO.apply` does now) and `quick` (a roll that yields exactly one legal horse is merged with its move into one commit, as phase 3 will do).
- A report for seat counts 2, 3, 4 over a fixed seed list: mean, median, p90 of each counter, and projected pacing seconds = sum over commits of the CPU delay that policy would apply (normal: 0.7 s per commit; quick: 0.4 s per animated segment in that commit). Print only measured values; no hard-coded expectations of the averages.

## Files

- New `shared/game/pacing.ts`: `playGame(colors, rollDie, choose, policy)` returning the counters, and `summarize(samples)`.
- New `shared/game/pacing.test.ts`: invariants only (see Tests).
- New `plans/20261121-turn-timer-quick-mode/reports/baseline.md`: the committed output of the report, with the command, seeds and date. Phase 5 adds `after.md`.

## Steps

1. Implement `playGame` on top of `engine.applyRoll` / `applyMove` (`shared/game/engine.ts`). The loop shape is the one in the existing simulation test (`mulberry32(1000 + game)`; reuse its seeding, extracting the generator if needed rather than duplicating it).
2. `policy: 'quick'` calls `applyMove` immediately when `applyRoll` returns `phase === 'move'` and `legalHorses.length === 1`, counting one commit for the pair.
3. The report runs when `PACING_REPORT=1` is set (so `npm test` stays fast): 200 games per seat count, seeds `1000..1199`, same dice sequence for both policies (the dice stream is consumed identically because the move choice does not draw dice).
4. Run `PACING_REPORT=1 npx vitest run shared/game/pacing.test.ts` on `origin/main` code, paste the table into `reports/baseline.md`.

## Tests (vitest)

- Same seed and policy give identical counters.
- `commits(normal) === actions`; `commits(quick) === actions - singleMoves`.
- `quick` and `normal` end with the same winner and the same final horses for the same dice sequence only when the chooser is deterministic and single-horse moves are the same under both: assert equality (a single legal horse has one possible choice, so the games must be identical).
- `actions` equals rolls + moves counted from emitted events (`rolled`, `moved`).

## Validation

`npm test` green; the baseline report shows a 4-seat mean actions figure that can be compared with issue #6's 1900.

## Risks

- The simulator assumes every seat is a CPU: real human think time is not modelled. The report says so; pacing seconds are the server-imposed floor, not match duration.
- A single seed list can hide variance; the report prints p90 as well as the mean.

## Rollback

Delete the new files; nothing else depends on them.
