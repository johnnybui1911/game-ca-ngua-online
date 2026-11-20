# Phase 1: rules engine and CPU

## Goal

A pure, deterministic TypeScript implementation of the cờ cá ngựa rules and a CPU move chooser. The server is the only caller that rolls dice; the engine never generates randomness.

## Read first

- `shared/game/types.ts`: the board model, state and event types, the seven rules, and the `RulesEngine` interface you implement. This file is the contract; do not edit it. If it is wrong or ambiguous, say so in your report.

## Files you own

- `shared/game/engine.ts`: exports `createGame`, `applyRoll`, `applyMove` and `engine: RulesEngine`.
- `shared/game/cpu.ts`: exports `chooseCpuMove`.
- `shared/game/*.test.ts`, and `vitest.config.ts` at the repo root (node environment, include `shared/**/*.test.ts`).

Touch nothing else.

## Requirements

- Functions never mutate their input; they return a new `GameState`.
- `createGame(colors)`: colours sorted ascending, 2 to 4 distinct colours, all horses in the stable, `turn` is the first colour, phase `roll`. Throw on invalid input.
- `applyRoll`: throws unless phase is `roll`. Emits `rolled` with the legal horses. With legal moves the phase becomes `move`. With none, either the same colour rolls again (dice 1 or 6: emit `turn` with `extraRoll: true`) or the turn passes to the next colour in `colors` (emit `turn` with `extraRoll: false`); `dice` resets to null and phase stays `roll`.
- `applyMove`: throws unless phase is `move` and the horse is in `legalHorses`. Emits `moved` (with `kicked` when an opponent is sent to its stable), then `won` and phase `finished` when rule 7 holds, otherwise `turn` as above.
- Occupancy checks compare absolute cells via `trackCell`. Horses on home columns never block the track. Rule 2's "cells passed over" covers every track cell strictly between origin and landing; rule 3 requires home steps 1..n to be free of the mover's own colour.
- `chooseCpuMove` priority: a move that kicks an opponent; else a move onto or up the home column (highest resulting step first); else leaving the stable; else the horse with the greatest track progress. Deterministic: ties go to the lowest horse index.

## Tests (vitest)

Cover each of the seven rules with at least one legal and one illegal case, including: leaving the stable on 1 and 6 but not 2..5; blocked entry cell (own horse) versus kick (opponent); a blocker between origin and landing; overshooting the gate; kick across colour offsets (two colours on the same absolute cell); gate to home step n with a blocked lower step; home step k to k+1 only on exactly k+1; extra roll on 1 and 6 with and without a legal move; turn order for 2, 3 and 4 colours; win detection; input immutability. Add one simulation test: 200 complete CPU-versus-CPU games (2, 3 and 4 colours) driven by a seeded PRNG all reach `finished` within 5000 rolls each and no state ever holds two horses on one absolute track cell or one home step of a colour.

## Done means

`npx vitest run` passes and `npx tsc -p tsconfig.node.json` reports no error in your files.
