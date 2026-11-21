# Phase 1: CPU levels in `shared/game`, simulation and bench

## Context

`chooseCpuMove(state)` in `shared/game/cpu.ts` is a pure function used by the room alarm, the scene dev harness and tests. `shared/game/engine.ts` exports `landingFor(horses, color, horse, dice)` (outcome or `null`) and `legalHorsesFor`; `engine.test.ts` has a local `mulberry32` PRNG, a `make`/`setPos` position builder and a 200-game simulation. `shared/game/engine.ts` and `cpu.ts` import each other (`engine` -> `chooseCpuMove` for the `engine` object, `cpu` -> `landingFor`); keep that as is.

## Requirements

- Normal keeps today's exact behaviour and stays the default; all existing callers compile and behave unchanged.
- Easy and Hard use only `GameState` (public positions, `dice`, `legalHorses`) and `landingFor`. No access to the die source.
- Randomness is a parameter; no `Math.random` call inside game logic except as the parameter's default.
- Pure: never mutate `state` or `state.horses` (Hard evaluates hypothetical boards on copies).

## Files to change

- New `shared/game/cpu-level.ts` (leaf module, no imports): `CPU_LEVELS = ['easy','normal','hard'] as const`, `type CpuLevel`, `DEFAULT_CPU_LEVEL: CpuLevel = 'normal'`, `isCpuLevel(v: unknown): v is CpuLevel`. Shared by worker, web and tests; kept out of `cpu.ts` so `shared/protocol.ts` and the web bundle do not import the engine for a constant.
- `shared/game/cpu.ts`: new signature
  `chooseCpuMove(state: GameState, level: CpuLevel = 'normal', rand: () => number = Math.random): number`
  with the existing body moved into `chooseNormal(state)` and two new internal functions `chooseEasy(state, rand)` and `chooseHard(state)`. `rand` returns a float in [0, 1). `RulesEngine.chooseCpuMove(state)` in `types.ts` is unchanged (the wider function stays assignable).
- New `shared/game/cpu-hard.ts` (Hard evaluator, to keep `cpu.ts` small) exporting `chooseHard` and the weights object `HARD_WEIGHTS`; `cpu.ts` imports it.
- New `shared/game/seeded-random.ts`: move `mulberry32` here from `engine.test.ts` (export it; the test imports it) so tests and bench share one PRNG. No behaviour change to the existing simulation test.
- New `shared/game/cpu-sim.ts`: `playMatch(levels: Partial<Record<Color, CpuLevel>>, seed: number): { winner: Color; rolls: number }` that uses `createGame(colors)`, dice from `mulberry32(seed)` (uniform 1..6, like the existing test), `chooseCpuMove(state, levels[state.turn], rand)` for every move, guard of 5000 rolls like the existing test (throws).
- New `shared/game/cpu.test.ts` (unit tests) and `shared/game/cpu-bench.test.ts` (strength test + gated bench).
- `shared/game/engine.test.ts`: import `mulberry32` from the new module; existing `chooseCpuMove` tests untouched.

## Steps

1. Add `cpu-level.ts` and the new signature with `level` dispatch; `normal` path is the old code verbatim. Run the existing tests: they must pass unchanged.
2. Easy: draw `r = rand()`; if `r < EASY_SMART_RATE` (0.25) return `chooseNormal(state)`; else `legal = [...state.legalHorses].sort((a, b) => a - b)` and return `legal[Math.floor(rand() * legal.length)]` (two draws in a fixed order so tests can script them; clamp the index to `legal.length - 1` in case a custom `rand` returns 1).
3. Hard evaluator (`cpu-hard.ts`). For each `horse` of `legalHorses` (sorted ascending) compute `landing = landingFor(...)` (skip null) and `after = horsesAfter(state.horses, color, horse, landing)` (copy rows; set own horse to `landing.to`; set the kicked horse to stable). Score:

   ```
   score = WIN      if every own horse is on the home column after the move
         + KICK_BASE + KICK_PROGRESS * victimProgress      if landing.kicked   (victimProgress = landing.kicked.from, 0..55)
         + HOME_ENTER + HOME_STEP * step                   if landing.to > POS_GATE   (step = landing.to - POS_GATE)
         - COLUMN_BLOCK * (7 - step) * othersNotHome       if landing.to > POS_GATE and step < 6 and the horse came from the gate/track (a horse parked on a low home step blocks the climb of every other horse needing dice >= step: rule 3)
         + LEAVE_FIRST  if the horse leaves the stable and no own horse is on the track
         + LEAVE_OTHER  if it leaves the stable otherwise
         + PROGRESS * dice
         + (danger(state.horses) - danger(after))          // net danger reduction over all own track horses
         + BLOCK * (oppMobility(state.horses) - oppMobility(after))
   ```
   - `exposure(board, color, horse)`: for each die value `d` in 1..6, true if some horse `h'` of any other colour in `state.colors` has `landingFor(board, oppColor, h', d)?.kicked` equal to `{color, horse}`; result = (count of such `d`) / 6. Uses the rules engine itself, so it already accounts for blocking by other horses, for opponents in the stable entering on 1/6 onto an own entry cell, and ignores unreachable gate/home geometry. Home-column horses are never exposed.
   - `danger(board) = sum over own horses on track of exposure * lossValue(pos)`, `lossValue(p) = LOSS_BASE + LOSS_PROGRESS * p` (a lost horse costs its progress and the 1-or-6 it needs to re-enter).
   - `oppMobility(board) = number of (opponent horse, die) pairs with a legal landing`. A move that parks a horse in front of an opponent, or next to a horse that shields it, lowers it; this is the "blocking" term and is weighted low so safety outweighs it.
   - Pick the highest score; ties go to the lowest horse index (iteration order). Deterministic.
4. Initial weights (starting points to be tuned by the bench, then frozen in `HARD_WEIGHTS`): `WIN 1000, KICK_BASE 6, KICK_PROGRESS 0.5, HOME_ENTER 10, HOME_STEP 1.5, COLUMN_BLOCK 0.4, LEAVE_FIRST 9, LEAVE_OTHER 5, PROGRESS 0.3, LOSS_BASE 8, LOSS_PROGRESS 0.5, BLOCK 0.15`. Tuning rule: tune on seeds `1..N` of the bench, confirm on a held-out seed range `100000..` before accepting, so the committed test does not simply memorise its own seeds. Record the final numbers and the measured win rates in the PR description (do not hard-code results in docs).
5. Cost: per call roughly (legal horses <= 4) x (own horses <= 4) x (opponent horses <= 12) x 6 dice `landingFor` evaluations; the bench prints median and worst per-call time (`performance.now()` around `chooseCpuMove`), and the strength test asserts the budget agreed in the plan's open question 5.
6. Bench (`cpu-bench.test.ts`):
   - Matchups (seat colours from `SEAT_COLORS`): `2p: hard vs normal`, `2p: normal vs easy`, `2p: hard vs easy`, `2p: normal vs normal` (control), `4p: 1 hard + 3 normal`, `4p: normal x4` (control). For two-player matchups, run each seed twice with the levels swapped between colours 0 and 2; for 4p rotate which colour holds the Hard/odd seat across seeds, so the first-mover advantage cancels out.
   - Output a table: matchup, N, win rate of the first-named level, 95% Wilson interval, mean rolls per game, Hard decision timing. Printed with `console.table` only when `process.env.CPU_BENCH` is set (`describe.skipIf(!process.env.CPU_BENCH)`), default N = 1000 per matchup, override with `CPU_BENCH_GAMES`. Command: `CPU_BENCH=1 npx vitest run shared/game/cpu-bench.test.ts`.
   - Always-on test: a smaller N (about 200 per matchup, seeds fixed) asserting the agreed ordering thresholds (for example: Hard vs Normal rate above the agreed lower bound), plus the control sitting inside a loose band around 50%, which also validates the harness. Keep its total runtime to a few seconds (measure; shrink N if needed, accept wider bounds only with the user's agreement).
7. Unit tests (`cpu.test.ts`), with the existing `make`/`setPos` helpers extracted or duplicated as local helpers:
   - Normal parity: for 500 seeded random mid-game states, `chooseCpuMove(s)` equals `chooseCpuMove(s, 'normal')` and equals the previous algorithm (copy of the old body inside the test is acceptable as an oracle, or rely on the unchanged existing cases).
   - Easy: `rand` scripted `[0.9, 0.0]` picks the lowest legal horse; `[0.9, 0.999]` the highest; `[0.1]` returns the Normal choice; `rand` returning `1` does not index out of range.
   - Hard: kicks the more advanced victim; prefers moving a horse that an opponent threatens to a safe cell over advancing a safe one; refuses a landing 1..6 ahead of an opponent horse when a safe alternative exists; leaves the stable on 1/6 when no horse is out and when the board has an exposed entry cell it still prefers the kick/safe alternative per weights; climbs into the home column with the highest step; does not park on a low home step while other horses still need to climb; prefers a winning move; opponent in the stable is counted as a threat to its own entry cell.
   - All levels: legal result and no mutation across the existing 200-game simulation driven through `playMatch`; throw when `phase !== 'move'`.

## Protocol / message shapes

None (shared logic only). Exported surface: `CpuLevel`, `CPU_LEVELS`, `DEFAULT_CPU_LEVEL`, `isCpuLevel`, `chooseCpuMove(state, level?, rand?)`.

## Validation

`npm run typecheck`, `npm test` (existing suites unchanged and green), then `CPU_BENCH=1 npx vitest run shared/game/cpu-bench.test.ts` and attach the table to the PR.

## Risks

- Heuristic gains may be small because dice dominate; mitigated by reporting honest intervals and having the threshold as an open question.
- Hard tuned on its own seeds (overfitting): held-out seed range, see step 4.
- Alarm CPU time: measured, budget agreed beforehand; if exceeded, cheapen `exposure` (only opponent horses within 6 cells behind, plus stable entry check) while keeping the same results on the unit tests.
- Weights are magic numbers: kept in one named object with a comment per term, not scattered.

## Rollback

Revert the commit; no persisted data or contract depends on this phase alone.
