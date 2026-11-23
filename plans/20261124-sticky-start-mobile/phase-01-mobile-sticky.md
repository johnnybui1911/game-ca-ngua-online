# Phase 1: mobile sticky control and regression coverage

## Context

The waiting-room page is document-scrolled on narrow screens, and the host start row currently participates in normal flow.

## Files

- `web/src/room/room.css`
- `e2e/room-sticky-start.spec.ts`

## Steps

1. Add a max-width mobile sticky rule for `.start-row`, including safe-area top spacing, opaque background, and subtle shadow.
2. Add an e2e test that creates a four-seat waiting room at 360x740, fills enough seats for a long page, scrolls, and asserts the start button remains in the viewport.
3. Run focused e2e, typecheck, unit tests, and build.

## Validation

`npm run typecheck`, `npm test`, `npm run build`, and `/tmp/ca-ngua-orch/e2e-lock.sh e2e/room-sticky-start.spec.ts`.

## Rollback

Revert the focused CSS and test commit.
