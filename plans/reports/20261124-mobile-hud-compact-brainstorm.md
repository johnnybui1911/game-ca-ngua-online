# Mobile player HUD brainstorm

Date: 2026-11-24. Status: exploration only; awaiting Johnny's choice.

## Contract

- Outcome: expose more of the board on mobile without losing turn awareness or a way to inspect each player's finished-horse progress.
- Constraints: mobile only; keep desktop and the bottom controls unchanged; use the existing room/game state and avoid new copy where possible because i18n PR #72 is open.
- Non-goals: change game rules, ship production code, open a PR, or run E2E.
- Acceptance: compare actual four-seat classic and quick rooms at 360×740 and 390×844, show screenshots and measured top-HUD heights, and identify lost information, accessibility, costs, and decisions.

## Evidence and method

`MatchView.tsx` renders the four cards, badges, turn state, finished pips and emote anchors. `room.css` switches the existing HUD to a two-column/two-row grid below 720 CSS px. The HUD also includes offline and auto-play badges, not just CPU difficulty and quick-mode lock state. The lower panel already identifies the current turn; the quick-mode personal lock hint appears only in specific circumstances and is not a replacement for every player's lock state.

We captured real local rooms with Nam and three CPUs in classic and quick modes using a throwaway Playwright browser script and `CLOUDFLARE_ENV=e2e-none npx vite --port 5189 --strictPort`. Each layout was injected into the page; no application source was changed. Each variant was loaded fresh so that the camera measured that layout from the start. We checked that quick mode showed its game badge and lock icons. Captures use desktop Chrome headless at device scale 1 with mobile-size CSS viewports, not actual iOS Safari or a notch; safe-area inset was zero. Screenshots are local, gitignored artifacts and do not travel with the commit.

The measurement is the `.hud-players` bounding height, including the 8 px top padding, divided by viewport height. This is **not** a direct measurement of board area or of physical screen pixels; card wrapping, larger text, safe-area insets and longer translations can increase it. The bottom panel is excluded.

| Option / state | 360×740 classic | 360×740 quick | 390×844 classic | 390×844 quick |
| --- | ---: | ---: | ---: | ---: |
| Current | 133.1 px / 18.0% | 136 px / 18.4% | 133.1 px / 15.8% | 136 px / 16.1% |
| 1a: smaller two-column | 104 px / 14.1% | 104 px / 14.1% | 104 px / 12.3% | 104 px / 12.3% |
| 1b: four-player strip | 52 px / 7.0% | 52 px / 7.0% | 52 px / 6.2% | 52 px / 6.2% |
| 2: hidden | 0 px / 0% | 0 px / 0% | 0 px / 0% | 0 px / 0% |
| 3: expandable strip, closed | 52 px / 7.0% | 52 px / 7.0% | 52 px / 6.2% | 52 px / 6.2% |
| 3: expanded | 185.1 px / 25.0% | 188 px / 25.4% | 185.1 px / 21.9% | 188 px / 22.3% |

Captures: [`mobile-hud-compact/`](mobile-hud-compact/) contains `360x740-{classic,quick}-{baseline,small,strip,hidden,expand,expanded}.png` and the corresponding `390x844-...` files. For example: [360 classic closed](mobile-hud-compact/360x740-classic-expand.png), [360 quick expanded](mobile-hud-compact/360x740-quick-expanded.png), [390 classic closed](mobile-hud-compact/390x844-classic-expand.png), [390 quick current](mobile-hud-compact/390x844-quick-baseline.png). The filenames are locally resolvable, but GitHub cannot display these ignored screenshots.

## Options

### 1a. Smaller two-column cards

- Change: keep four cards and pips, hide the secondary badge row on mobile. The prototype is non-interactive.
- Lost: CPU level, lock state, offline and automatic-play status are not reachable in the prototype during the match. The waiting room shows CPU level, and rules explain locking, but neither reports live per-player lock/connection/auto state; a details view would have to be added.
- Accessibility: no new touch target; retain a textual progress label for assistive technology and verify turn indication without relying on color alone. Small colored pips need contrast testing against the glass and bright board.
- Effort/risk: low for CSS alone, medium if all live statuses must remain reachable. It saves only 29–32 px in these captures and loses consequential quick-mode context.
- PR #72: mostly CSS; any new details control or accessible label must use the translated string system after rebasing.
- Assumption/failure: works if secondary status is genuinely expendable; fails first for quick-mode lock and disconnection awareness.

### 1b. Four-player strip

- Change: one mobile row, each card showing avatar, single-line name and four finished-horse dots. The refined prototype uses consistent padding/alignment and 6 px pips; names may truncate. No cards are interactive.
- Lost: same badges as 1a, and long names may be clipped. Count can be announced via an accessible label; the prototype has no route to the full name or hidden status. A details view would be required.
- Accessibility: no new touch targets; verify dot and active-turn contrast for every seat color, reduced-motion, text scaling, screen-reader count/name and color-independent turn indication. Do not depend on dots alone for the accessible count.
- Effort/risk: low-to-medium; 4 players plus long or translated names are tight, and emote bubbles are anchored to these narrower cards.
- PR #72: preserve existing translated names and labels; test both languages and long strings. Avoid hard-coded new copy.
- Assumption/failure: succeeds if the abbreviated cards remain legible; fails with long names or accessibility text sizes unless a details route is provided.

### 2. Menu hides the bar

- Change: add a mobile-only menu switch to hide/show the entire strip. The screenshot simulates the hidden state with CSS only; **the menu switch, persistence and restoring interaction were not prototyped**.
- Lost: all player names, avatars, progress, status and card-anchored emotes disappear. Current turn remains in the lower panel, but finished progress and per-player statuses require restoring the bar; no current separate progress view exists.
- Accessibility: menu switch and restoring path need labeled, keyboard-operable ≥44 px targets and visible state. Players should never be stranded without a discoverable way to restore the bar.
- Effort/risk: medium. `useHudInsets` / `reserveInsets` retain the largest top height at the current viewport size, so hiding the existing HUD during a match will **not** automatically produce the freshly loaded 0 px camera framing shown in the screenshot. Deliberately reset or replace that policy and assess camera motion and emotes.
- PR #72: adds a menu label and state, requiring translated copy and a merge around `MatchView.tsx`; avoid introducing hard-coded Vietnamese.
- Assumption/failure: assumes users will find the menu and accept hiding progress. It fails if the board cannot resize after hiding or users cannot find their way back.

### 3. Expandable one-row strip

- Change: mobile-only strip as in 1b with four dots per player and a small visible chevron at the right. Its 44×44 px hit area expands to the existing two-column cards, restoring CPU, lock, offline and auto badges, full names up to the existing wrap/clamp, and existing progress labels. The prototype's expanded state places the compact chevron at the upper-right; the expanded cards and its own row make it temporarily taller than today. Johnny requested the small right-corner control and dots instead of `0/4`; the refined screenshots reflect this.
- Lost: badges and full names are not continuously visible when closed, but can be inspected by expanding. No actual permanent loss of live data is intended. The prototype does not implement production-grade focus, announcements or collision handling.
- Accessibility: keep an actual ≥44×44 px button even if the visible icon is smaller, with localized accessible name, `aria-expanded`, keyboard focus and a non-color turn cue. Validate pips and names at actual device sizes, high contrast and text zoom; visually inspect all colored pips against the glass. Existing `aria-label` on a generic progress span should be verified with real screen readers rather than assumed reliable.
- Effort/risk: medium. Name truncation, narrow card widths (72 px at 360 with the button), per-seat emote positioning, layout with 2–4 players and 320 px widths, tall expanded quick badges, and board overlap need testing. The prototype toggles the DOM only; it is not an implementation.
- Camera: expanding currently increases `useHudInsets`' retained maximum, so collapsing would leave the board framed for the expanded height. Prefer a stable compact-sized reserved inset with the expanded details overlaying the board temporarily, or explicitly reset/reframe on collapse; verify animations, occlusion, resize/orientation and bottom-panel separation. The current prototype does **not** solve this and its screenshots do not prove board recovery.
- PR #72: the existing badge strings can be reused. The toggle needs localized accessible expand/collapse wording; coordinate the small `MatchView.tsx` change with PR #72, and test VI/EN and long names.
- Assumption/failure: assumes one tap to inspect details is acceptable; fails if important lock/offline changes need to be visible immediately, or if the overlay blocks an urgent action.

## Comparison and recommendation

| Choice | Space when at rest | Live progress and turn | Other status | Main risk |
| --- | --- | --- | --- | --- |
| 1a | Moderate saving | Visible | Lost without extra UI | Limited improvement |
| 1b | Large saving | Visible as dots | Lost without extra UI | No recovery path |
| 2 | Maximum, if camera is fixed | Turn only | Hidden until restored | Discoverability and camera inset |
| 3 | Large saving | Visible as dots | One tap away | Tiny names/pips; expanded overlay and camera |

Recommend **option 3**, refined per Johnny's feedback: mobile-only four-player strip with aligned avatar/name/four dots and a small-looking, 44 px-hit-area chevron at the right. Expand for the existing detail cards, and keep the compact inset stable while details temporarily overlay the board. Keep the bottom panel and desktop unchanged. This is better than a bare strip because live lock, offline and auto state remain discoverable, without requiring a separate menu journey. It costs an additional control and camera/overlay handling; validate with real iOS and Android devices before shipping.

Do not auto-collapse during animations: it can hide information or move a control while the player is using it. Board-corner placement was not prototyped; moving labels near a rotating 3D board risks overlap and weakens stable turn/progress scanning.

## Verification

- Typecheck and production build passed on unchanged code; build warned about existing large chunks.
- `npm test`: first run timed out in two CPU simulations under concurrent build/browser load; a subsequent default run timed out in `shared/game/cpu.test.ts` at its existing 5-second limit. The two affected files passed in isolation (89 tests), and `npm test -- --maxWorkers=2` passed (747 passed, 3 skipped). No production code was changed.
- E2E was not run, per Johnny's update. No PR was opened. The temporary Vite server was stopped.

## Questions for Johnny

1. Accept option 3 and its temporary board overlay when expanded, or prefer the simpler always-visible two-column option?
2. Should quick-mode lock or offline/auto status remain immediately visible while collapsed, even if this makes the strip denser?
3. Should the strip remember the expanded state across reloads, or always start compact? Recommended: always start compact.
