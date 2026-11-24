---
title: Dice shaping - no third 1/6 in a row
status: implemented
---

# Dice shaping: no third 1/6 in a row

## Outcome
While `DICE_SHAPING` is on, if the first two rolls of a turn were both 1 or 6 (6-1, 1-6, 6-6, 1-1), the third roll is drawn uniformly from {2,3,4,5}, for CPU, people and server-played people. Off switch: unchanged.

## Design (one phase)
- `DiceMemory.bonus` gains optional `count` (consecutive 1/6 this turn); missing means 1, so stored rooms keep working.
- `facesFor`: mid-turn with count >= 2 returns `[2,3,4,5]` before the CPU/person rules. CPU no-repeat rule is unchanged (6-1 / 1-6 still possible, then 2..5).
- `rememberRoll`: count = previous count + 1 while the turn continues; bonus is deleted when the turn ends, which resets the counter.
- Docs: comments in `dice-shaping.ts`, `shared/experiments.ts`, README line. No in-app text mentions shaping (it is hidden from players).
- Tests in `worker/rooms/dice-shaping.test.ts`: four combinations (person), CPU 6-1/1-6, reset on next turn, legacy shape, switch-off case (runs only when the flag is false).

## Decisions
- The forfeit house rule stays off while the experiment is on (it can no longer trigger).
- CPU 6-6/1-1 stay impossible by the existing rule, so only 6-1 and 1-6 reach the third roll for CPUs.
