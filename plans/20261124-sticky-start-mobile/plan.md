---
title: Sticky mobile waiting-room start
status: complete
---

# Sticky mobile waiting-room start

## Outcome

The host's start button remains visible at the top of the mobile waiting room while its content scrolls.

## Constraints

Keep desktop and game behavior unchanged, respect shell safe-area padding, avoid a sticky layout jump and use an opaque surface. Do not run e2e; do not add runtime dependencies.

## Non-goals

Changes to room rules, host permissions, drawer behavior on other pages, or deployment.

## Acceptance criteria

- The start button stays visible while the mobile room scroller reaches its bottom at 360x740 and 390x844.
- The button does not overlap shell controls or screen edges; desktop retains its existing flow.
- Unit coverage, typecheck, tests and build pass. Browser measurements use the dedicated port; e2e is not run.

## Decisions

- Use CSS sticky and flatten the mobile host room grid so the row's containing block extends through the room panel. The actual scroll container is `.shell-panel-body > .room-page`.
- Place the row visually first on mobile, keep its DOM and desktop placement unchanged, and use the existing solid glass token.
- Leave space above the row for the fixed sound control; keyboard and screen-reader order follows the unchanged DOM.
- Add a browser regression spec but do not run it, per Johnny's instruction.

## Phases

| Phase | Status | Detail |
|---|---|---|
| 1 | Complete | [Implement and verify](phase-01-mobile-sticky.md) |
