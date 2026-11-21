---
title: Host-set turn timer and quick match ("ván nhanh")
status: proposed
---

# Host-set turn timer and quick match ("ván nhanh")

## Outcome

The host of a room chooses, in the waiting room, how long each player has per action and whether the match is a "ván nhanh". A quick match plays the same rules as today but removes dead time: a roll with exactly one legal move plays that move at once, the server paces CPU turns and the board animation faster, and an idle human stops holding the table up. Same board, same rules (`shared/game/types.ts` untouched), fewer minutes per match and fewer Durable Object commits.

## Why (evidence in the code)

- A 4-player match is about 1900 actions (issue #6, "median, CPU simulation"); a CPU action fires `cpuDelayMs: 700` after the previous one (`worker/rooms/constants.ts`, `NORMAL`). At that pace the CPU delay alone is about 1900 × 0.7 s ≈ 22 min for a table of CPUs (arithmetic on the issue's figure, not measured). The checked-in simulation (`shared/game/engine.test.ts`, "simulation") only asserts that 200 games finish; it reports no counts, so the 1900 figure is not reproducible from the repo. Phase 1 fixes that before any change.
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
- The rules in `shared/game/types.ts` are a confirmed user decision: nothing in "Decisions" changes them. Rule variants are only in Open questions.

## Non-goals

Any rule change (see Open questions), per-player timers, spectators, a chess-clock bank of time, persisting settings per account, showing the mode in the public lobby list, reducing writes by batching persistence (issue #6's own follow-up), sound or horse-name work (PR #16).

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

- Turn time is one of `10, 15, 20, 30, 60` seconds, default 30. There is no "off" (see Open questions): a connected idle tab would hold the room forever, since the idle close only fires when no human is connected.
- Settings are a single object `{ turnSeconds, quick, autoRoll }` set by one message, stored in `RoomState.settings` (the same `room` storage key: no extra row, no extra write beyond the commit that every host action already causes). Editable only while `waiting`; kept across rematch.
- "Ván nhanh" is a preset of pace-only changes: auto-move on a single legal horse (humans and timeouts alike), CPU pace of 400 ms per animated segment (a roll or a move; a combined roll-and-move waits 800 ms), board animation budget of 0.35 s per segment. The client preselects 20 s when the host turns it on; the server treats `turnSeconds` and `quick` independently.
- "Tự đổ xúc xắc" is a separate switch (not part of the quick preset) because rolling is the one action a person may enjoy, and PR #16 added shake-to-roll.
- Disconnect grace (`playingDisconnectMs` 3 s) is not shortened: a page refresh must reconnect inside it, and 3 s is already short next to the 30 s turn.
- Idle policy: 2 consecutive timeouts of a connected human put the seat on autopilot. It applies to normal matches as well; it is a pacing guard, not a rule.
- Timings in the fast e2e mode scale the chosen seconds (`turnUnitMs`) so timeouts are testable.
- Funnel: two extra events for quick matches, counted in addition to the existing solo/group start, so the existing totals stay comparable.

## Open questions for the user

Rule-changing variants. None is implemented by this plan until you choose; each needs your decision because `shared/game/types.ts` is a confirmed decision. How other games do it (checked 2026-11-21): Ludo King quick mode starts with two tokens out, the first token home wins, and a player must capture one opponent token first (vendor claims 5-10 min vs 30-40 min classic); Ludo SuperStar and Party Ludo use "first token home wins" too. Vietnamese rules forbid two same-colour horses on one cell, so only one horse can start out.

Candidates to measure with the phase 1 simulator, choosing the one whose 4-player median lands near 5-10 minutes:

- **N1**: one horse per colour starts on its entry cell; the first horse to enter its home column wins.
- **N2**: as N1, but the first colour with two horses in the home column wins.
- **N3**: as N1, but a colour's home column stays locked until it has kicked at least one opponent horse (fits the "đá ngựa" pitch; needs the lock cues in phase 4).

"Enters its home column" (any step) is proposed as the win point, because climbing to step 6 under rule 4 can take many extra turns. Recommendation: N3 with all four explanation surfaces, then ask 5-10 testers whether they understood why they won or lost; fall back to N1 if not.

Other variants and questions:

1. **2 horses per colour** instead of 4 (`HORSES_PER_COLOR` in `shared/game/types.ts`). Touches `createGame`, `legalHorsesFor`, `cpu.ts`, stable layout in `web/src/scene/layout.ts` and `Pieces.tsx`, and PR #16's four-name contract (`cleanHorseNames` requires length `HORSES_PER_COLOR`, `Seat.horseNames`). Largest effect on length.
2. **Each colour starts with one horse already on its entry cell** (changes `createGame`, removes most of the "wait for 1 or 6" dead time).
3. **Win when the first N horses reach home** (for example 2 or 3), which needs a field on `GameState` and changes the win check `row.every(isHome)` in `applyMove`.
4. **Leave the stable on any roll, or extra tries to roll when every horse is in the stable**: changes rule 1 of the rules text.
5. Should the turn timer have an **"off" choice for private rooms** with friends? Risk: an open but idle tab blocks the room indefinitely (no alarm, no writes, but nobody is told).
6. Should **auto-roll** be part of the "Ván nhanh" preset instead of a separate switch?
7. Should the mode ("Ván nhanh", turn time) show in the **public lobby list**? It would add a field to `RoomSummary` and one lobby write per change.
8. Is **autopilot after 2 missed turns** acceptable for normal matches, or only for quick ones? Should a third miss hand the seat to a CPU for good (as `leave` does)?

Recommended default set if you say "just do it": the rules sheet (phase 0) and everything in "Decisions taken as defaults" (all pace-only). Rule variants only after you pick N1, N2 or N3.

## Interaction with other work

- **PR #16 (assume merged first).** Overlapping files: `shared/protocol.ts` (`Seat`, `RoomSnapshot.paused`, `RoomClientMessage`), `worker/rooms/room-do.ts` (`parseClientMessage`, `handle` switch, `apply`, `leave`, `alarm`), `worker/rooms/room-state.ts` (`StoredSeat`, `RoomState.pausedAt`, `resumeGame`, `nextWake`, `reconcileConnections`), `web/src/room/WaitingView.tsx`, `web/src/room/MatchView.tsx`, `web/src/scene/director.ts`, `GameScene.tsx`, `SceneContent.tsx`, `scene/props.ts`, `README.md`. New messages here are additive (`settings`, `back`); `RoomSnapshot` gains `settings` and `Seat` gains `auto` next to PR #16's `paused` and `horseNames`. `resumeGame` and `reconcileConnections` compute takeover delays from `Timings`; they must receive the room's effective timings (phase 2), and pause must freeze the new auto-roll schedule (it does by shifting `dueAt`, like the turn clock). Re-read the merged files before editing.
- **Other plans in flight** (`CPU difficulty`, `quick emotes`): CPU difficulty also edits `shared/game/cpu.ts` and `chooseCpuMove`; the phase 1 simulator takes the chooser as a parameter so both can measure. Emotes add messages to the same union; keep each message in its own `case` to merge cleanly.

## Phases

| # | Phase | Brief |
|---|---|---|
| 0 | [Rules sheet](phase-00-rules-sheet.md) | "?" button in the HUD, Menu item and waiting-room entry open mode-aware rules at any time; one shared copy source checked against the landing page. Shippable before the other phases |
| 1 | [Baseline measurement](phase-01-measurement.md) | Pure simulator and report of actions, commits, human prompts per match, before any change |
| 2 | [Settings and turn timer](phase-02-settings-turn-timer.md) | `RoomSettings`, protocol, effective timings, host message, idle autopilot, tests |
| 3 | [Quick match server](phase-03-quick-server.md) | Auto-move, auto-roll, segment-based CPU pace, tests |
| 4 | [Client](phase-04-client.md) | Waiting-room controls, countdown/autopilot UI, animation budget, e2e |
| 5 | [Funnel, docs, rollout](phase-05-funnel-rollout.md) | Counters, README, re-measure, storage-write review, rollback |
