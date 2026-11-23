---
title: Whole-game time limit
status: complete
---

# Whole-game time limit

## Outcome

Replace the waiting-room pace control with a whole-game duration, show its countdown, and finish an expired game with a server-selected winner and explanation.

## Constraints

Server authoritative, no migration, no new dependencies or periodic storage writes. Existing stored rooms without a duration remain unlimited; new rooms default to 60 minutes. Preserve pace in the protocol and game logic. Base and pull request target are `feat/kick-stats`.

## Non-goals

Changing turn time, pace behavior, kick scoring, or other game rules; deployment or merging.

## Acceptance criteria

- Choices are unlimited, 20, 30 and 60 minutes, in that order; host controls them and other players see the selection.
- The game clock starts at game start and pauses when gameplay is frozen. Both classic and quick games finish on expiry.
- Winner ranking is home-horse count, total home steps, kicks, then uniform server crypto randomness. The end dialog identifies the deciding criterion.
- Legacy rooms remain unlimited; older clients changing settings preserve the room's duration.
- Focused unit tests cover selection, legacy compatibility, deadline scheduling and expiry, pause, both modes and all tie breaks. Update user-facing e2e coverage without running it.
- Typecheck, unit tests and build pass; open a stacked PR without deployment.

## Decisions

- Reuse the single Durable Object alarm and store an absolute deadline; resolve expiry before actions so delayed alarms cannot permit a late win.
- Freeze the clock during host pause or complete disconnection, matching existing game/turn clock behavior.
- Persist the result reason in the game state so reconnects and the delayed win dialog show the same result.
- Use the existing byte-rejection crypto draw for uniform selection among tied colours.
- A host-only test message is accepted only with `ROOM_FAST_TIMERS=1` to shorten one room's game for e2e without changing other tests.
- Do not run e2e per Johnny's later instruction; use unit coverage of expiry and scheduling.

## Phases

1. [Server contracts and deadline](phase-01-server.md)
2. [UI, tests and delivery](phase-02-ui.md)
