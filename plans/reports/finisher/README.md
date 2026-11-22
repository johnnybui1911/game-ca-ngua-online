# Legacy cleanup and mobile HUD: evidence

Headless Chromium against `npx vite --port 5191` (local D1), `before/` = `release/ui-overhaul` at 4719182,
`after/` = this branch. Each scene at `desktop` (1440x900) and `mobile` (390x844); the match scenes also at
`mobile-360` (360x740).

| Scene | What it shows |
|---|---|
| `home` | `/` hero |
| `name-panel`, `name-panel-error` | `/bat-dau`, empty submit |
| `signin`, `signup` | `/dang-nhap` (empty submit, field errors), `/dang-ky` |
| `not-found` | unknown path |
| `lobby` | signed-in lobby panel |
| `invite-toast` | lobby with an invite toast (was parchment, now glass + `.ui-btn`) |
| `waiting` | waiting room, host |
| `match`, `match-quick` | 4 players (you + 3 CPU), normal and quick match |
| `dialog-menu`, `dialog-rules`, `dialog-close-room`, `dialog-horse-names`, `dialog-win` | match dialogs; `dialog-win` is a guest with the save-account block |
| `design-preview` | `/design-preview.html` |

Pixel diff (`magick compare -metric AE -fuzz 8%`): 0 changed pixels on home, name panel, lobby, sign-up,
not-found, design preview and the desktop dialogs/match-quick; small diffs elsewhere are live content (room
code, board animation, caret, random winner). Intended changes: `invite-toast-*` and the mobile match HUD
(and the dialogs that sit over it on mobile).

Every `.form`, `.field`, `.form-error`, `.field-error`, `.switch-link`, `.divider`, `.toast` and
`.save-account` rendered in these scenes has a `.glass` ancestor, so the removed unscoped parchment form rules
had no remaining reader.
