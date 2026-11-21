---
title: CPU difficulty levels (Dễ / Thường / Khó) chosen by the host
status: proposed
---

# CPU difficulty levels

## Outcome

The host of a waiting room picks how well the machine players play: **Dễ**, **Thường** or **Khó**. The choice applies to every CPU in that room, including a CPU that takes over a seat when a human leaves during a game. Everyone in the room sees the level (waiting room and in-game HUD). **Thường** is exactly today's behaviour and the default, so nothing changes for existing rooms, tests or players who never touch the control.

## Today (grounded in code)

- One CPU policy exists: `chooseCpuMove(state)` in `shared/game/cpu.ts`. It is deterministic and uses a fixed priority: (1) a move that kicks an opponent (lowest horse index wins ties); (2) a move that reaches or climbs the home column, highest resulting step first (`landing.to > POS_GATE`); (3) leaving the stable (lowest index); (4) the horse with the greatest track progress. It takes no randomness and no level. This is what "Thường" will keep doing, byte for byte.
- Callers of `chooseCpuMove` (all four pass only `state`):
  1. `worker/rooms/room-do.ts`, `alarm()`: the single server-side auto-play path. It runs when `room.dueAt` has passed for the seat on turn, whoever sits there: a `cpu` occupant (delay `cpuDelayMs`), a connected human whose `turnMs` clock ran out, or a disconnected human after `playingDisconnectMs` (`dueDelay` / `reconcileConnections` in `worker/rooms/room-state.ts`). The roll there uses `drawDie()` (crypto RNG); the CPU never sees a future roll.
  2. `RoomDO.leave()` turns the leaver's seat into `{ kind: 'cpu', name: nextCpuName(room) }` while `status === 'playing'`; from then on path 1 plays it.
  3. `web/src/scene/dev/DevApp.tsx` (scene-dev harness, CPU-only local games).
  4. `web/src/scene/director.test.ts` (`playActions`) and the 200-game simulation in `shared/game/engine.test.ts` (`engine.chooseCpuMove`, typed by `RulesEngine.chooseCpuMove(state)` in `shared/game/types.ts`).
- `RulesEngine.chooseCpuMove(state)` can stay as is: a function with extra optional parameters is assignable to that type, so `shared/game/types.ts` (a confirmed-contract file, rules text included) is **not edited**.
- There is no room-level setting today. `RoomState` (`worker/rooms/room-state.ts`) is persisted whole under the single DO storage key `room` (`STORAGE_KEY` in `room-do.ts`); `CreateRoomRequest` carries only `name`, `visibility`, `seats`.

## Constraints

- Cloudflare free tier, no spend, no secrets. Vietnamese UI copy. Server-authoritative: the level lives on the server and the CPU runs only inside `RoomDO.alarm()`.
- No new high-frequency DO writes: the level is written only when the host changes it (host action budget already limits that), never per move (DO storage capacity concern, issue #6).
- The CPU may use only what the rules expose: the current `GameState` (all horse positions are public), its own `dice` and `legalHorses`. It never sees the next roll and never reads server RNG state.
- Game rules in `shared/game/types.ts` are unchanged. The levels are different *policies* over the same legal moves; they never allow an illegal move.
- Existing persisted rooms (no level field) keep working with no migration.
- Randomness in the CPU is injectable so unit tests are deterministic.

## Non-goals

Per-seat levels (an option, see Open questions), difficulty in the public lobby list (`RoomSummary`), changing the level mid-game, adaptive/"learning" difficulty, machine-learning or search-based (expectimax/MCTS) players, changing CPU pacing (`cpuDelayMs`) per level, any rule change, difficulty for the dev harness beyond an optional URL parameter.

## Level definitions

| Level | Vietnamese | Policy | Uses randomness |
|---|---|---|---|
| `easy` | Dễ | With probability `EASY_SMART_RATE` (initial 0.25) play the Thường choice; otherwise a uniformly random legal horse. | yes (injectable `rand`) |
| `normal` | Thường | Current `chooseCpuMove` unchanged: kick > climb/reach home column (highest step) > leave stable > most advanced; ties to lowest index. | no |
| `hard` | Khó | Score every legal horse with a fixed heuristic (below) and play the best, ties to lowest index. Deterministic. | no |

Hard heuristic terms, all computed with `landingFor` from `shared/game/engine.ts` on the public board (details, weights and rationale in phase 1): kick value (more for a victim that had progressed far), home-column progress with a penalty for blocking the own home column, leaving the stable (bigger bonus when no own horse is on the track), net reduction of danger to own track horses (danger = fraction of the six dice values with which some opponent horse could kick it, **including opponent horses in the stable entering on 1 or 6**), reduction of opponent mobility (blocking), small progress term. Opponent future rolls are treated as uniform over 1..6: no dice peeking.

## Acceptance criteria

1. `chooseCpuMove(state)` with no extra arguments returns exactly what it returns today for every state: all existing tests in `shared/game/engine.test.ts` and `web/src/scene/director.test.ts` pass unchanged.
2. `chooseCpuMove(state, 'easy', rand)` and `(state, 'hard')` always return a member of `state.legalHorses`, never mutate `state`, and throw outside the move phase, over at least the 200 seeded simulation games of the existing test run once per level.
3. With an injected `rand`, Easy is reproducible: a scripted sequence of draws yields a scripted sequence of horses (unit test).
4. Hard has unit tests showing each heuristic term decides a crafted position (kick a far-advanced horse over a start-cell horse; leave a threatened horse rather than a safe one; do not land 1..6 ahead of an opponent when a safe alternative exists; climb home; keep the home column unblocked).
5. Simulation (phase 1 bench) over the same seeds on every machine: with seat order rotated to cancel the first-mover advantage, report win rates with 95% intervals for Hard vs Normal, Normal vs Easy, Hard vs Easy (2 players) and 1 Hard + 3 Normal (4 players), plus a Normal vs Normal control that must read about 50% / 25%. Thresholds are an open question; the committed test asserts the ordering `Hard > Normal > Easy` at the agreed thresholds.
6. Hard's decision cost is measured by the bench (median and worst case per call) and stays within the agreed budget (open question) so the DO alarm stays cheap.
7. The host sees a "Độ khó máy" control in the waiting room (Dễ / Thường / Khó), default Thường; a non-host sees the current level read-only; the server rejects `cpuLevel` from a non-host (`not_host`), outside the waiting state (`bad_state`) and with an unknown value (`bad_message`).
8. The chosen level survives a reload and a rematch; a room persisted before this change (no field) loads as Thường and plays as before.
9. CPU seats read "Máy 1 · Khó" style in the waiting room and the in-game HUD badge reads "CPU · Khó" (level word matching the room).
10. A human who leaves mid-game is replaced by a CPU playing at the room level; a human whose clock runs out is auto-played at Thường (default decision below).
11. `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e` all green, new e2e spec included; README documents the setting and the bench command.
12. (If the counter is accepted) each match that starts with at least one CPU seat adds one count to `cpu_match_<level>` in `daily_events`; no per-move writes.

## Decisions taken as defaults

- **Room-level difficulty**, one value for all CPUs of the room. Why: one control, one persisted field, no per-seat state to carry through add/remove/takeover/rematch, and the label rule is trivial. Per-seat is listed as an option.
- **Default level `normal`**, field absent = `normal` (no storage migration).
- **Takeover after `leave`** uses the room level (that seat *is* a CPU seat afterwards).
- **Server auto-play for a still-seated human** (turn clock expired, or disconnected past `playingDisconnectMs`) uses `normal` regardless of the room level: it only prevents stalling and should not become stronger or weaker because the host tuned the CPUs.
- Level can be changed only while `status === 'waiting'`, by the host, within the existing `hostBudget`. Rematch returns the room to `waiting` and keeps the level.
- Control is shown to the host even when no CPU is seated, because the level also governs takeover; helper text says so.
- Funnel counter `cpu_match_easy|normal|hard`: included (cheap, D1 not DO storage); can be dropped without touching anything else.
- Bench is a vitest file gated by `CPU_BENCH=1` (the repo has no TS runner other than vitest and vite), plus a small always-on strength test.

## Composition with PR #16 (`feat/horse-names-sound-host-controls`; assume it merges first)

Read with `gh pr diff 16` (head `24481e8`). Overlapping files and symbols, and how this plan adapts:

| File | PR #16 changes | This plan |
|---|---|---|
| `shared/protocol.ts` | `Seat.horseNames`, `RoomSnapshot.paused`, new `RoomClientMessage` members (`horseNames`, `pause`, `resume`, `closeRoom`) | add `RoomSnapshot.cpuLevel` and one more member `{ t: 'cpuLevel'; level }` to the same union; no edit to `Seat` |
| `worker/rooms/room-state.ts` | `StoredSeat.horseNames?`, `RoomState.pausedAt?`, `setOccupant`, `isPaused`, `resumeGame`, `toSnapshot` fills `paused` and `horseNames` | add `RoomState.cpuLevel?` (same optional-field pattern as `pausedAt`), `levelOf`, `levelForOccupant`, `parseCpuLevel`; `toSnapshot` adds `cpuLevel`. `setOccupant` is used as is for CPU takeover (no level on the occupant, so nothing to carry) |
| `worker/rooms/room-do.ts` | `parseClientMessage` cases, `handle` cases, `closeRoom(code, message)`, `leave()` uses `setOccupant` and pause-aware `dueAt`, `alarm()` condition gains `!isPaused(room)` | add one `parseClientMessage` case and one `handle` case next to them; in `alarm()` change only the `chooseCpuMove(game)` argument list on the line that PR #16 does not touch; `create()` and `leave()` untouched |
| `web/src/room/WaitingView.tsx` | per-seat horse names block, `HorseNamesDialog`, `SoundButton`, `useMusic` | add the level control above the seat list and a `· Khó` suffix in the CPU seat state line (`seat-${i}-state`); no conflict with the horse-names line |
| `web/src/room/MatchView.tsx` | HUD, horse labels, pause UI | change the CPU badge text in the `hud-player` item only |
| `web/src/scene/dev/DevApp.tsx` | `snapshot()` seat objects gain `horseNames`, snapshot gains `paused` | `snapshot()` also gets `cpuLevel`; harness optionally reads `?level=` |
| `worker/rooms/room-state.test.ts` | `room()` helper and new tests | extend the same helper default (optional field, so no change needed) and add level tests |
| `README.md` | documents PR #16 features | add the setting and bench command in its own paragraph |

Pause (`pausedAt`) and the level do not interact: no CPU move happens while paused (`alarm()` is gated), and the level cannot change outside `waiting`. Rebase of this branch after PR #16 lands is mechanical; the implementation worktree must start from `main` after the merge.

## Open questions for the user

1. **Scope of the level**: room-level (default, recommended) or per-seat (each CPU seat has its own level, host picks when pressing "Thêm CPU")? Per-seat needs `level` on the cpu occupant (`StoredOccupant`, `SeatOccupant`), a message `{ t: 'addCpu', seat, level }` or a `setCpuLevel` per seat, a takeover rule (inherit the leaver's seat? the room's most common level?) and a per-seat label; roughly +1 phase.
2. **Auto-play of a still-seated human** (timeout / disconnected): Thường (default) or the room level?
3. **Strength thresholds** for the bench. Proposal (2 players, seats rotated, N ≥ 1000 games per matchup): Hard beats Normal with win rate ≥ 60% and the lower 95% bound > 55%; Normal beats Easy ≥ 60%; Hard beats Easy ≥ 70%. Dice dominate this game, so the heuristic ceiling is unknown until measured; if Hard cannot clear 60% against Normal, accept a lower bar (for example > 55% with the lower bound > 50%) or invest in a deeper search? We will report measured numbers, not assume them.
4. **Easy flavour**: uniformly random with a 25% chance of playing the Thường move (default), or pure random? The 25% is a tunable constant; the bench decides whether Easy lands clearly below Normal.
5. **Hard decision budget**: the alarm must stay far below the Workers free-tier CPU time limit (documented per invocation; verify the current figure in Cloudflare docs when implementing). Proposal: median < 1 ms and worst case < 5 ms per decision on the bench machine. OK?
6. **Funnel counter** `cpu_match_<level>`: keep (default) or skip?
7. **Control visibility**: show the level control always (default, since it governs takeover) or only once a CPU is seated?
8. **Persist the choice across a user's rooms** (remember last pick in `localStorage` and send it right after creating a room)? Default: no, always start at Thường.

## Phases

| # | Phase | Brief |
|---|---|---|
| 1 | CPU levels in `shared/game`, seeded simulation and bench, unit tests | [phase-01-cpu-levels.md](phase-01-cpu-levels.md) |
| 2 | Room setting: protocol, room state, DO handling, takeover rules, analytics, compatibility | [phase-02-room-setting.md](phase-02-room-setting.md) |
| 3 | Waiting room control, level labels, dev harness, e2e, README | [phase-03-ui-and-e2e.md](phase-03-ui-and-e2e.md) |
| 4 | Integration review, deploy, production smoke, merge | orchestrator |

Phase 1 first (it owns the shared type `CpuLevel`); phases 2 and 3 can then run in parallel (3 needs only the `cpuLevel` field and message shape from phase 2's contract, which this plan fixes).
