# Phase 2: UI, tests and delivery

## Files and steps

Update waiting-room settings, match HUD and end dialog, relevant tests and README. Adjust e2e specs for the visible control; do not run e2e. Verify focused tests, typecheck, unit suite and build, review the diff, commit and open a PR against `feat/kick-stats`.

## Validation

Verify host and read-only selections, compact countdown and all time-expiry explanations. Record actual verification and any limitations in the PR.

## Risk and rollback

Parallel PRs modify nearby HUD and waiting-room code; keep changes focused. Revert the feature commit if needed.
