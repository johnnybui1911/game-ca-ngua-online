# Phase 0: rules sheet available at any time

Shippable on its own, before any timer or quick-match work: it helps classic matches today and becomes the place where quick-match rules are explained later.

## Context

- The rules text lives only in the static landing page (`co-ca-ngua-online.html`, section `#luat-choi`, list `.lp-rules`) and as a code comment in `shared/game/types.ts`. Nothing inside a room explains the rules.
- The match HUD (`web/src/room/MatchView.tsx`) has a status line `.hud-line` with `turn-banner`, `countdown` and `dice-value`, and an action row `.hud-actions` with roll/move buttons, `EmotePicker`, `match-menu-button` ("Menu", PR #16) and `leave-room`. At 360 px the action row is already full (seen while adding the emote button, which now shows only its icon below 420 px).
- The Menu dialog (`match-menu`) holds sound and shake switches.
- Pausing is host-only (PR #16); opening a dialog must not stop the turn clock.

## Requirements

1. A round "?" button with `aria-label="Luật chơi"` in `.hud-line`, after the countdown (`data-testid="rules-button"`). It is visible in every match state (my turn, others' turn, paused, finished) and in the waiting room next to the seat list.
2. The Menu dialog gets a "Luật chơi" item that opens the same sheet.
3. The sheet (`data-testid="rules-sheet"`) is a modal dialog with focus trap, Esc and a "Đóng" button, scrollable on small screens. It shows the rules of the room's current mode:
   - Classic: the seven rules (stable exit on 1 or 6, exact count, no jumping, kick, home column climb, extra roll on 1 or 6, forced move, win with four horses home), the same wording as the landing page.
   - Quick match: a short block "Ván nhanh khác ván thường" at the top listing only what differs for the chosen variant (pace-only items such as auto-move on a single legal move and auto-roll if on; for rule variants, the starting horse, the unlock condition and the win condition), then the shared rules below.
4. While it is the reader's own turn, the sheet header shows the live countdown ("Còn 12 giây") so the player is not surprised by a timeout. The clock is not paused.
5. One source of truth: rules copy lives in `shared/rules-text.ts` (mode-aware: `rulesFor(settings)` returns sections of headings and items). The in-game sheet, the first-match card (phase 4) and the waiting-room mode description all read it. The landing page stays static HTML for SEO; a unit test asserts that every classic rule item from `rulesFor` appears verbatim in `co-ca-ngua-online.html`, so the two cannot drift.
6. Until phase 2 adds `RoomSettings`, `rulesFor` takes no quick settings and returns the classic rules only; phase 4 passes the room settings.

## Files to change

- New: `shared/rules-text.ts`, `shared/rules-text.test.ts` (landing copy check, quick variants produce the difference block first).
- New: `web/src/room/RulesSheet.tsx` (dialog), styles in `web/src/room/room.css` (`.rules-button`, `.rules-sheet`).
- `web/src/room/MatchView.tsx`: button in `.hud-line`, Menu item, render the sheet.
- `web/src/room/WaitingView.tsx`: "Luật chơi" link-button under the seat list.
- `co-ca-ngua-online.html`: only if the copy is aligned to `rulesFor` (the test decides).
- `e2e/room-flow.spec.ts` or a new `e2e/room-rules.spec.ts`.

## Steps

1. Move the rules copy into `shared/rules-text.ts`; make the landing test pass without changing meaning.
2. Build `RulesSheet` with the existing dialog classes (`dialog-backdrop`, `card dialog`) used by the Menu.
3. Add the "?" button and the Menu item; check 360 px and 1280 px layouts (the button is icon-only, 32-40 px, so the status line does not wrap).
4. Add the waiting-room entry.

## Tests

- Unit: `rulesFor()` classic returns seven items in order; landing HTML contains each; `rulesFor({ quick: true, ... })` starts with the difference block.
- e2e: during a match the "?" button opens the sheet, Esc closes it, the turn clock keeps counting while it is open, the sheet is reachable from the Menu and from the waiting room.

## Validation

Screenshots at 360x760 and 1280x800 with the sheet open and closed; the action row and status line keep one line each.

## Risks

- Status line crowding on very narrow screens: the button is icon-only; if it still wraps, fall back to the Menu item only below 340 px.
- Copy drift with the landing page: covered by the unit test.

## Rollback

Remove the button, Menu item and waiting-room entry; `shared/rules-text.ts` can stay unused.
