---
title: Join a game in progress by taking over a CPU seat
status: implemented (revision 2)
---

# Join a game in progress by taking over a CPU seat

## Outcome

While a game is playing, a person who is not seated can still enter the room when at least one seat is played by the machine: they take that seat over as it is (colour, horses, positions) and play on from there. They get in through the room's invite link or code (any room) or, for a public room, from the lobby list, which now shows such rooms as joinable ("Đang chơi · còn chỗ máy"). Everyone already in the room sees a notice that a person took the CPU's place. Rooms without a CPU seat behave as today.

## Today (grounded in code)

- `RoomDO.fetch` (`worker/rooms/room-do.ts`) calls `admit(room, user)` before accepting the socket: a seated user reconnects; otherwise any status other than `waiting` refuses with `game_in_progress`, and a full waiting room with `room_full`. `admit` is synchronous and runs before the first `await` of `fetch`, so two upgrades can never interleave inside it.
- `leave()` during a game turns the seat into `{ kind: 'cpu', name: nextCpuName(room) }` (via `setOccupant`, which also drops horse names and missed turns) and, when that seat is on turn, pulls `dueAt` in to a CPU pause. Nothing records who sat there.
- CPU play happens only in `alarm()` → `playDueAction` (`worker/rooms/room-state.ts`), which reads the seat on turn, computes the roll and move and mutates the state synchronously, then commits. Everything is re-derived from persisted state (`dueAt`, `actionDueAt`), so a late alarm does the right thing. The only `await` before it in `alarm()` is the D1 session check (`endExpiredSockets`); the state is read after it.
- `planTurn` sets `dueAt` and the fixed `actionDueAt` for the seat on turn; `reconcileConnections` shifts both by the length of a stretch with nobody connected (`noHumanConnectedSince`), `resumeGame` by the length of a host pause (`pausedAt`). The `back` handler shows the pattern for re-planning a turn while paused: plan from `pausedAt`.
- Turn order is `game.colors` (ascending); `currentSeatIndex` maps `game.turn` to a seat. A colour is in the game exactly when its seat was occupied at `start`; a game ends with the first colour to finish, so no colour "finishes early" while playing.
- Lobby: `toSummary` → `RoomSummary { code, name, hostName, status, seatsTaken, seatsTotal }` is pushed to the lobby DO on every summary change; `publicRoomList` lists public rooms that are not finished, so playing rooms are already listed. `LobbyPage` disables "Vào" for full or playing rooms and labels them "Đang chơi".
- The invite link (`/r/:code`) and the code form only check that the room exists (`GET /api/rooms/:code`), then open the socket; refusals arrive as socket errors (`useRoomConnection` `FAILURE_TEXT`). The in-game screen (`MatchView`) has no way to copy the invite link; the waiting room does.
- Toasts: `LobbyProvider` renders a global toast stack (`invite-toast`, `lobby-notice`) but exposes only `invite`.

## Constraints

- Server authoritative; the DO's state must stay consistent under concurrent upgrades and a pending alarm.
- Rooms and lobby entries stored before this change keep working with no migration (new fields optional).
- No new runtime dependency, no new storage key, no extra writes beyond the one commit the join already makes.
- Vietnamese copy; keep the repo's style (single quotes, ~120 columns, no reformatting of untouched lines).

## Non-goals

Spectating; choosing which CPU seat to take; a host setting to forbid takeover; taking an empty seat (a colour not in the game); joining a finished room; inviting online players from the in-game screen (the link is enough; online invites stay in the waiting room).

## Acceptance criteria

1. A playing room with at least one CPU seat admits a person who is not seated: the first CPU seat in turn order after the colour on turn (the one on turn last) becomes `{ kind: 'human', user }`; colours, horses, `game`, player list and turn order are unchanged.
2. A person who left this game and whose former seat is still a CPU gets that seat back; if it was taken, they get another CPU seat by rule 1.
3. If the taken seat is on turn, the newcomer gets a fresh full turn clock (`planTurn` from now, or from the frozen moment when paused / unattended); a pending CPU alarm never plays for them afterwards. If it is not on turn, the current clock is untouched.
4. No CPU seat (or room finished) → refused with `game_in_progress` and the text "Ván đấu đang diễn ra và không còn chỗ máy để vào thay." Seated players (connected or not) reconnect exactly as before.
5. Two people racing for the last CPU seat: exactly one is seated, the other is refused (unit test on the pure transition, plus the synchronous `admit` argument above).
6. `RoomSummary.takeoverSeats` (optional; absent reads as 0) counts CPU seats of a playing room. The lobby shows a public playing room with `takeoverSeats > 0` as "Đang chơi · còn chỗ máy" with "Vào" enabled; other rooms display as today. Private rooms are never listed (unchanged).
7. Everyone else in the room sees a toast "<name> đã vào thay <Máy n>". The joiner sees the in-progress board at once, with their colour, turn clock, quick mode, emotes and horse naming working.
8. During a game with a CPU seat, the in-game menu offers "Mời người vào thay máy", which copies the invite link.
9. `npm run typecheck`, `npm test`, `npm run build` green; new unit tests (takeover on/off turn, paused, unattended, no CPU seat, private vs public summary, former player, race) and an e2e spec with two browsers (join via link and via lobby, take the CPU seat, roll on its turn).

## Decisions (taken by the coordinator or as defaults)

1. The joiner inherits the CPU seat as is (colour, horses, positions); the seat becomes `human` with the joiner's identity; player list and turn order unchanged. Horse names reset to defaults (a CPU seat has none; `setOccupant` semantics) and missed turns start at 0.
2. Seat choice is automatic: former seat of a returning leaver first, else the first CPU seat in turn order after the colour on turn, the seat on turn last (so the newcomer rarely lands mid-roll).
3. Safe switch when the CPU is on turn: the takeover is a synchronous state transition inside `admit`, and CPU play is a synchronous transition inside `alarm()` that reads the seat after its only `await`. There is therefore no in-flight CPU action to corrupt; the takeover simply re-plans the turn for a human (`planTurn`), which moves `dueAt` past now, so an alarm already armed for the CPU finds nothing due and re-arms. Simplest correct approach; no alarm cancellation needed (`schedule()` re-arms from state on the commit).
4. A former player is recognised by a new optional `StoredSeat.leftBy` (user id) written by `leave()` during a game and cleared by any later `setOccupant` and by `clearMisses` (start and rematch). Absent in old rooms: no preference, rule 2 applies.
5. Existing seated players (including disconnected ones and humans on autopilot) keep today's reconnect path; takeover applies only to users with no seat.
6. Private rooms: joinable mid-game only by link/code (they were never listed). Public rooms: link/code and lobby.
7. Not joinable when finished (`status === 'finished'`): unchanged refusal. Paused games are joinable; the clock stays frozen until the host resumes.
8. No host setting to forbid takeover (default "allowed"); listed for Johnny in the PR.
9. Notice for others is derived on the client by comparing consecutive snapshots (a seat going from CPU to a human who is not me); no protocol message added. Shown through the global toast stack (`LobbyProvider` gains `notify(text)`).
10. Lobby field `takeoverSeats` is a count (not a boolean) so the label can later say how many; the UI only checks `> 0`.
11. In-game invite: one menu button that copies the link (no share sheet, no online list), shown only while a CPU seat exists and the game is not finished.

## Trade-offs

- Client-derived notice vs. a server event: deriving from snapshots needs no contract change and survives batching (`batches` keeps every snapshot in `seq` order); it fails only if a client misses the snapshot pair (reconnect at that moment), which merely skips a cosmetic toast. A server `GameEvent` would pollute the game event stream the board animates.
- Re-plan on takeover vs. deferring the takeover to a turn boundary: deferring needs a pending-join state persisted across alarms and a socket admitted without a seat; re-planning is one call and keeps the invariant "seat on turn decides who plays".

Better approaches: none — the requested behaviour maps onto the existing synchronous `admit` and the re-derived alarm (evidence above).

## Phases

| # | Phase | Brief |
|---|---|---|
| 1 | Server: takeover transition, `leftBy`, `takeoverSeats`, DO admit, unit tests | [phase-01-server-takeover.md](phase-01-server-takeover.md) |
| 2 | Web: lobby label, refusal text, takeover toast, in-game invite, e2e, README | [phase-02-web-and-e2e.md](phase-02-web-and-e2e.md) |

## Possible conflicts with parallel PRs

- `feat/i18n-english` moves UI strings: this PR adds a few Vietnamese strings in `LobbyPage.tsx`, `MatchView.tsx`, `useRoomConnection.ts`; they need translating there after merge.
- `feat/waiting-room-color-change` touches seats in the waiting room (`room-do.ts` handlers, `room-state.ts`): this PR touches `admit`, `leave`, `setOccupant`, `clearMisses`, `toSummary` only.
- `feat/dice-no-third-bonus`: no overlap.

## Revision 2 (2026-11-24, after Johnny's review)

Johnny changed the product after trying the first version. These decisions replace decisions 2, 6, 8 and 11 above where they differ.

| # | Decision (accepted by Johnny) |
|---|---|
| R1 | Takeover is opt-in per room: a switch "Cho người vào thay máy giữa ván" at creation (`CreateRoomRequest.allowTakeover`, stored `RoomState.allowTakeover`, absent = off). Visibility stays two modes (Công khai / Riêng tư). Rooms without it refuse mid-game entry as before (`game_in_progress`). Not changeable after creation. |
| R2 | A person with no seat is admitted to a running open room **without a seat** and asks for one: they pick a CPU colour (`requestSeat`), the host approves (`approveJoin`) or rejects (`rejectJoin`). One request per colour: a colour someone already asked for cannot be asked for (button disabled, server `bad_seat`); the host sees at most one request per slot. A requester may switch colour or cancel. |
| R3 | Requests lapse after 2 minutes (`JOIN_REQUEST_SECONDS`, alarm wakes at the oldest), and are dropped when the requester has no open socket, the seat stops being a CPU, or the game ends; the requester gets a notice (`join_rejected`, `join_expired`, `join_seat_taken`, `join_ended`). After a rejection the same person waits 30 s (`JOIN_COOLDOWN_MS`, in memory). At most 8 seatless people stay connected (`MAX_WAITING_JOINERS`). |
| R4 | A player who left this game gets their own seat back at once, without approval, while a CPU still plays it. |
| R5 | No CPU seat left in an open room → `no_cpu_seat` refusal. |
| R6 | Host leaving with other people seated (waiting room or game) chooses: hand the host role to a chosen person and leave (`leave { newHost }`), or end the room for everyone (`closeRoom`). A host alone leaves as before; a host who just disconnects keeps the automatic hand-over. |
| R7 | The lobby counts only CPU seats nobody has asked for (`takeoverSeats`), and only for open rooms. |

Seatless sockets receive the room snapshot (the join screen needs the CPU seats and requests); they cannot send game messages (`not_seated`). Approval reuses `takeOverCpuSeat`, so the on-turn safety argument (decision 3) is unchanged; one-request-per-colour makes the race argument trivial: the second `requestSeat` for a colour is refused synchronously.

Also fixed: `e2e/room-presence.spec.ts` still expected the old "CPU" badge text renamed to "Máy" on `main` (9e93270).
