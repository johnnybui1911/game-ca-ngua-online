---
title: Sticky mobile waiting-room start button
status: accepted
---

# Sticky mobile waiting-room start button

## Outcome

On mobile waiting-room pages, the host's BẮT ĐẦU button remains visible while the page content scrolls.

## Constraints

- Mobile only; desktop layout and behavior remain unchanged.
- Prefer CSS sticky positioning, preserving safe-area padding and existing visual language.
- Keep the React diff minimal and avoid touching unrelated waiting-room changes.

## Non-goals

- No changes to server behavior, desktop layout, or button semantics.

## Acceptance criteria

- At 360x740 and 390x844, scrolling the waiting room keeps the start button within the viewport with readable contrast.
- The sticky button does not touch the notch/screen edge or obscure the drawer/header area.
- An e2e test asserts viewport visibility after scrolling; existing typecheck, tests, and build pass.

## Decisions

- Use a mobile-only `.start-row` sticky rule with an opaque glass-like background and safe-area-aware top offset; this keeps document flow stable and avoids JS scroll listeners.
- Add one focused Playwright spec using the existing room helpers; desktop behavior is covered by the unchanged media boundary and the desktop build/tests.

## Phases

- [phase-01-mobile-sticky.md](phase-01-mobile-sticky.md)
