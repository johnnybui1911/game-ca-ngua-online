---
title: Waiting-room UI polish
status: accepted
---

# Waiting-room UI polish

## Outcome

Keep room identity and start controls visible while scrolling, simplify color selection and room creation, and balance settings spacing.

## Constraints

Vietnamese copy, server-authoritative color changes, compatible stored rooms and protocol, no new runtime dependency, focused changes.

## Non-goals

Game rule changes, migration of existing rooms, deployment or merge.

## Acceptance criteria

- The complete opaque header sticks in the scrolling room panel on mobile and desktop, clear of the sound control; mobile sharing actions are accessible 44px targets.
- Seated players can select only empty seats, without interfering with adding CPUs.
- Mobile seat count is concise, takeover control is hidden, and new rooms default to takeover enabled while explicit choices and stored rooms remain unchanged.
- Settings spacing and mode rules link match the request.
- Unit tests, typecheck, full tests and build pass; update user-visible E2E specs without running them per Johnny's instruction. Measure the requested viewports using a temporary Playwright script and stop its server.

## Decisions

- Default omitted `allowTakeover` to true on the server, preserving explicit false for protocol clients and existing stored rooms.
- Use a separate button inside an empty seat alongside the CPU button to avoid nested interactive elements.
- Apply sticky styling at all widths because the shell scrolls the waiting panel on desktop too.
- Run autonomously and skip E2E execution as explicitly instructed.

## Phases

| Phase | Status | Detail |
|---|---|---|
| 1 | Pending | [Implementation and verification](phase-01-implementation.md) |
