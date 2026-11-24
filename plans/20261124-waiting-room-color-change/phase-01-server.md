# Phase 1: server

- `shared/protocol.ts`: add `{ t: 'color'; color: Color }` to `RoomClientMessage`.
- `worker/rooms/room-state.ts`: `changeColor(state, userId, color): string | null` returns an error code (`bad_state`, `bad_color`, `color_taken`, `not_seated`) or null after moving the seat contents. Pure, unit-tested.
- `worker/rooms/room-do.ts`: parse (`int` check, colour in 0..3), `colorBudget`, `case 'color'` maps the code to a Vietnamese `RoomError`, `commit([])` only on a real change.
- `worker/rooms/room-state.test.ts`: free ok (names and host kept), human-taken, CPU-taken, playing, finished, invalid colour, same colour no-op, two requests for one colour.
