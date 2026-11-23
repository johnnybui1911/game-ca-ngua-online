# Phase 2: UI and e2e

- `web/src/room/ColorPicker.tsx`: swatches for the room's colours; mine = checked, free = button, taken = disabled with the holder's name in the title/aria-label. `data-testid="color-<n>"`.
- `web/src/room/room.css`: `.color-picker` styles, wraps below the seat info on narrow screens.
- `WaitingView.tsx`: render the picker in my seat row (one line).
- `e2e/room-color.spec.ts`: host changes colour, guest sees it; guest cannot take a taken colour (button disabled; a raw `color` message gets `color_taken`); CPU colour disabled.
