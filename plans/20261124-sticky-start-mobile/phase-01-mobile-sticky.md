# Phase 1: mobile sticky start

## Context

`.room-page` scrolls inside the shell; `.start-row` is nested inside the shorter player column, preventing it from sticking through the settings and footer.

## Steps

1. Flatten the relevant grids for a host on mobile and make the start row an opaque sticky grid item.
2. Cover the mobile CSS contract with a unit test and add a browser regression spec without running e2e.
3. Measure the actual drawer and button in a throwaway Playwright script at both mobile sizes and desktop; stop the dedicated Vite server.
4. Run typecheck, unit tests and build; review the desktop scope and publish the branch and PR.

## Validation

Check initial and bottom button positions, drawer scroll distance and screen padding, plus unchanged desktop flow. Run `npm run typecheck`, `npm test` and `npm run build`.

## Risk and rollback

Grid flattening affects only host waiting rooms below 900px; check disabled and enabled states. Revert the mobile CSS and its tests to roll back.
