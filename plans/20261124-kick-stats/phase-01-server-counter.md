# Phase 1: Server-authoritative kick counter

## Context

`applyMove` in `shared/game/engine.ts` is the single move-resolution path used by the Durable Object and shared tests. `GameState` is persisted inside the room and sent by the existing snapshot broadcast.

## Requirements

- Add optional-compatible `kicks` state field, initialized for all colours by `createGame`.
- Increment only when `landing.kicked` is present, including quick mode and repeated moves in one turn.
- Preserve legacy state behavior (`undefined` means zero) and avoid mutating input state.

## Files

- `shared/game/types.ts`
- `shared/game/engine.ts`
- `shared/game/engine.test.ts` (or focused shared test)

## Validation

Focused engine tests for one kick, repeated kicks, quick kick, and legacy state, then `npm run typecheck` and `npm test`.

