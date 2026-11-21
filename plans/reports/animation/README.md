# Horse and dice animation: evidence

Captured from `scene-dev.html` (local CPU game, seed 7, four players) in headless Chromium with the page clock
paused and stepped, so every frame is an exact moment of the animation. Each frame is labelled with its time
after the batch reached the scene.

| File | Viewport | Shows |
|---|---|---|
| `move-1440x900.png` | 1440×900 | Blue horse moves 5 cells round a corner: crouch, hops, settle (70 ms apart) |
| `move-1440x900-zoom.png` | crop of the above at capture resolution | Same frames, cropped to the moving horse |
| `kick-1440x900.png` | 1440×900 | Yellow moves 6 cells onto green: run-up, close-up, contact, green thrown to its stable, camera back (90 ms apart) |
| `kick-390x844.png` | 390×844 | The same kick on a phone viewport (close-up leans in half as far) |
| `dice-1440x900.png` | 1440×900 | Red rolls 1: drop, two bounces, rock, rest (75 ms apart) |
| `dice-1440x900-zoom.png` | crop of the above at capture resolution | Same frames, cropped to the die |

## Timeline of one segment

Seconds at normal pace, before compression. A batch gets `BATCH_BUDGET` (0.6 s) per roll or move, a quick match
`QUICK_SEGMENT_SECONDS` (0.35 s); when the plan is longer, every phase except the hit-stop shrinks by one factor.

| Segment | Phases | Longest |
|---|---|---|
| Move | crouch 0.07 → hops sharing 0.40 (each ≤ 0.16) → settle 0.09 | 0.56 |
| Leave the stable | crouch 0.07 → one jump 0.22 → settle 0.09 | 0.38 |
| Move with kick | crouch 0.06 → run-up sharing 0.18 (each hop ≤ 0.12) → pounce 0.13 → hit-stop 0.05 → knockback 0.18 | 0.60 |
| Roll | drop, landings at 30 %, 56 %, 74 %, then rock to rest | 0.55 |
| Reduced: move | slide 0.08 per cell + 0.1 (≤ 0.30), kicked horse slides home 0.20 | 0.50 |
| Reduced: roll | slide into place, face already up | 0.20 |

The camera close-up and shake run on their own clock next to the director (lean-in until contact, hold 0.22 s,
return in about half a second), so they never count against a budget or the `busy` signal.

## Checks

- `npm run typecheck`, `npm test`, `npm run build`.
- `web/src/scene/director.test.ts`: every batch of a 600-action game fits its budget at normal, quick, reduced and
  reduced-quick pace and ends on the exact state (position, upright, rest size); 1-, 3- and 6-cell kicks fit both
  budgets; the hit-stop lasts 40–65 ms and keeps its length at quick pace; the die bounces at least twice and
  rests flat with the rolled face up for all six values; reduced motion never lifts, leans or scales a horse and
  sends no camera cue.
- `web/src/scene/motion/*.test.ts`: curves, hop body language, die tumble, kick camera timeline, motion setting.
