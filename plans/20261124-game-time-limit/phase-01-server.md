# Phase 1: Server contracts and deadline

## Files and steps

Update `shared/protocol.ts`, `shared/game/types.ts`, `worker/rooms/room-state.ts`, and `worker/rooms/room-do.ts`. Add a duration setting, compatibility parsing, deadline lifecycle, unbiased standings and expiry handling. Keep deadline changes tied to existing state commits and schedule it with the existing alarm.

## Validation

Unit-test each ranking criterion, random ties, expiry, missing fields, both modes, pause and disconnect. Check expiry wins over subsequent game actions.

## Risk and rollback

Clock and turn-alarm ordering can change results; test their interaction. Revert the feature commit to roll back; optional persisted fields remain ignorable.
