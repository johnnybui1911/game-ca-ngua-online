# Phase 3: Verification and delivery

## Steps

Run `npm run typecheck`, `npm test`, `npm run build`, and the locked e2e spec; inspect the diff, commit using conventional format, push `feat/kick-stats`, and open a PR to `main`.

## Risks and rollback

Legacy stored JSON must remain readable. Reverting the commit removes the display and counter without requiring data migration because the new field is additive.

