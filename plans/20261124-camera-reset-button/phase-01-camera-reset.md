---
title: Implement and verify camera reset
status: completed
---

# Implement and verify

- Wire a reset callback from match chrome to the camera rig and reuse seat pose/fit.
- Add a mirrored button, focused unit coverage and an E2E spec without running E2E.
- Verify focused tests, typecheck, full tests, build and phone/desktop visual checks.
- Update the README for the new control; review the diff and open a PR.

Risk: control damping or cinematic movement may disturb the destination. Clear pending damping before flight and ignore active kick shots.

Verification: camera unit tests cover all seats and portrait/desktop poses; a local Playwright visual check confirms matching 40 px buttons and exact restoration at 390x844 and 1280x800. E2E was not run per Johnny's instruction.
