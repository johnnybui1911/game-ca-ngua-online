# Phase 2: home stair clearances

## Context

`Board.tsx` renders treads, discs, and the floating medallion; `layout.ts` owns their positions and obstacle footprints. Track and home positions are one unit apart, and the track disc base radius is 0.5.

## Steps

1. Narrow the treads and centre track discs between coloured lanes and wood, keeping home discs full-size and horses centred; inset the centre dais and medallion to create a visible gap.
2. Keep obstacle clearance calculations aligned with the new dais and tread dimensions and add geometry/placement tests.
3. Inspect `scene-dev.html` before and after at device scale factor 2 from top-down and angled views, including the centre and neighbouring track discs.
4. Run scene tests, typecheck, Vitest, and build; update PR #77 with measurements and commit the change separately.

## Constraints and rollback

Keep the approved cream sides, shadow settings, floating medallion, and unchanged wood, colours, horses, statue and dice. Revert this phase's commit to roll back.
