# Phase 1: Implement and verify

## Context

`MatchView.tsx` owns player state, badges and emote anchors. `room.css` switches to a two-column HUD below 720 px. `useHudInsets` measures the top element and reserves the largest size for the current viewport.

## Steps

1. Capture unmodified HUD and board framing for the requested cases.
2. Implement the mobile-only strip and minimal accessible status cues using the current components and tokens.
3. Update the owning README description and add focused regression coverage without changing game contracts.
4. Capture after screenshots, inspect chip spacing, emote placement, safe-area handling, contrast, and camera measurements; compare desktop.
5. Run typecheck, unit tests and build. Do not run E2E.
6. Review the diff, update this plan and the brainstorm status, and open the requested PR with honest measurements and screenshot paths.

## Risks and rollback

Small chips can truncate names or clip bubbles; check the narrowest tested viewport and both edge seats. The camera can be width-limited, so a smaller HUD does not necessarily make the board larger. Revert the feature commit to restore the previous layout; no stored state changes.

## Verification

- At 360×740 and 390×844 the four-seat classic HUD decreased from 133.1 px to 52 px for names of at most eight words; quick decreased from 136 px to 52 px. A name over eight words switches four seats to 100 px. Heights include 8 px top padding, 44 px cards and, for two rows, a 4 px row gap with zero safe-area inset.
- The projected board remains 345.6×272.4 px and 374.4×296.1 px respectively; it is width-limited. At 1280×800 the HUD remains 64 px and board 973.7×447.8 px.
- Two and three seats use one row for short names. With a nine-word name, two seats stay in one row and three seats use two rows with the last chip centered; the four-word long-name capture truncates in one row. A real host emote and synthetic edge bubbles stayed within the viewport. Local screenshots are in `plans/reports/mobile-hud-compact/` and are gitignored.
- One-row chips measured 7 px from chip edge to avatar/name (including border), with a 6 px avatar-to-name gap. The two-row layout uses 8 px padding and gap.
- Calculated contrast on the solid glass: cream name 14.9:1, gold name 12.1:1, empty pip 10.9:1, and the red/blue/yellow/green filled pips 4.5/5.4/10.6/6.8:1. Active chip tint can slightly change these ratios.
- Typecheck and build passed; `npx vitest run --maxWorkers=4` passed 749 tests with 3 skipped, including word-count threshold tests. Build reports an existing large-chunk warning. E2E was not run as requested; a mobile regression spec was added and quick-mode expectations were updated.
- Headless Chrome captures use zero safe-area inset; actual notched devices, assistive technology and English translations from PR #72 still need device/integration verification.
