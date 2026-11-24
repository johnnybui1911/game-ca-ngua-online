---
title: Change colour in the waiting room
status: accepted
---

# Change colour in the waiting room

## Outcome

While a room is waiting, the host and every player can move themselves to another colour, as long as it is free (no person and no CPU on it). Nothing changes once the game starts.

## Today (grounded in code)

- A room has one `StoredSeat` per colour (`SEAT_COLORS[n]` in `shared/protocol.ts`: 2 seats = đỏ + vàng, 3 = đỏ + xanh dương + vàng, 4 = all four). A seat's `color` never changes; the colour of a person is the colour of the seat they sit in.
- The game starts with `createGame(colours of occupied seats, in seat order)`, so turn order follows colour order, never join order.
- Host is `RoomState.hostId` (a user id), not a seat: moving seats keeps host status and the crown.
- Horse names (`horseNames`) and `misses` live on the seat and are dropped by `setOccupant` when the occupant changes.
- Host actions use `needHostBudget`; horse renaming (any player) uses `nameBudget` (`KeyedTokenBuckets`, per user).

## Decisions

1. **Free colour = empty seat.** The pickable colours are those of the room's seats (a 2-seat room only offers đỏ and vàng). Not widening the colour set keeps `SEAT_COLORS` and board layout untouched.
2. **Move the seat contents.** The server moves the occupant (the person), their `horseNames` and `misses` from the old seat to the empty target seat and empties the old one. Seat colours stay fixed, so turn order after start is consistent (ascending colour).
3. **New message `{ t: 'color'; color: Color }`**, any seated player, only while `status === 'waiting'`. Rejections: `bad_state` (not waiting), `bad_color` (not a colour of this room), `color_taken` (held by a person or a CPU). Choosing your own colour is a silent no-op.
4. **Concurrency:** the Durable Object handles messages one at a time; the second request for the same colour finds the seat taken and gets `color_taken`. Exactly one wins.
5. **Budget:** its own `colorBudget` (`KeyedTokenBuckets`, same burst and refill as host actions), per user; each accepted change is a room write, an alarm and a lobby push.
6. **No new snapshot field, no migration:** the client derives who holds which colour from `seats`. Stored rooms are unaffected.
7. **UI:** in the player's own seat row, a row of colour swatches (`ColorPicker.tsx`, `role="radiogroup"`); taken colours are disabled and say who holds them. Touch-size buttons, wraps under the name on phones. Edit to `WaitingView.tsx` is one import and one line to keep Johnny's merge easy.
8. Analytics event not added (not requested).

## Phases

- [phase-01-server.md](phase-01-server.md): protocol, state transition, DO handling, unit tests.
- [phase-02-ui-and-e2e.md](phase-02-ui-and-e2e.md): picker component, wiring, e2e.

## Acceptance

1. Free colour: sender's occupant, names and `misses` move; old seat empty; host stays host.
2. Human-held, CPU-held, out-of-room colour, and playing/finished status are rejected with the state unchanged.
3. Other clients get the new snapshot; taken swatches are disabled in the picker.
4. After a change the game starts with the new colour and the horses carry their names.
5. `npm run typecheck`, `npm test`, `npm run build` pass; new e2e passes.
