# Match page on a software renderer: cause, fix, measurements

Headless Chromium (CI, and Playwright's headless shell locally) draws WebGL and composites the page
with SwiftShader, on the CPU. This report records what made the match page slow there, what changed,
and the numbers before and after.

## Setup

- Machine: Apple M1 Pro, 10 cores. Playwright Chromium, renderer string
  `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)`, quality `low (pinned)`.
- Scene: two signed-in players in a two-seat match, each page 360×520 (the e2e viewport), host's turn,
  nothing animating ("idle"); then the host rolls ("animating").
- GPU-process CPU: `SystemInfo.getProcessInfo` over 5 s, in cores (1.0 = one core fully busy). It is the
  process that rasterises both WebGL and the page.
- Frame interval / fps: `requestAnimationFrame` gaps on the host's page.
- Click latency: Playwright click on the menu button until the menu's close button is visible, five times.
- "N hogs": N busy-loop processes running beside the browser, to stand in for a small CI runner
  (6 hogs leave 4 free cores, 9 leave 1).

## Cause

| Experiment (idle match, two pages) | GPU-process CPU |
|---|---|
| Code before this change | 6.0–7.5 cores |
| Board drawn 4 times a second instead of every frame | 4.1–4.3 cores |
| … and the HUD's `turn-pulse` animation stopped | 1.1–1.3 cores |
| … same, canvas hidden with CSS (still drawn) | 1.2 cores |
| Canvas hidden, animation running | 3.6 cores |
| Board drawn once a second, animation stopped | 0.4 cores |

Two independent costs, both in the GPU process, not on the main thread (main-thread task time stayed
at 3–5 % throughout):

1. **The board was redrawn every frame although nothing moved.** One picture costs about 0.12
   core-seconds. Dropping lights, fog, the ground planes, tone mapping or a quarter of the pixels
   did not change that (1.07–1.24 cores at the same draw rate in every variant), so the cost could
   only be cut by drawing less often. Environment, shadows, post-processing and antialiasing were
   already off on this path.
2. **An endless CSS animation recomposited the whole page at 60 Hz.** `turn-pulse` animates the
   box-shadow of the 14 px seat dot of whoever's turn it is; on a software compositor every frame of
   it redraws the page, canvas included: about 3 cores for two pages. `feedback-live` (the green dot
   on the feedback button, home page and panels) is the same pattern.

With the runner's cores taken, the rasteriser falls behind, `requestAnimationFrame` drops to 2–12 fps
and every click waits for frames: the 3–5 s clicks seen in CI. The board's clock accepts at most
0.1 s per frame, so below 10 fps animations also run in slow motion, which is what stretched the suites.

The intermittent failure of "the host pauses and resumes a game" was a race on top of that: the
default turn time is 30 s, the same as the test's limit, so a slow run let the server roll for the
host just before the test clicked the roll button.

## Fix

- `web/src/scene/render/frame-gate.ts`, `FrameGate.tsx`: on a software renderer at full activity the
  frame loop keeps running (animations stay on the clock), but a picture is drawn only when an
  object, an instanced mesh or the camera changed, at most 12 times a second; a still board is
  drawn twice a second, which is what keeps the pulsing glow of the active stable alive. GPU tiers
  never mount the gate.
- `QualityProvider.tsx` sets `html[data-webgl]`; `room.css` and `chrome.css` stop `turn-pulse` and
  `feedback-live` on `data-webgl="software"`. The turn is still marked by the card's ring and glow.
- `e2e/room-host-controls.spec.ts`: the pause/resume game starts with the 60 s turn time (set through
  the waiting room's own control, and checked on the guest's page). Every assertion is unchanged.

## Before / after

| | Before | After |
|---|---|---|
| **No load** | | |
| GPU-process CPU, idle | 7.5 cores | 0.7 cores |
| Frame interval, idle (p50 / p95) | 37 / 46 ms (26 fps) | 16.7 / 21 ms (60 fps) |
| Frame interval, animating (p50 / p95) | 39 / 167 ms (19 fps) | 16.7 / 28 ms (52 fps) |
| Click latency | 84–112 ms | 35–57 ms |
| Roll click until the die shows | 173 ms | 69 ms |
| **6 hogs** | | |
| Frame interval, idle (p50 / p95) | 82 / 130 ms (12 fps) | 16.6 / 20 ms (60 fps) |
| Frame interval, animating (p50 / p95) | 91 / 298 ms (8 fps) | 17 / 80 ms (37 fps) |
| Click latency | 148–243 ms | 34–186 ms |
| Roll click until the die shows | 280 ms | 135 ms |
| **9 hogs** | | |
| Frame interval, idle (p50 / p95) | 459 / 1378 ms (1.8 fps) | 16.7 / 21 ms (60 fps) |
| Click latency | 444–1094 ms | 116–389 ms |
| Roll click until the die shows | 597 ms | 259 ms |

Under 9 hogs the animating window is still slow after the change (6.7 fps): while horses move the
board has to be drawn, and one free core cannot do that quickly. Idle pages no longer compete for it.

## Full e2e suite (local, SwiftShader, one worker)

| Run | `none` (5 tests) | `mock` (79 tests) | Wall | Result |
|---|---|---|---|---|
| Before | 7.3 min | 22.4 min | 29.7 min | 84 passed |
| After, run 1 | 6.7 min | 18.5 min | 25.2 min | 84 passed |
| After, run 2 | 5.2 min | 17.7 min | 22.9 min | 84 passed |
| Final code (release branch merged), run 1 | 4.8 min | 14.6 min | 19.5 min | 84 passed |
| Final code, run 2 | 4.2 min | 21.0 min | 25.2 min | 84 passed |

The first three rows force SwiftShader with launch flags; the last two are plain `npm run e2e`, back to
back, which uses the same renderer here.

Full games are random in length and bound by animation time, so the suite gains less on an idle
10-core machine than the idle-match numbers suggest; the gain is in what a starved runner can keep up with.
"The host pauses and resumes a game": 8.8 s before, 6.7 s and 6.9 s after.

## GPU tiers

Home page and a two-player match at 1440×900, `?quality=high`, headless Chromium on ANGLE Metal
(Apple M1 Pro), before and after: same picture (set, lanterns, shadows, bloom, HUD). Images are not
kept in the repository.

## Checks

`npm run typecheck`, `npm test` (55 files, 610 passed, 2 skipped), `npm run build`.
