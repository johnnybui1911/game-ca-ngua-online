---
title: Compact mobile player HUD
status: complete
---

# Compact mobile player HUD

## Outcome

At widths below 720 px, show players in one compact row when all names have at most eight words, or two rows when any has more. Chips are equally wide, names truncate, and avatars, turn emphasis and four finished-horse marks remain visible.

## Constraints and non-goals

- Keep desktop, bottom controls, game rules and existing server state unchanged.
- No expand button, menu toggle, new screens or new dependencies. Keep CPU difficulty in the waiting room and quick-mode rules in the rules sheet.
- Preserve screen-reader progress and a non-color turn cue. Respect safe-area insets and reduced motion.
- Do not run E2E; use a throwaway local Playwright visual probe, then stop its server.

## Design brief

- Register: product, a game HUD rather than a list or settings panel.
- Scene: players checking turn and progress quickly while playing on a phone.
- Direction: restrained lacquered glass and fine gold edging from the existing Tết scene; compact seat-colored avatars anchor each chip.
- Color: existing warm glass and cream text with the four horse colors as status accents.
- Type: existing Be Vietnam Pro, with mobile names at 12 px and one line.
- Signature: a seat-color turn ring and bold name, with four evenly aligned progress marks.
- Dials: variance 3, motion 2, density 7.

## Decisions

- Johnny's latest decision: one row when all names have at most eight whitespace-separated words; otherwise two rows. Chips are equal width with only ordinary spacing between columns. No expand, menu controls or triangle marker. Hide secondary badge rows on mobile, while retaining small lock/offline cues.
- Two seats remain on one row even for long names; with three seats and a long name, center the third chip in the second row at the same width as the first two.
- Truncate names that do not fit their chip, independently of their word count.
- Keep the existing maximum-inset camera policy; the mobile strip has stable height and the observer measures it directly.
- Use existing icon, color and glass tokens; do not introduce a UI library or new copy for decorative cues.

## Acceptance

- Two, three and four players fit in equal-width chips using the requested word-count threshold; names truncate without overlapping, and emotes remain attached and visible within the viewport.
- A progress count remains accessible; turn has a visible non-color marker and an accessible indication. Status icons do not clutter.
- 360×740 and 390×844 classic and quick, two-seat, long-name and desktop 1280×800 comparisons include measured HUD and board framing.
- Typecheck, `npx vitest run --maxWorkers=4`, build and focused checks pass; document any limitations.

## Phases

| Phase | Status | Detail |
| --- | --- | --- |
| 1 | Complete | [Implement and verify](phase-01-implement.md) |
