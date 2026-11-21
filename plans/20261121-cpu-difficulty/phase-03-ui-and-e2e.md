# Phase 3: waiting-room control, labels, dev harness, e2e, docs

## Context

- `web/src/room/WaitingView.tsx`: seat list with `data-testid` `seat-${i}`, `seat-${i}-name`, `seat-${i}-state` (shows "Máy" for a CPU), host buttons `add-cpu-${i}` / `remove-cpu-${i}`, `send(msg: RoomClientMessage)` prop, `actionError` display. `isHost` is already computed.
- `web/src/room/MatchView.tsx`: `seatName(seat)` returns the CPU `name`; the HUD item renders `<span className="badge">CPU</span>` for CPU occupants; the room snapshot is available there.
- `web/src/room/colors.ts` holds colour names/vars (pattern for a small label map). `web/src/room/room.css` styles `.seat`, `.badge`, `.btn`.
- `web/src/scene/dev/DevApp.tsx` plays CPU-vs-CPU games with `chooseCpuMove(g)` and builds a `RoomSnapshot` in `snapshot()`.
- e2e: `e2e/helpers/rooms.ts` (`newPlayer`, room creation, socket helpers), `e2e/room-game.spec.ts` (raw-socket `expectRejected` pattern for server rejections), `e2e/room-flow.spec.ts` (add CPUs via `add-cpu-N`).

## Requirements

- Host: a segmented control "Độ khó máy" with three options. Non-host: read-only line "Độ khó máy: Khó".
- Helper text under the control: "Áp dụng cho mọi máy trong phòng, kể cả máy chơi thay người rời phòng."
- Option labels: `easy` -> "Dễ", `normal` -> "Thường", `hard` -> "Khó".
- Seat state for a CPU: "Máy · Khó". HUD badge for a CPU: "CPU · Khó". CPU names stay "Máy 1" etc. (existing tests rely on names).
- Accessible: `role="radiogroup"` with `aria-label="Độ khó máy"`, each option `role="radio"` with `aria-checked`; keyboard operable (they are buttons); disabled look for non-hosts is plain text, not disabled buttons.
- The control sends `{ t: 'cpuLevel', level }`; the UI shows the level from `room.cpuLevel` only (server-authoritative, no optimistic state), with `room.cpuLevel ?? 'normal'` through one helper.

## Files to change (on top of PR #16)

- New `web/src/room/cpu-levels.ts`: `CPU_LEVEL_LABELS: Record<CpuLevel, string>`, `cpuLevelOf(room: RoomSnapshot): CpuLevel`.
- `web/src/room/WaitingView.tsx`: new block (host radiogroup / non-host text) placed above `ul.seat-list`; testids `cpu-level` (container), `cpu-level-easy`, `cpu-level-normal`, `cpu-level-hard` (host buttons, `aria-checked`), `cpu-level-label` (non-host text); CPU seat state line `Máy · {label}` (testid `seat-${i}-state` retained). Leave PR #16's horse-names markup untouched.
- `web/src/room/MatchView.tsx`: badge text `CPU · {label}` for `occ.kind === 'cpu'`; no other change.
- `web/src/room/room.css`: a few rules for the segmented control, reusing the existing button and colour variables.
- `web/src/scene/dev/DevApp.tsx`: `snapshot()` gets `cpuLevel`; read `?level=easy|normal|hard` from `location.search` (validated with `isCpuLevel`) and pass it to `chooseCpuMove(g, level)`; default unchanged. Lets reviewers watch Hard vs Hard at `scene-dev.html?level=hard`.
- New `e2e/room-cpu-level.spec.ts`.
- `README.md`: a short Vietnamese section "Độ khó máy" (what the three levels do, host-only, applies to takeover; bench command `CPU_BENCH=1 npx vitest run shared/game/cpu-bench.test.ts`).

## Steps

1. Labels module and WaitingView control (host and non-host variants).
2. HUD badge and seat state labels.
3. Dev harness parameter and snapshot field.
4. e2e spec and README.
5. Manual check in a browser with the dev server (orchestrator, not the planner; ports 5173/5199 are shared): open a room as host, switch levels, confirm another browser sees the change within a snapshot, start a match with a Hard CPU, confirm the badge.

## Tests (Playwright, `e2e/room-cpu-level.spec.ts`)

1. Host creates a room, a second player joins: host sees three radio options with Thường checked; guest sees `cpu-level-label` "Thường" and no buttons.
2. Host clicks "Khó": host and guest both show Khó (guest without reload); reload the guest page: still Khó; host adds a CPU: seat state reads "Máy · Khó".
3. Raw-socket rejections (same helper pattern as `room-game.spec.ts`): non-host `cpuLevel` -> `not_host`; level `'ultra'` -> `bad_message`; after `start`, host `cpuLevel` -> `bad_state`.
4. Solo room with one CPU at Khó: start a match, HUD item of the CPU shows "CPU · Khó"; the match advances (the CPU plays its turns; use the existing room-game flow helpers). Playing to the end is not required.
5. Rematch keeps the level: finish a short game only if the existing helpers already do (see `room-game.spec.ts`); otherwise cover persistence by reload in test 2 and by the unit tests in phase 2.
6. A leave-takeover test: two humans plus level Khó, one leaves mid-game: HUD shows a CPU badge "CPU · Khó" for that colour.

Existing specs keep passing unchanged (CPU names and `add-cpu-N` testids are intact).

## Validation

`npm run typecheck`, `npm test`, `npm run build`, `npm run e2e` (orchestrator runs these once after all phases).

## Risks

- Text assertions in existing specs on the CPU badge (`CPU`) or seat state ("Máy"): grep `e2e/**` for these strings before changing; adjust assertions to `toContainText` where needed.
- Mobile width: the segmented control must wrap; check at the 390 px viewport used elsewhere in the e2e specs.
- Layout collisions with PR #16 additions in `WaitingView.tsx` (sound button, rename button): place the control in its own block.

## Rollback

Revert the commit; the server field remains and is ignored by the UI.
