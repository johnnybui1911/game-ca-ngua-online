# Phase 4: 3D scene

## Goal

The 3D board the match is played on: board, sixteen horses, a die, and the animations that turn server events into something pleasant to watch, built with three.js through `@react-three/fiber` (and `@react-three/drei` where useful). No purchased or downloaded models or textures: every shape is procedural geometry and every texture is generated in code.

## Read first

- `shared/game/types.ts`: board model (56-cell track, colour offsets through `trackCell`, home steps), `GameState`, `GameEvent`.
- `shared/game/engine.ts`, `shared/game/cpu.ts`: the real rules, used by your dev harness.
- `shared/protocol.ts`: `RoomSnapshot`, `Seat`, `SEAT_COLORS`.
- `web/src/scene/props.ts`: the `GameSceneProps` contract. Read-only.
- `web/src/styles/tokens.css`: colour tokens; the four horse colours on the board must match them.

## Files you own

- `web/src/scene/**` except `props.ts`. `web/src/scene/GameScene.tsx` currently holds an empty mount point; replace its body, keep the default export and the `data-testid="game-scene"` on the outermost element.
- `scene-dev.html` at the repo root and `web/src/scene/dev/**`: a development-only harness page (never part of `vite build`, whose only input stays `index.html`).

Touch nothing else. Do not add routes to the app.

## Requirements

- Board: the classic cross-shaped cờ cá ngựa board. Four coloured stables in the corners holding four horses each, a 56-cell track, four home columns of six numbered steps leading to the centre. Suggested track layout: each arm is three lanes wide; the middle lane is the home column, the cell at the tip of the middle lane is that colour's gate (progress 55), the colour's entry cell (progress 0) is the next cell in travel direction. Any layout is acceptable when these hold: 56 distinct cell positions forming one closed loop with uniform spacing between consecutive cells, colour c entering at track cell `c*14`, each gate adjacent to step 1 of its own home column, entry cells and gates visually marked in their colour.
- Put the mapping from the abstract model to 3D coordinates in one pure module (`web/src/scene/layout.ts`) with vitest tests for the invariants above (file under `web/src/scene/`, name ending `.test.ts`).
- Horses: a recognisable horse (knight-like) piece per colour built from procedural geometry, four per colour, distinguishable by colour for colour-blind players through a second cue (for example a small number or pattern on the base).
- Die: a 3D die with pips that tumbles and settles showing the rolled value on a `rolled` event, near the stable of the colour that rolled.
- Animation, driven by `events` when `room.seq` changes:
  - Time budget: the server sends a CPU action every 0.7 s and a full game has well over a thousand actions, so one batch (a die tumble, or a move including its kick) must finish within 0.6 s whatever the distance: scale hop duration to the number of cells.
  - `moved`: the horse hops cell by cell along its real path (track cells, then home steps; leaving the stable is one hop to the entry cell).
  - `kicked`: after the mover lands, the kicked horse flies back to a free slot in its stable.
  - `turn`: the active colour's stable is clearly highlighted.
  - `won`: a short celebration around the winner's home column.
  - Batches queue: a new batch arriving mid-animation plays after the current one; if more than two batches are waiting, snap to the latest state instead of falling behind. After the queue drains the scene shows exactly `room.game`. Mounting with an empty batch shows `room.game` immediately.
- Picking: when `myColor === room.game.turn` and the phase is `move`, the horses in `legalHorses` pulse or glow and can be tapped or clicked; that calls `onPickHorse(index)`. Nothing else is clickable. Tap targets must be comfortable on a phone (enlarge the hit area beyond the visible mesh).
- Camera: starts looking at the board from behind `myColor`'s stable (from behind colour 0 when null), orbit and zoom with limits so the board cannot be lost, the whole board visible at start in both portrait phone and landscape desktop aspect ratios.
- Performance: cap device pixel ratio at 2, keep shadows cheap, share geometries and materials, no per-frame allocations in animation loops, pause the render loop when the tab is hidden. Dispose what you create on unmount.
- The canvas fills its parent; the match page controls the size.
- If WebGL is unavailable, render a Vietnamese message inside the mount point instead of throwing.

## Dev harness

`scene-dev.html` mounts `GameScene` and plays a local game with the real engine and CPU on every seat (seeded dice, adjustable speed, a toggle that lets you play colour 0 yourself, a 2/3/4 player switch). Run it with `npx vite --port 5174 --strictPort` and open `http://127.0.0.1:5174/scene-dev.html`. Port 5173 belongs to another piece; never use it.

## Verification

- Look at the result in a real browser, desktop size and a 390x844 phone viewport: take screenshots of the opening position, a mid-game position and the win celebration, and check them yourself against the requirements (readable board, horses not clipping into cells, die value legible, highlight visible). Fix what looks wrong. Name the screenshot paths in your report (store them outside the repo, under `/tmp/ca-ngua-scene/`).
- Play a full game in the harness in "play colour 0 yourself" mode far enough to prove picking works, and let one all-CPU game run to the win at high speed with no console errors.

## Done means

`npm run typecheck`, `npx vitest run` and `npm run build` pass; the checks above are done; port 5174 is free when you finish.
