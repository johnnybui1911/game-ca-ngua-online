# Phase 1: contract and server relay

## Context

The room socket flows `RoomDO.handleMessage` (bucket, size cap, session check) -> `parseClientMessage` -> `handle` (seat check, then the switch) in `worker/rooms/room-do.ts`. State changes go through `commit`, which bumps `seq`, writes `room` to storage and broadcasts a `state`. An emote changes no room state, so it takes a separate path: validate, spend a budget, send to open sockets, nothing else.

## Requirements

- Fixed catalogue in `shared/`, ids on the wire.
- The server validates the id, requires a seat, applies a per-user budget distinct from `SOCKET_BURST` and `hostBudget`, and relays `{ t: 'emote', seat, id }` to every open socket of the room (sender included).
- No storage write, no `seq` change, no lobby push, no alarm change, no `connected`/`disconnectedSince` mutation.
- A reconnecting socket receives only the usual first `state`; there is no replay.

## Files to change

- `shared/emotes.ts` (new): catalogue and guard.
- `shared/emotes.test.ts` (new).
- `shared/protocol.ts`: message variants.
- `worker/rooms/constants.ts`: budget constants.
- `worker/rooms/room-do.ts`: `parseClientMessage`, `handle`, one field.
- `worker/rooms/emote-budget.test.ts` (new).

## Steps

1. `shared/emotes.ts`:
   ```ts
   export const EMOTES = [
     { id: 'taunt',   emoji: '😈', text: 'Đá nè!' },
     { id: 'mercy',   emoji: '🙏', text: 'Tha cho em' },
     { id: 'six',     emoji: '🎲', text: 'Ra 6 đi!' },
     { id: 'nice',    emoji: '👏', text: 'Hay quá' },
     { id: 'laugh',   emoji: '😂', text: '' },
     { id: 'hurry',   emoji: '⏳', text: 'Nhanh lên' },
     { id: 'sorry',   emoji: '😅', text: 'Xin lỗi nha' },
     { id: 'unlucky', emoji: '😭', text: 'Xui quá' },
   ] as const;
   export type EmoteId = (typeof EMOTES)[number]['id'];
   export const EMOTE_IDS: readonly string[] = EMOTES.map((e) => e.id);
   export function isEmoteId(v: unknown): v is EmoteId { return typeof v === 'string' && EMOTE_IDS.includes(v); }
   export function emoteLabel(id: EmoteId): string  // `${emoji} ${text}`.trim()
   ```
   The server imports only `isEmoteId`; the text lives here so the client and tests share one catalogue. Changing copy never changes ids.
2. `shared/protocol.ts`:
   - `RoomClientMessage`: `/** Any seated player, any room status: show a preset emote to everyone in the room. Not stored. */ | { t: 'emote'; id: EmoteId }`.
   - `RoomServerMessage`: `/** Relayed emote; `seat` indexes `RoomSnapshot.seats`. Never part of a snapshot and never replayed on reconnect. */ | { t: 'emote'; seat: number; id: EmoteId }`.
3. `worker/rooms/constants.ts`:
   ```ts
   /** Emotes are broadcast only: a burst, then one every 2 s, per user across sockets and reconnects. */
   export const EMOTE_BURST = 3;
   export const EMOTE_REFILL_PER_SEC = 0.5;
   ```
4. `room-do.ts`:
   - `parseClientMessage`: `case 'emote': if (!isEmoteId(msg.id)) throw new RoomError('bad_emote', 'Biểu cảm không hợp lệ.'); return { t: 'emote', id: msg.id };`
   - Field: `private readonly emoteBudget = new KeyedTokenBuckets(EMOTE_BURST, EMOTE_REFILL_PER_SEC);` with a comment that it is in memory like `hostBudget`.
   - `handle`: it already throws `not_seated` before the switch. Add
     ```ts
     case 'emote': {
       if (!this.emoteBudget.take(user.userId, now)) return; // dropped silently, not an error
       const payload = JSON.stringify({ t: 'emote', seat: seatIndexOfUser(room, user.userId), id: msg.id } satisfies RoomServerMessage);
       for (const ws of this.openSockets()) { try { ws.send(payload); } catch { /* closing */ } }
       return;
     }
     ```
     It must not call `commit`, `persistAndSchedule`, `pushLobby` or touch `room`. (The `handle` prologue computes nothing that writes.) Keep this branch before any `needHostBudget` helper use.
   - Order check: the emote message still passes the socket `TokenBucket`, the 1024-byte cap and `SessionGuard.hasEnded` in `handleMessage`; the emote budget is stricter than the socket bucket, so the socket bucket stays the flood-to-close backstop (a client ignoring the budget at more than 50/s is still closed with `CLOSE_RATE_LIMITED`).
5. `KeyedTokenBuckets` never evicts keys; keys are user ids of people who sat in this room, at most a handful per room and the DO is deleted when the room closes (`closeRoom` clears the in-memory room; the map dies with the DO instance). No eviction needed.

## Protocol shapes

```json
{ "t": "emote", "id": "taunt" }                  // client -> server
{ "t": "emote", "seat": 1, "id": "taunt" }       // server -> every open socket
{ "t": "error", "code": "bad_emote", "message": "Biểu cảm không hợp lệ." }
```
`not_seated` and `rate_limited` reuse existing codes. Over-budget emotes get no reply.

## Tests (vitest)

- `shared/emotes.test.ts`: ids are unique, non-empty, `[a-z]+`; `isEmoteId` accepts every catalogue id and rejects `''`, `'TAUNT'`, `'__proto__'`, `'😈'`, numbers, `null`; every `emoji` is non-empty; no `text` over 20 chars (fits the bubble).
- `worker/rooms/emote-budget.test.ts` with `KeyedTokenBuckets(EMOTE_BURST, EMOTE_REFILL_PER_SEC)`: 3 accepted at t=0 and the 4th refused; one more accepted at t=2000 and none at t=2001; separate users have separate budgets; the same key from a second "socket" shares the budget (constructed by calling with the same user id). Also assert `EMOTE_REFILL_PER_SEC < SOCKET_REFILL_PER_SEC` and `EMOTE_BURST < SOCKET_BURST` so the emote budget is always the tighter one.
- `parseClientMessage` is not exported today and `RoomDO` has no unit harness (the room tests are pure helpers in `room-state.test.ts`). Do not add one; the relay is covered by e2e in phase 3. Do not export `parseClientMessage` only for tests.

## Validation

`npm run typecheck`, `npm test` (the narrow files first). Grep check in review: the `emote` case in `handle` contains no `commit(`, `persistAndSchedule`, `storage` or `seq`.

## Risks

- A deploy-time skew: an old client tab receiving `{t:'emote'}` would hit `msg.code in FAILURE_TEXT` with `code` undefined and throw inside its message handler (it does not close the socket). Only new clients send emotes, and old tabs reload on the next visit; accepted. Phase 2 removes the hazard for new clients.
- DO hibernation drops `emoteBudget`; a hibernated room has no recent traffic, so the budget resets harmlessly.
- Incoming WebSocket messages are billed as DO requests at a ratio [INFERENCE: 20 messages to 1 request on Cloudflare's current pricing, verify before launch]; with at most 0.5 emotes/s sustained per user and 4 users per room this is negligible next to dice and move traffic.

## Rollback

Revert the commit: the message is additive, nothing is persisted, so no data migration. Clients that stay open ignore an unknown server message after phase 2's guard.
