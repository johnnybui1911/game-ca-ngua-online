---
title: Host-set turn timer and quick match ("ván nhanh")
status: accepted
---

# Host-set turn timer and quick match ("ván nhanh")

## Outcome

The host of a room chooses, in the waiting room, how long each player has per action and whether the match is a "ván nhanh". A quick match plays rule variant N3 (see Decisions) and removes dead time: a roll with exactly one legal move plays that move at once, the server paces CPU turns and the board animation faster, and an idle human stops holding the table up. Same board; classic matches keep today's rules; fewer minutes per match and fewer Durable Object commits.

## Why (evidence in the code)

- A 4-player match is about 1900 actions (issue #6, "median, CPU simulation"); a CPU action fires `cpuDelayMs: 700` after the previous one (`worker/rooms/constants.ts`, `NORMAL`). At that pace the CPU delay alone is about 1900 × 0.7 s ≈ 22 min for a table of CPUs (arithmetic on the issue's figure, not measured). The checked-in simulation (`shared/game/engine.test.ts`, "simulation") only asserts that 200 games finish; it reports no counts. `shared/game/pacing.ts` now measures it (see Measurement).
- Every action is one `RoomDO.commit`: `ctx.storage.put('room', room)` plus `setAlarm` (`persistAndSchedule` in `worker/rooms/room-do.ts`). Issue #6 is about exactly that cost.
- The turn clock is a constant: `planTurn` in `worker/rooms/room-state.ts` sets `actionDueAt = now + timings.turnMs` (30 s), and `RoomDO` builds `timings` once from the environment (`timingsFor`).
- An idle but connected human is never replaced: at the deadline `alarm()` plays one action (roll, or `chooseCpuMove`), then the next action gives them another full 30 s. A player who walked away costs up to 2 × 30 s for every roll-and-move pair for the rest of the match.
- A move with exactly one legal horse still waits for a click (`MatchView.tsx` renders `move-button-<horse>` for each `legalHorses` entry), and for a human that is one wasted action and one commit.

## Constraints

- Cloudflare free tier, no spend, no secrets, no D1 migration.
- Server authoritative: the settings are room state changed only through `RoomClientMessage`, validated in `RoomDO`.
- Rooms persisted before this change must load: the new field is optional in storage.
- Vietnamese UI copy.
- Do not persist anything at a higher frequency than today (issue #6).
- The rules in `shared/game/types.ts` are a confirmed user decision: nothing in "Decisions" changes them. The quick match's rule variant is the user's choice, recorded in "Decisions (accepted)"; it applies to quick matches only.

## Non-goals

Any rule change (beyond the quick variant in Decisions), per-player timers, spectators, a chess-clock bank of time, persisting settings per account, showing the mode in the public lobby list, reducing writes by batching persistence (issue #6's own follow-up), sound or horse-name work (PR #16).

## Acceptance criteria

1. In the waiting room the host sees "Thời gian mỗi lượt" with 10, 15, 20, 30 and 60 seconds (30 preselected) and a "Ván nhanh" switch plus an "Tự đổ xúc xắc" switch; other players see the current choice read-only. A non-host message is rejected with `not_host`; a value outside the list is rejected with `bad_message`; a change while `status !== 'waiting'` is rejected with `bad_state`.
2. A new room, and a room loaded from storage that has no `settings`, behaves exactly as today: 30 s per action, 700 ms CPU delay, no auto-move.
3. With turn time T, a connected human who does nothing has the server act for them T seconds after the action began (the countdown in `MatchView` counts T down); reconnecting never extends it (existing rule kept).
4. A human who lets 2 actions in a row time out is put on autopilot: the server plays for them after the CPU delay, their seat shows "Tự động" to everyone, the countdown disappears for that seat, and a "Tôi đã quay lại" button (or any roll/move they send) hands control back. Autopilot never changes the seat's occupant.
5. In a quick match, a roll that leaves exactly one legal horse is followed by that move in the same commit and the same `state` message (`events` = `rolled`, `moved`, `turn`). With two or more legal horses the player still chooses. With zero legal horses nothing changes.
6. With "Tự đổ xúc xắc" the server rolls for the human on turn 1.5 s after the action began; this never counts as a missed turn.
7. A quick match with only CPUs plays measurably faster than a normal one: the measurement in phase 1 reports commits per match and projected pacing seconds per match for normal and quick on the same seeds, and the quick figure is lower for every seat count (2, 3, 4).
8. The board animation keeps up with quick pacing: no snap to the latest state (`MAX_WAITING` overflow in `web/src/scene/director.ts`) in a CPU-only quick match.
9. After a rematch the settings are unchanged and per-game counters (missed turns) are reset.
10. The funnel counts quick matches separately (`match_started_quick`, `match_finished_quick`) and the README documents it.
11. PR #16 features (horse names, pause/resume, close room, sound, shake) still work in quick matches; pause freezes the quick pacing too.
12. A "?" button in the match status line (and a "Luật chơi" item in the Menu and the waiting room) opens a rules sheet at any time, showing the rules of the room's current mode (quick-match differences first); the turn clock keeps running and the sheet shows the remaining seconds on the reader's own turn. The sheet, the waiting-room mode description and the first-match card read one copy source (`shared/rules-text.ts`) that a unit test keeps identical to the landing page rules.
13. When a rule variant is chosen, the mode picker, the first-match card, the in-match lock cues and the win dialog explain it (phase 4, requirement 5).
14. `npm run typecheck`, `npm test` and `npm run e2e` pass.

## Decisions taken as defaults

- Turn time is one of `10, 15, 20, 30, 60` seconds, default 30. There is no "off" (beyond the quick variant in Decisions): a connected idle tab would hold the room forever, since the idle close only fires when no human is connected.
- Settings are a single object `{ turnSeconds, quick, autoRoll }` set by one message, stored in `RoomState.settings` (the same `room` storage key: no extra row, no extra write beyond the commit that every host action already causes). Editable only while `waiting`; kept across rematch.
- "Ván nhanh" is a preset of pace-only changes: auto-move on a single legal horse (humans and timeouts alike), CPU pace of 400 ms per animated segment (a roll or a move; a combined roll-and-move waits 800 ms), board animation budget of 0.35 s per segment. The client preselects 20 s when the host turns it on; the server treats `turnSeconds` and `quick` independently.
- "Tự đổ xúc xắc" is a separate switch (not part of the quick preset) because rolling is the one action a person may enjoy, and PR #16 added shake-to-roll.
- Disconnect grace (`playingDisconnectMs` 3 s) is not shortened: a page refresh must reconnect inside it, and 3 s is already short next to the 30 s turn.
- Idle policy: 2 consecutive timeouts of a connected human put the seat on autopilot. It applies to normal matches as well; it is a pacing guard, not a rule.
- Timings in the fast e2e mode scale the chosen seconds (`turnUnitMs`) so timeouts are testable.
- Funnel: two extra events for quick matches, counted in addition to the existing solo/group start, so the existing totals stay comparable.

## Decisions (accepted)

The user chose the rule variant and answered the open questions below; this section replaces them.

- **Rule variant N3 for quick matches.** Classic matches keep today's rules exactly (`shared/game/types.ts` rules 1-7 unchanged; the quick variant is documented next to them).
  - Each colour starts with one horse already on its entry cell (progress 0); the other three are in the stable.
  - A colour's home column is locked until that colour has kicked at least one opponent horse (any kick counts, including one made by leaving the stable onto an occupied entry cell). While locked, a horse still moves up to its gate (progress 55) but cannot climb; a horse on the gate with the column locked has no legal move.
  - Win: the first horse of any colour to enter its home column (any step) wins immediately.
  - Everything else unchanged (exit on 1/6, no jumping, exact count, extra roll on 1/6, forced move).
  - The variant lives in game state (`GameState.variant`, `GameState.unlocked` by colour) so the engine stays pure; a stored game without them is classic.
- **The quick preset also carries the pace-only items**: auto-move when exactly one legal move, faster CPU and animation pace. "Tự đổ xúc xắc" stays a separate switch.
- **Turn timer**: the host chooses 10/15/20/30/60 s, default 30; turning quick on preselects 20 s when still at 30.
- **Plan defaults taken for the other questions**: no "off" timer; autopilot after 2 missed turns, for every match; the mode is not shown in the lobby list; the other variants (N1, N2, 2 horses per colour, win at N horses, leave-stable-on-any-roll, auto-roll in the preset) are not implemented.
- **CPU plays N3 at every level**: a CPU never picks an illegal move; Normal and Easy keep their priorities (a kick comes first, which is what opens a locked column) and, in a quick game only, a move into the home column comes before everything because it wins; Hard values the first kick of a locked colour and the winning climb. Classic CPU behaviour is unchanged.

## Measurement (all-CPU matches, Thường level)

`PACING_REPORT=1 npx vitest run shared/game/pacing.test.ts` plays 200 games per row (seeds 1000..1199, the same dice for every mode, every seat a Thường CPU, the CPU code of this branch) with `shared/game/pacing.ts`. All 200 games of every row finished. Columns:

- *Thao tác*: every roll and every move.
- *Commit khi người chơi*: server commits when people take every action. A classic room is one commit per action; a quick room merges a roll with its move when exactly one horse can move.
- *Commit khi máy chơi*: commits when CPUs take every action. Since the automated-turn change (one step for a CPU roll and its move) this is one commit per roll in both modes.
- *Phút theo nhịp server*: the pause the server imposes after commits when it plays for CPUs: 700 ms per action in a classic room, 400 ms per animated segment in a quick room. It is the floor set by the server, not the match duration: people's thinking and clicking time is not modelled.

| Ghế | Chế độ | Thao tác TB / trung vị / p90 | Commit khi người chơi | Commit khi máy chơi | Phút nhịp server | Lượt chọn ngựa TB | Nước bắt buộc TB | Đá ngựa TB |
|---|---|---|---|---|---|---|---|---|
| 2 | thường | 472 / 468 / 574 | 472 / 468 / 574 | 248 / 245 / 304 | 5,5 / 5,5 / 6,7 | 144 | 81 | 12,8 |
| 2 | luật nhanh, nhịp thường | 112 / 98 / 176 | 112 / 98 / 176 | 57 / 50 / 90 | 1,3 / 1,1 / 2,1 | 39 | 16 | 3,4 |
| 2 | **ván nhanh (N3)** | 112 / 98 / 176 | 96 / 83 / 153 | 57 / 50 / 90 | 0,7 / 0,7 / 1,2 | 39 | 16 | 3,4 |
| 3 | thường | 1001 / 985 / 1330 | 1001 / 985 / 1330 | 530 / 523 / 701 | 11,7 / 11,5 / 15,5 | 295 | 176 | 46,5 |
| 3 | luật nhanh, nhịp thường | 199 / 161 / 317 | 199 / 161 / 317 | 103 / 83 / 166 | 2,3 / 1,9 / 3,7 | 64 | 32 | 10,4 |
| 3 | **ván nhanh (N3)** | 199 / 161 / 317 | 166 / 136 / 273 | 103 / 83 / 166 | 1,3 / 1,1 / 2,1 | 64 | 32 | 10,4 |
| 4 | thường | 1992 / 1934 / 2720 | 1992 / 1934 / 2720 | 1066 / 1037 / 1452 | 23,2 / 22,6 / 31,7 | 562 | 364 | 118,1 |
| 4 | luật nhanh, nhịp thường | 346 / 269 / 619 | 346 / 269 / 619 | 182 / 142 / 325 | 4,0 / 3,1 / 7,2 | 105 | 59 | 22,0 |
| 4 | **ván nhanh (N3)** | 346 / 269 / 619 | 287 / 223 / 522 | 182 / 142 / 325 | 2,3 / 1,8 / 4,1 | 105 | 59 | 22,0 |

Reading it:

- The classic 4-seat median of 1934 actions reproduces the "about 1900" of issue #6; the figure is now reproducible from the repo.
- N3 cuts the 4-seat median from 1934 to 269 actions (about 7 times fewer), 2-seat from 468 to 98, 3-seat from 985 to 161. Most of the gain comes from the rule change (the "luật nhanh, nhịp thường" rows); the pace changes add the merge of forced moves for people (commits 269 -> 223 at 4 seats) and the shorter pause (4-seat server pacing 3,1 -> 1,8 minutes at the median).
- Human time is not in the table. For a 4-player quick match the median of 269 actions finishes within 10 minutes only if an action takes 2,2 s or less on average (600 s / 269); at the p90 of 619 actions it needs 0,97 s or less. The 4-seat figure is therefore not "far above 10 minutes" on the server side, but with people it depends on how fast they play and should be re-checked with real matches (the funnel counts `match_started_quick` and `match_finished_quick`).
- Storage writes (issue #6): the commits-per-match change is the merge of forced moves for people (16 / 32 / 59 per match at 2 / 3 / 4 seats on average) and nothing else; CPU commits already merge roll and move since the automated-turn change. Settings add no write per action.

CPU strength in quick matches (1000 games, seeds 100000.., 95% Wilson interval; the stronger level plays one seat and rotates over the colours):

| Cặp | Ghế | Thắng của bên đầu | Khoảng 95% |
|---|---|---|---|
| Thường vs Thường (đối chứng) | 2 | 47,2% | 44,1-50,3% |
| Khó vs Thường | 2 | 61,5% | 58,4-64,5% |
| Thường vs Dễ | 2 | 83,9% | 81,5-86,0% |
| Khó vs Dễ | 2 | 90,7% | 88,7-92,3% |
| Khó vs 3 Thường | 4 | 28,1% | 25,4-31,0% (ngẫu nhiên: 25%) |
| Thường vs 3 Dễ | 4 | 53,4% | 50,3-56,5% |
| Khó vs 3 Dễ | 4 | 64,6% | 61,6-67,5% |

The order Khó > Thường > Dễ holds in quick matches as in classic ones; a quick match is short and dice-driven, so the Hard edge over Normal is smaller than in classic.

## Interaction with other work

- **PR #16 (assume merged first).** Overlapping files: `shared/protocol.ts` (`Seat`, `RoomSnapshot.paused`, `RoomClientMessage`), `worker/rooms/room-do.ts` (`parseClientMessage`, `handle` switch, `apply`, `leave`, `alarm`), `worker/rooms/room-state.ts` (`StoredSeat`, `RoomState.pausedAt`, `resumeGame`, `nextWake`, `reconcileConnections`), `web/src/room/WaitingView.tsx`, `web/src/room/MatchView.tsx`, `web/src/scene/director.ts`, `GameScene.tsx`, `SceneContent.tsx`, `scene/props.ts`, `README.md`. New messages here are additive (`settings`, `back`); `RoomSnapshot` gains `settings` and `Seat` gains `auto` next to PR #16's `paused` and `horseNames`. `resumeGame` and `reconcileConnections` compute takeover delays from `Timings`; they must receive the room's effective timings (phase 2), and pause must freeze the new auto-roll schedule (it does by shifting `dueAt`, like the turn clock). Re-read the merged files before editing.
- **Other plans in flight** (`CPU difficulty`, `quick emotes`): CPU difficulty also edits `shared/game/cpu.ts` and `chooseCpuMove`; the phase 1 simulator takes the chooser as a parameter so both can measure. Emotes add messages to the same union; keep each message in its own `case` to merge cleanly.

## Phases

| # | Phase | Brief |
|---|---|---|
| 0 | [Rules sheet](phase-00-rules-sheet.md) (**implemented**, classic rules only; quick-mode block comes with phase 4) | "?" button in the HUD, Menu item and waiting-room entry open mode-aware rules at any time; one shared copy source checked against the landing page. Shippable before the other phases |
| 1 | [Baseline measurement](phase-01-measurement.md) (**implemented**: `shared/game/pacing.ts`, results in Measurement above) | Pure simulator and report of actions, commits, human prompts per match, before any change |
| 2 | [Settings and turn timer](phase-02-settings-turn-timer.md) (**implemented**; in fast e2e mode one turn-second is 400 ms, so the default 30 s is 12 s) | `RoomSettings`, protocol, effective timings, host message, idle autopilot, tests |
| 3 | [Quick match server](phase-03-quick-server.md) (**implemented**, plus the N3 rules in `shared/game`) | Auto-move, auto-roll, segment-based CPU pace, tests |
| 4 | [Client](phase-04-client.md) (**implemented**, with the N3 explanation surfaces) | Waiting-room controls, countdown/autopilot UI, animation budget, e2e |
| 5 | [Funnel, docs, rollout](phase-05-funnel-rollout.md) (counters, README and landing section **implemented**; the production read-back of the counters remains for after deploy) | Counters, README, re-measure, storage-write review, rollback |
