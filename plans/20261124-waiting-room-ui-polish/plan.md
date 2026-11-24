---
title: Waiting-room UI polish
status: accepted
---

# Waiting-room UI polish

## Outcome

Keep room identity and start controls visible while scrolling, simplify color selection and room creation, balance settings spacing, and polish the in-game clock and local turn label.

## Constraints

Vietnamese copy, server-authoritative color changes, compatible stored rooms and protocol, no new runtime dependency, focused changes.

## Non-goals

Game rule changes, migration of existing rooms, deployment or merge.

## Acceptance criteria

- The complete opaque header sticks in the scrolling room panel on mobile and desktop, clear of the sound control; mobile sharing actions are accessible 44px targets.
- Seated players can select only empty seats, without interfering with adding CPUs.
- Mobile seat count is concise, takeover control is hidden, and new rooms default to takeover enabled while explicit choices and stored rooms remain unchanged.
- Settings spacing and mode rules link match the request.
- A limited-game clock sits above the HUD without colliding with the badge or future camera reset control, is readable and urgent in its final minute, and is absent for unlimited games. Only the local turn label shortens on mobile.
- CPU add/remove actions use robot icons with plus/minus badges and remain separate from color selection.
- Clear the neighbouring track discs and centre dais from all home stairs without moving game positions, changing horse heights, or altering the approved 3D look.
- Unit tests, typecheck, full tests and build pass; update user-visible E2E specs without running them per Johnny's instruction. Measure the requested viewports using a temporary Playwright script and stop its server.

## Decisions

- Default omitted `allowTakeover` to true on the server, preserving explicit false for protocol clients and existing stored rooms.
- Use a separate button inside an empty seat alongside the CPU button to avoid nested interactive elements.
- Apply sticky styling at all widths because the shell scrolls the waiting panel on desktop too.
- Reserve the 40px band above the match panel in board framing and move transient overlays above it. Do not animate clock urgency.
- Run autonomously and skip E2E execution as explicitly instructed.
- Keep all home discs full-size, centre track discs between the coloured lanes and wood edges, align the three tip-row discs, and move horse poses with them. Narrow treads and the central dais and medallion; keep collision footprints consistent with the rendered geometry.

## Phases

| Phase | Status | Detail |
|---|---|---|
| 1 | Complete | [Implementation and verification](phase-01-implementation.md) |
| 2 | Complete | [Home stair clearances](phase-02-stair-clearances.md) |
