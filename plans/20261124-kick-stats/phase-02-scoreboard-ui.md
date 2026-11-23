# Phase 2: Scoreboard UI

## Requirements

- Add a compact HUD action and menu action that open one `Modal` scoreboard.
- Render participating colours only, with swatch, seat name (CPU names already read as Máy), kick count, and deterministic descending sort.
- Support close button, backdrop, Escape, focus handling from `Modal`, Vietnamese copy, and 360px responsive layout.

## Files

- `web/src/room/MatchView.tsx`
- `web/src/room/room.css`
- `e2e/room-kick-stats.spec.ts`

## Validation

Desktop and mobile e2e opens the popup and verifies rows/copy; run through `/tmp/ca-ngua-orch/e2e-lock.sh`.

