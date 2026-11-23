---
title: In-game kick statistics popup
status: accepted
---

# In-game kick statistics popup

## Outcome

During a match, players can open an accessible Vietnamese scoreboard showing each participating colour, player/CPU name, and the server-authoritative number of opponent horses kicked, sorted highest first.

## Constraints

- Count kicks exactly once in the shared rules engine's move-resolution path and broadcast it in `GameState`.
- New games initialize a complete per-colour counter; stored games missing the field read as zero without migration.
- Reuse existing `Modal`, HUD/menu patterns, colours, horse names, and responsive CSS; preserve desktop and 360px mobile layouts.
- No new dependencies, no rule changes, and no changes to nearby waiting-room or i18n work.

## Non-goals

Per-horse kick history, kicked/lost totals, analytics, persistent leaderboards, or changes to winner selection.

## Acceptance criteria

1. `GameState.kicks` records kicker colour counts; a single kick, multiple kicks in one turn, classic and quick games increment correctly; legacy states with no field render/read as zero.
2. Server snapshots carry the updated counter through the existing state broadcast.
3. Match HUD/menu opens a dismissible accessible popup with colour swatch, player name/“Máy”, count, descending sort, and Vietnamese copy; Escape, close button, and backdrop work.
4. Desktop and 360px mobile layouts do not overlap existing HUD controls.
5. Focused unit tests and desktop/mobile e2e coverage pass, followed by typecheck, full tests, and build.

## Decisions

- Use an optional `kicks?: Record<Color, number>` field for compatibility with JSON stored before this feature; `createGame` always initializes all colours to zero and readers use zero fallback.
- Place a compact “Đá” button in the HUD tools so it is always discoverable; on narrow screens it remains alongside existing compact tools and the menu also exposes the same scoreboard action for guaranteed reachability.
- Sort ties by stable colour/seat order to keep the popup deterministic.

## Phases

| # | Phase | Brief |
|---|---|---|
| 1 | Server and shared counter | Add state field, increment at move resolution, compatibility helpers, and unit coverage. |
| 2 | Scoreboard UI | Add HUD/menu trigger, accessible modal rows, responsive styles, and component tests/e2e selectors. |
| 3 | Verification and delivery | Run required checks, review diff, commit, push, and open PR. |

