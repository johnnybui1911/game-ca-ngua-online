# Phase 2: client picker, bubbles, mute, sound, accessibility

## Context

`useRoomConnection.onMessage` parses every frame as `RoomServerMessage`; `state` goes into `batches` (queued by `seq` so rendering never skips an animation), everything else is treated as an error with `code`. Emotes are not game state: they must not enter `batches` and must not reset `actionError`. `MatchView` renders `hud-player` tiles and `WaitingView` renders `seat` rows, both keyed by seat/colour from `RoomSnapshot.seats`.

## Requirements

- A picker (8 buttons) reachable in both the waiting room and the match, including when paused or finished.
- A bubble next to the sender's seat for 3 s; newest per seat replaces older.
- Local mute ("Ẩn biểu cảm"), persisted in `localStorage`, default off.
- One soft sound per incoming emote from another player, through PR #16's effects switch.
- Accessible: polite live region, `aria-hidden` bubbles, labelled buttons, reduced motion.
- The state is in memory only; every new socket starts with no bubbles.

## Files to change

- `web/src/room/emote-feed.ts` (new, pure) + `emote-feed.test.ts` (new).
- `web/src/room/emote-settings.ts` (new): mute flag store + test.
- `web/src/room/EmotePicker.tsx` (new), `EmoteBubble.tsx` (new).
- `web/src/room/useRoomConnection.ts`: handle the `emote` message, expose `emotes`.
- `web/src/room/MatchView.tsx`, `WaitingView.tsx`, `RoomPage.tsx` (pass `emotes` through).
- `web/src/room/room.css`.
- `web/src/audio/sound.ts` (from PR #16): `playEmote()`.

## Steps

1. `emote-feed.ts` (pure, testable):
   ```ts
   export const EMOTE_SHOW_MS = 3000;
   export const EMOTE_LOCK_MS = 2000; // matches the server refill so a normal player never hits the drop
   export interface ShownEmote { id: EmoteId; n: number; at: number } // n: client counter, makes a repeat of the same id a new bubble
   export type EmoteBySeat = Record<number, ShownEmote>;
   export function receiveEmote(prev: EmoteBySeat, seat: number, id: EmoteId, n: number, now: number): EmoteBySeat
   export function isShown(e: ShownEmote | undefined, now: number): boolean // now - at < EMOTE_SHOW_MS
   ```
   Local receipt time `at = Date.now()`; no server clock is involved because the emote is not on the `seq` timeline.
2. `useRoomConnection.ts`:
   - Add `emotes: EmoteBySeat` to `RoomConnection` (state, reset to `{}` in the same `useEffect` start that resets `batches`, so reconnect/epoch change clears it).
   - In `onMessage`, first branch: `if (msg.t === 'emote') { if (isEmoteId(msg.id) && Number.isInteger(msg.seat)) setEmotes((p) => receiveEmote(p, msg.seat, msg.id, ++counter.current, Date.now())); return; }` (unknown ids from a newer server are ignored). This must precede `msg.code in FAILURE_TEXT`.
   - Emit the sound there: `if (!muted && seatOf(msg.seat) !== mine) sound.playEmote()`, throttled to at most one every 400 ms in the hook (ref). `myId` comes from `useSession`; compare `room.seats[msg.seat]` occupant user id.
   - `send` is unchanged; `{ t: 'emote', id }` is a `RoomClientMessage`.
3. `emote-settings.ts`: `localStorage` key `ca_emotes_muted` (`'1'`), `useSyncExternalStore` like PR #16's `sound` settings, try/catch for private mode.
4. `EmoteBubble.tsx`: props `{ emote: ShownEmote | undefined }`; uses a timer (`setTimeout` for the remaining ms, cleared on change/unmount) to stop rendering at `EMOTE_SHOW_MS`; renders `<span className="emote-bubble" aria-hidden="true" data-testid="emote-bubble-<seat>" data-emote={id}>{emoji} {text}</span>`, `key={n}` so the animation restarts. Hidden when muted unless it is the viewer's own seat.
5. Placement:
   - `MatchView.tsx`: inside each `<li className="hud-player">` (add `position: relative`), after `hud-home`: `<EmoteBubble .../>`; CSS `position:absolute; top:100%; left:50%; transform:translateX(-50%); z-index: 5; pointer-events:none; white-space:nowrap; max-width: 60vw`. A bubble must never intercept taps on the board (`pointer-events:none`).
   - `WaitingView.tsx`: inside `li.seat` at the end of `seat-info`.
   - Picker: a "💬 Biểu cảm" button in `hud-bottom` (MatchView) and under the seat list (WaitingView). Tapping opens a `role="group" aria-label="Biểu cảm nhanh"` grid of the 8 buttons, `aria-label` = `emoteLabel(id)`, `data-testid="emote-<id>"`; picking sends, closes the grid and locks the button for `EMOTE_LOCK_MS` (`disabled` + short Vietnamese `title`). The grid also holds the mute checkbox "Ẩn biểu cảm" (`data-testid="emote-mute"`). Mobile: grid of 4x2, buttons at least 44 px.
   - Disabled when `status !== 'open'` (socket not connected), not when paused or finished.
6. Accessibility: one visually hidden `<p role="status" aria-live="polite" className="sr-only" data-testid="emote-live">` in each view, text set to "<tên người>: <emoteLabel>" when an emote is received and cleared after `EMOTE_SHOW_MS` (empty when muted, other than own). The turn banner keeps its existing `aria-live="polite"`; the emote region is separate so one never swallows the other. `@media (prefers-reduced-motion: reduce)` removes the pop/fade animation (keep the bubble, drop the keyframes).
7. Sound (depends on PR #16): in `sound.ts` add
   ```ts
   /** A soft two-note "pop" for another player's emote; silent when effects are off. */
   playEmote(): void {
     const ctx = this.effectsContext();
     if (!ctx) return;
     const t = ctx.currentTime;
     this.bell(t, midiToHz(84), 0.1, 0.1);
     this.bell(t + 0.07, midiToHz(88), 0.1, 0.1);
   }
   ```
   (reuse `bell`; volumes quieter than `playTurn`). Own emotes make no sound, so sender spam cannot be loud. If #16 is not yet merged, ship phase 2 without this step.

## Tests

- `emote-feed.test.ts`: receiving replaces the same seat's emote and keeps others; two identical ids in a row get different `n`; `isShown` boundaries at 0, 2999, 3000 ms; unknown seat keys are harmless.
- `emote-settings` test (node env, so the store takes an injectable storage or checks `typeof localStorage`): default false; persisted `'1'` -> true.
- No React rendering tests exist in this repo (`web/**/*.test.ts` are pure), so UI behaviour is covered by e2e in phase 3.

## Validation

`npm run typecheck`, `npm test`; manual: two tabs, send each emote, mute one tab, reduce motion in OS settings, VoiceOver/NVDA reads the live region once.

## Risks

- Bubble overlapping the HUD or the dice at narrow widths: `max-width` plus `text-overflow: ellipsis`; verify at 360 px width.
- The HUD top row feeds camera insets via `hud.topRef`; an absolutely positioned bubble does not change layout height, so the camera framing does not jump (verify, since the insets are measured).
- Re-render churn: `emotes` state updates only on emote receipt and expiry timers are local to `EmoteBubble`, so `MatchView`'s frame-sensitive state is not re-created.

## Rollback

Revert the commit; no persisted client state other than the `ca_emotes_muted` key, which becomes unused.
