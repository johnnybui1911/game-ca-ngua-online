# Home page demo match: evidence

Captured from the app on a local dev server in headless Chromium on a real GPU (ANGLE Metal, quality tier
`high`), with the page clock paused and stepped, so every frame is an exact moment. Each frame is labelled
with its time.

| File | Viewport | Shows |
|---|---|---|
| `home-demo-1440x900.png` | 1440×900 | Home page: orbit only (1.5 s, 2.9 s), the deal at 3 s (horses hop out), play, then the first kick of seed 28 with its close-up (12.8–13.9 s) |
| `home-demo-390x844.png` | 390×844 | The same moments on a phone (the close-up leans in half as far) |
| `panel-slowdown-1440x900.png` | 1440×900 | "Chơi ngay" pressed: the name panel is open, the board is dimmed and framed beside it, the demo goes on at half pace, 0.8 s apart |
| `panel-slowdown-390x844.png` | 390×844 | The same with the panel as a sheet |
| `match-transition-1440x900.png` | 1440×900 | Waiting room with the demo behind it, then the host starts: the panel leaves, the demo horses fly to their stables (staggered, done at about 1 s), the real two-player game takes the board and the camera flies to the seat |
| `match-transition-390x844.png` | 390×844 | The same on a phone |

## Pace, measured

The capture recorded the wait the demo asked for before each step (20 s of page time each):

| Screen | Wait per step (roll + move) | Per action |
|---|---|---|
| Home page | 800 ms | 400 ms, 1.75× the 700 ms of a normal match |
| Panel open | 1600 ms | 800 ms, half the demo pace |

## Timeline

| Moment | Seconds |
|---|---|
| Orbit only after the board is ready, and again after a match gives the board back | 3 |
| One animated segment (a roll or a move) | 0.4 |
| Celebration before a finished game is cleared | 3.4 |
| Flight home: 0.6 per horse, take-offs spread over 0.4 | 1.0 (0.6 for a single horse; 0.25 slide in reduced motion) |
| Pause before the next game is dealt | 0.6 |

The board waits for the flight through the shell's match transition hook, so a match takes it about 1.05 s
after it asked, well inside the hook's 2.5 s limit; with every horse already home it takes it at once.

## Checks

- `npm run typecheck`, `npm test`, `npm run build`.
- `web/src/demo/demo-driver.test.ts`: whole quick and classic games whose events lead exactly to each state;
  the same game for the same seed; one die per roll in seed order; steps accepted as board batches; no
  `fetch`, `WebSocket`, `XMLHttpRequest`, `EventSource` or `sendBeacon` call over three games; every step
  animated by the director before the next one is due.
- `web/src/demo/close-up-framing.test.ts`: for every track cell and 24 orbit angles, the point a kick
  close-up looks at stays between the title and the call-to-action band, on 1440×900 and 390×844.
- `web/src/scene/director.test.ts` (`sendHome`), `web/src/scene/motion/fly-home.test.ts`,
  `stable-return.test.ts`, `kick-camera.test.ts` (calm policy).
- By hand in the same browser: with `prefers-reduced-motion` the board stays at rest with no demo; after a
  match the demo starts again from the stables; one canvas for the whole session; the scene dev harness
  (`scene-dev.html`) plays and restarts on the shared driver.
