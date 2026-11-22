import { applyMove, applyRoll, createGame, rollAndSettle } from './engine';
import { DEFAULT_PACE, PACES, animationSeconds, pauseSeconds } from './pace';
import type { PaceProfile } from './pace';
import type { Color, DiceValue, GameEvent, GameState, RuleVariant } from './types';

/**
 * Pacing model of a match, no I/O. After every commit the server pauses for as long as the board animates
 * it, plus a beat (`pauseSeconds`), before it plays for a CPU; that pause is the pacing floor of an all-CPU match.
 * Commits are counted for two kinds of seat:
 * - a person's actions: `normal` is one commit per action (a roll, or a move); `quick` merges a roll with exactly
 *   one legal horse with its move (`commits`);
 * - a CPU: the server rolls and moves in one step in both modes (`automatedCommits`, one per roll).
 */
export type PacingPolicy = 'normal' | 'quick';

export interface GameCounters {
  /** False when the game hit `maxActions` without a winner. */
  finished: boolean;
  winner: Color | null;
  /** Every roll and every move. */
  actions: number;
  rolls: number;
  moves: number;
  /** Server commits under the policy when people take every action. */
  commits: number;
  /** Server commits when CPUs take every action: one per roll, the move rides in the same commit. */
  automatedCommits: number;
  /** Moves with two or more legal horses, i.e. a real choice for a person. */
  humanPrompts: number;
  /** Move phases with exactly one legal horse. */
  singleMoves: number;
  /** Rolls that grant another roll (1 or 6). */
  extraRolls: number;
  /** Length of an all-CPU match: the sum, over every CPU action (a roll with its move), of the server pause after it. */
  pacingSeconds: number;
  /** Seconds the board spends animating when people take every action; their thinking time comes on top. */
  animationSeconds: number;
  kicks: number;
}

/** Plays one all-CPU game. `rollDie` draws dice, `choose` picks the horse; neither is called for a forced single move under `quick`. */
export function playGame(
  colors: Color[],
  rollDie: () => DiceValue,
  choose: (state: GameState) => number,
  policy: PacingPolicy,
  variant: RuleVariant = 'classic',
  maxActions = 20_000,
  pace: PaceProfile = PACES[DEFAULT_PACE],
): GameCounters {
  const timings = pace[policy];
  const c: GameCounters = {
    finished: false,
    winner: null,
    actions: 0,
    rolls: 0,
    moves: 0,
    commits: 0,
    automatedCommits: 0,
    humanPrompts: 0,
    singleMoves: 0,
    extraRolls: 0,
    pacingSeconds: 0,
    animationSeconds: 0,
    kicks: 0,
  };
  let state = createGame(colors, variant);
  const commit = (events: GameEvent[]) => {
    c.commits++;
    c.animationSeconds += animationSeconds(events, timings);
    for (const e of events) {
      if (e.type === 'rolled') {
        c.rolls++;
        c.automatedCommits++;
        c.actions++;
        if (e.dice === 1 || e.dice === 6) c.extraRolls++;
      } else if (e.type === 'moved') {
        c.moves++;
        c.actions++;
        if (e.kicked) c.kicks++;
      }
    }
  };
  while (state.phase !== 'finished') {
    if (c.actions >= maxActions) return c;
    const dice = rollDie();
    const rolled = policy === 'quick' ? rollAndSettle(state, dice, true) : applyRoll(state, dice);
    if (rolled.state.phase === 'move') {
      // Under `normal` (or with two or more horses) the roll is its own commit and the move another.
      if (rolled.state.legalHorses.length >= 2) c.humanPrompts++;
      else c.singleMoves++;
      commit(rolled.events);
      const moved = applyMove(rolled.state, choose(rolled.state));
      commit(moved.events);
      // A CPU's roll and move reach the board as one batch.
      c.pacingSeconds += pauseSeconds([...rolled.events, ...moved.events], timings);
      state = moved.state;
    } else {
      if (policy === 'quick' && rolled.events.some((e) => e.type === 'moved')) c.singleMoves++;
      commit(rolled.events);
      c.pacingSeconds += pauseSeconds(rolled.events, timings);
      state = rolled.state;
    }
  }
  c.finished = true;
  c.winner = state.winner;
  return c;
}

export interface Summary {
  mean: number;
  median: number;
  p90: number;
}

/** Mean, median and 90th percentile (nearest rank) of `values`. */
export function summarize(values: readonly number[]): Summary {
  if (values.length === 0) throw new Error('nothing to summarize');
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0;
  return { mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, median: at(0.5), p90: at(0.9) };
}
