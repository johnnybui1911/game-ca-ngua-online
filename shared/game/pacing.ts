import { applyMove, applyRoll, createGame, rollAndSettle, segmentsOf } from './engine';
import type { Color, DiceValue, GameEvent, GameState, RuleVariant } from './types';

/**
 * Pacing model of a match played only by the server (every seat a CPU), no I/O.
 * `normal`: one commit per action (a roll, or a move), as a classic room plays.
 * `quick`: a roll with exactly one legal horse is merged with its move into one commit.
 */
export type PacingPolicy = 'normal' | 'quick';

/** Server pause after a commit: normal rooms wait `NORMAL_ACTION_SECONDS`, quick rooms `QUICK_SEGMENT_SECONDS` per animated segment of it. */
export const NORMAL_ACTION_SECONDS = 0.7;
export const QUICK_SEGMENT_SECONDS = 0.4;

export interface GameCounters {
  /** False when the game hit `maxActions` without a winner. */
  finished: boolean;
  winner: Color | null;
  /** Every roll and every move. */
  actions: number;
  rolls: number;
  moves: number;
  /** Server commits under the policy. */
  commits: number;
  /** Moves with two or more legal horses, i.e. a real choice for a person. */
  humanPrompts: number;
  /** Move phases with exactly one legal horse. */
  singleMoves: number;
  /** Rolls that grant another roll (1 or 6). */
  extraRolls: number;
  /** Sum over commits of the pause the policy applies after it. */
  pacingSeconds: number;
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
): GameCounters {
  const c: GameCounters = {
    finished: false,
    winner: null,
    actions: 0,
    rolls: 0,
    moves: 0,
    commits: 0,
    humanPrompts: 0,
    singleMoves: 0,
    extraRolls: 0,
    pacingSeconds: 0,
    kicks: 0,
  };
  let state = createGame(colors, variant);
  const commit = (events: GameEvent[]) => {
    c.commits++;
    c.pacingSeconds += policy === 'quick' ? QUICK_SEGMENT_SECONDS * segmentsOf(events) : NORMAL_ACTION_SECONDS;
    for (const e of events) {
      if (e.type === 'rolled') {
        c.rolls++;
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
      state = moved.state;
    } else if (policy === 'quick' && rolled.events.some((e) => e.type === 'moved')) {
      c.singleMoves++;
      commit(rolled.events);
      state = rolled.state;
    } else {
      commit(rolled.events);
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
