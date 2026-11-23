# Phase 3: server-made text

## Requirements
- `dict/errors.ts`: one `err.*` key per Vietnamese message the worker can send (literal text, `{n}` placeholders where it embeds a limit); `error-text.ts` builds a matcher from them. `errorText(t, message)` translates a known message and returns an unknown one unchanged.
- Used where an error is shown: forms (`ApiRequestError.message`), room failure page, waiting/match action error, lobby toast, feedback send error.
- `room/names.ts`: `cpuDisplayName` (`Máy n` -> `CPU n`), `seatName` for HUD, win dialog, emote live region.
- Rules, quick-match intro and emotes: Vietnamese entries reference the `shared/` constants; `room/rules-copy.ts` mirrors `rulesFor`.

## Done when
The worker-message coverage test passes.
