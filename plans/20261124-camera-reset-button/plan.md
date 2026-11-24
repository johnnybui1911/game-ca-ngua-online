---
title: Reset match camera
status: accepted
---

# Reset match camera

## Outcome

During a match, a button above the left edge of the bottom controls returns the camera to the player's default seat view.

## Constraints

- Reuse the seat pose, viewport fit and HUD framing; respect the motion setting and system preference.
- Do not interrupt a kick camera shot. Do not change game rules, storage or dependencies.
- Match the creator badge size and placement across viewport sizes and safe areas.

## Non-goals

Changing the HUD layout, spectator rules, camera controls or translating unrelated strings.

## Acceptance criteria

- A labelled Vietnamese icon button mirrors the creator badge in the match.
- After orbiting or zooming, reset returns to the current seat's default position and board-centre target, smoothly or instantly with reduced motion.
- Taps during a kick shot are ignored.
- Unit tests, typecheck, tests and build pass; visual checks cover phone and desktop. E2E is not run per Johnny's update.

## Decisions

- Keep the button visible throughout a match; avoiding movement detection keeps the change small.
- Ignore taps during an active kick shot, and use the existing seat-flight interpolation with a shorter duration.
- Pass a match-scoped callback through the existing persistent scene handoff, without new global state.

## Phases

1. [Implement and verify](phase-01-camera-reset.md).
