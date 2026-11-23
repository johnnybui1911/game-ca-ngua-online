---
title: In-game kick statistics
status: accepted
---

# In-game kick statistics

## Outcome

Players can open a live, sorted scoreboard of opponent horses kicked by each colour during a game.

## Constraints

- The server resolves moves and persists/broadcasts game state; existing stored games must remain playable without migration.
- Reuse the match menu and Modal, support desktop and 360px mobile, and preserve existing rules.
- No new runtime dependencies. Do not run e2e per Johnny's update.

## Non-goals

Time-limit winners, victim counts, retrospective reconstruction of legacy kicks, deployment, and merging.

## Acceptance criteria

- Each resolved kick increments its kicker once in classic and quick games, including multiple bonus-roll moves; new games start at zero and missing legacy counts read as zero.
- The Vietnamese scoreboard lists game colours and current occupants, sorted descending by kicks, and closes by close button, backdrop, or Escape.
- Add desktop and mobile e2e coverage without running it; run focused unit tests, typecheck, the unit suite and build.
- Document the shared counter and player-facing menu entry; open a PR with evidence.

## Decisions

- Use `GameState.kicks` indexed by colour, initialized for every colour. An absent legacy field means zero; counts before the upgrade cannot be recovered.
- Increment in `applyMove` where the kicked horse is returned, so all server move paths use the same logic.
- Put the scoreboard in the in-game menu at all viewport sizes; it avoids changing the already dense HUD.
- Display the latest authoritative room snapshot, not animation-delayed board state, and break ties by colour order.
- Backdrop dismissal is opt-in on Modal so other dialogs keep their existing behavior.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | [Counter and compatibility](phase-01-counter.md) | Pending |
| 2 | [Scoreboard, documentation and checks](phase-02-scoreboard.md) | Pending |

Phase 1 precedes phase 2.
