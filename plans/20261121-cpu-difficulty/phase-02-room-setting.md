# Phase 2: room-level setting, protocol, DO handling, analytics

## Context

- Room state is one object persisted under `STORAGE_KEY = 'room'` (`worker/rooms/room-do.ts`), loaded in the constructor via `ctx.storage.get<RoomState>`. Rooms created before this change have no `cpuLevel`.
- Auto-play happens in `RoomDO.alarm()` (`chooseCpuMove(game)`), for CPU occupants and for humans whose clock or grace ran out; `leave()` converts a leaver's seat to a CPU during a game.
- Host-only state-changing messages (`addCpu`, `removeCpu`, `rematch`) go through `needHostBudget()` (`HOST_ACTION_BURST`, `HOST_ACTION_REFILL_PER_SEC` in `worker/rooms/constants.ts`); `start` uses `needHost()`.
- `parseClientMessage` in `room-do.ts` validates every client message shape and throws `RoomError('bad_message', ...)`.
- Funnel: `ServerEvent` union in `shared/analytics.ts`, `countEvent` in `worker/analytics/count.ts` writes `daily_events(day, event, source, n)`; `event` is a free `TEXT` column (`migrations/0004_daily_events.sql`), so new event names need no migration.

## Requirements

- `RoomSnapshot.cpuLevel: CpuLevel` always present (server fills the default).
- Host sets it only while `waiting`; rejected otherwise.
- Absent in persisted state = `normal`; an unrecognised stored value is also read as `normal`.
- No per-move writes; one `commit` per accepted change.

## Files to change (on top of PR #16)

- `shared/protocol.ts`
  - `import type { CpuLevel } from './game/cpu-level';`
  - `RoomSnapshot`: add `/** CPU difficulty of the whole room; changed by the host while waiting. */ cpuLevel: CpuLevel;`
  - `RoomClientMessage`: add `/** Host only, while waiting: how well every CPU of the room plays. */ | { t: 'cpuLevel'; level: CpuLevel }`.
- `worker/rooms/room-state.ts`
  - `RoomState`: `cpuLevel?: CpuLevel` ("absent in rooms stored before the setting existed: Thường"), next to `pausedAt?`.
  - `levelOf(state): CpuLevel` returns `isCpuLevel(state.cpuLevel) ? state.cpuLevel : DEFAULT_CPU_LEVEL`.
  - `levelForOccupant(state, occupant: StoredOccupant | null): CpuLevel`: `occupant?.kind === 'cpu' ? levelOf(state) : DEFAULT_CPU_LEVEL` (stall prevention for a seated human uses Normal; see plan default 2).
  - `parseCpuLevel(raw: unknown): CpuLevel | null` for the message parser (unit-testable, like `cleanHorseNames`).
  - `toSnapshot`: `cpuLevel: levelOf(state)`.
- `worker/rooms/room-do.ts`
  - `parseClientMessage`: `case 'cpuLevel': { const level = parseCpuLevel(msg.level); if (!level) throw new RoomError('bad_message', 'Độ khó không hợp lệ.'); return { t: 'cpuLevel', level }; }`.
  - `handle`: `case 'cpuLevel'`: `needHostBudget(); if (room.status !== 'waiting') throw new RoomError('bad_state', 'Chỉ đổi độ khó khi đang chờ.'); if (levelOf(room) === msg.level) return; room.cpuLevel = msg.level; await this.commit([]);`
  - `alarm()`: compute `const seat = room.seats[currentSeatIndex(room)]?.occupant ?? null;` before the move and call `chooseCpuMove(game, levelForOccupant(room, seat))`. No `rand` argument (default `Math.random`; the alarm may be retried by the platform, a different random Easy move after a retry is harmless because the game state is only committed once).
  - `start` (after `commit`): if any seat holds a CPU, `this.count(\`cpu_match_${levelOf(room)}\`)` (widen `count`'s parameter type to the `ServerEvent` members it uses).
  - `create()` unchanged (the field stays absent until the host changes it, so new rooms and old rooms are indistinguishable); `leave()` unchanged (`setOccupant(seat, { kind: 'cpu', name })` from PR #16; the level is resolved at play time from the room, so nothing to carry).
  - `rematch` unchanged: it keeps `cpuLevel`.
- `shared/analytics.ts`: add `'cpu_match_easy' | 'cpu_match_normal' | 'cpu_match_hard'` to `ServerEvent`.
- `README.md`: funnel paragraph lists the three events.

## Steps

1. Protocol additions and `room-state.ts` helpers with tests.
2. DO parse/handle/alarm/start changes.
3. Update `web`'s type consumers only as far as the build requires (`DevApp.tsx` `snapshot()` gains `cpuLevel: 'normal'`); UI work is phase 3.

## Protocol / message shapes

```ts
// client -> server (host, waiting only)
{ t: 'cpuLevel', level: 'easy' | 'normal' | 'hard' }
// server -> client: the usual { t: 'state', room, events: [], serverNow } with room.cpuLevel set.
// errors: not_host (non-host), too_fast (budget), bad_state (not waiting), bad_message (unknown level)
```

No HTTP change: `CreateRoomRequest` keeps its shape; `RoomSummary` (lobby list) is unchanged.

## DO storage compatibility

- The whole `RoomState` object is stored; a room written by the old code deserialises with `cpuLevel === undefined`, read through `levelOf` as `normal`. No migration pass, no version key, no rewrite on load.
- First write of the field happens only when the host picks a level; a room whose host never touches it never stores the field.
- Rolling back the worker: old code ignores the extra property on the stored object and its `toSnapshot` builds snapshots field by field, so nothing breaks (the stored property persists harmlessly until the room closes).
- Clients: a stale browser tab without the new code ignores `room.cpuLevel`; a new client reading an old server (not expected: the Worker serves both) falls back with `room.cpuLevel ?? 'normal'` in one UI helper.
- DO write volume: +1 storage write per level change (rate-limited by `hostBudget`), no per-move change; the `count` adds one D1 write per match with a CPU (not DO storage).

## Tests

- `worker/rooms/room-state.test.ts` (vitest): `levelOf` for absent / each valid / garbage (`'ultra'`, `7`, `null`); `levelForOccupant` for cpu vs human vs null; `parseCpuLevel` accepts the three strings only; `toSnapshot(room())` has `cpuLevel: 'normal'` and reflects a set value; a room object without the field round-trips through `JSON.parse(JSON.stringify(...))` and still snapshots as `normal`.
- A pure-logic test for the alarm path is not possible without a DO harness (none exists in `worker/rooms`); the DO behaviour is covered by e2e (phase 3). Keep the `alarm()` change to the argument expression so the diff is reviewable by inspection.

## Validation

`npm run typecheck`, `npm test`; e2e in phase 3 exercises the messages.

## Risks

- Merge conflicts in `room-do.ts`/`protocol.ts` with PR #16: edits are additive cases in the same switch; rebase after #16 lands.
- Someone later adds per-seat levels: the room-level field stays as the default for newly added CPUs; documented in the plan's option.
- `count()` type widening must not allow arbitrary strings.

## Rollback

Revert the commit. Stored `cpuLevel` values are ignored by the previous code.
