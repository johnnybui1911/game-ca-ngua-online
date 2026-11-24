# Phase 1: server takeover transition

## Context

See plan "Today". The DO stores the whole `RoomState` under one key; `admit` runs synchronously inside `fetch` before the socket is accepted; `commit` re-derives connections, persists, broadcasts and re-arms the alarm.

## Files

- `shared/protocol.ts`: `RoomSummary.takeoverSeats?: number` ("CPU seats a person can take over now: playing rooms only; absent in entries listed before it existed: 0").
- `worker/rooms/room-state.ts`
  - `StoredSeat.leftBy?: string`; `setOccupant` deletes it; `clearMisses` also forgets it (doc updated).
  - `takeoverSeatIndex(state, userId): number`: -1 unless `status === 'playing'` with a game; the CPU seat with `leftBy === userId` if any; else CPU seats whose colour is in `game.colors`, ordered from the colour after `game.turn` round to `game.turn` itself.
  - `takeOverCpuSeat(state, user, connected, now, timings): number`: picks with `takeoverSeatIndex`, seats `{ kind: 'human', user }` via `setOccupant`; when that seat is on turn re-plans with `planTurn(state, connected ∪ {user.id}, from, timings)` where `from` is `pausedAt` while host-paused, `noHumanConnectedSince` while nobody is connected (so `reconcileConnections` shifting by the unattended stretch lands at now + full turn), else `now`. Returns the seat or -1.
  - `toSummary`: `takeoverSeats` = CPU seats in a playing room, else 0.
- `worker/rooms/room-do.ts`
  - `admit`: seated → null (unchanged); waiting → as today; else `takeOverCpuSeat(...)` with `this.connectedUsers()`; -1 → `RoomError('game_in_progress', 'Ván đấu đang diễn ra và không còn chỗ máy để vào thay.')`. Needs the room timings (`this.roomTimings(room)`).
  - `leave`: after `setOccupant(seat, cpu)` during a game, `seat.leftBy = userId`.
- `worker/rooms/room-state.test.ts`, `worker/rooms/lobby-rooms.test.ts`: tests below.

## Tests

- Off turn: seat 1 CPU, seat 0 human on turn → takeover seats 1, `dueAt`/`actionDueAt` unchanged, game unchanged.
- On turn: CPU seat on turn with CPU `dueAt` → after takeover `actionDueAt = now + turnMs`, `playDueAction` at the old CPU `dueAt` is not due (state `dueAt > old`), snapshot `turnDeadline` set.
- Order: 4 seats, turn on colour 1, CPUs at colours 0 and 3 → picks colour 3; CPU on turn only → picks it.
- Paused: plans from `pausedAt`; after `resumeGame` the human has the full turn.
- Unattended (`noHumanConnectedSince` set): after `reconcileConnections` with the joiner connected, `actionDueAt = now + turnMs`.
- No CPU seat / waiting / finished → -1, state untouched.
- Former player: leaves (simulate `setOccupant` + `leftBy`), comes back → their seat even if another CPU seat comes first in order; `leftBy` cleared after.
- Race: two users take over a room with one CPU seat in sequence → first gets it, second -1.
- Summary: `takeoverSeats` counts CPU seats only while playing; waiting room with CPU → 0; `publicRoomList` lists a public playing room with its `takeoverSeats` and never a private one.

## Risk / rollback

Additive optional fields; reverting the branch leaves stored `leftBy`/`takeoverSeats` ignored by old code.
