import { describe, expect, it } from 'vitest';
import { chooseCpuMove } from './cpu';
import { runMatchup, wilson95 } from './cpu-sim';
import { applyMove, applyRoll, createGame } from './engine';
import { mulberry32 } from './seeded-random';
import type { CpuLevel } from './cpu-level';
import type { Color, DiceValue } from './types';

/** Environment of the test runner; shared code is also type-checked without Node types. */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

const TWO: Color[] = [0, 2];
const FOUR: Color[] = [0, 1, 2, 3];

/** Seeds used by the always-on test; the bench defaults to 1000000.. (the weights were tuned on seeds 1..6000), override with CPU_BENCH_SEED. */
const FIXED_SEED = 100000;

describe('CPU strength (always on, fixed seeds)', () => {
  const rate = (a: CpuLevel, b: CpuLevel, N: number) => {
    const r = runMatchup(a, b, TWO, N, FIXED_SEED);
    return r.wins / r.games;
  };

  it('control: equal levels split about evenly (validates the harness)', () => {
    const r = rate('normal', 'normal', 600);
    expect(r).toBeGreaterThan(0.4);
    expect(r).toBeLessThan(0.6);
  });
  it('Hard beats Normal', () => {
    expect(rate('hard', 'normal', 1000)).toBeGreaterThanOrEqual(0.6);
  }, 30_000);
  it('Normal beats Easy', () => {
    expect(rate('normal', 'easy', 600)).toBeGreaterThanOrEqual(0.6);
  });
  it('Hard beats Easy', () => {
    expect(rate('hard', 'easy', 600)).toBeGreaterThanOrEqual(0.7);
  });
});

describe('Hard decision cost', () => {
  it('stays within budget', () => {
    const rand = mulberry32(7);
    const times: number[] = [];
    let state = createGame(FOUR);
    while (state.phase !== 'finished') {
      state = applyRoll(state, (Math.floor(rand() * 6) + 1) as DiceValue).state;
      if (state.phase !== 'move') continue;
      const t0 = performance.now();
      const horse = chooseCpuMove(state, 'hard');
      times.push(performance.now() - t0);
      state = applyMove(state, horse).state;
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] ?? 0;
    const p99 = times[Math.floor(times.length * 0.99)] ?? 0;
    const worst = times[times.length - 1] ?? 0;
    if (env['CPU_BENCH']) console.log(`Hard decision time over ${times.length} calls: median ${median.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms, worst ${worst.toFixed(3)} ms`);
    expect(median).toBeLessThan(1);
    // The worst single call also pays for garbage collection and a cold JIT, so the budget applies to the 99th percentile.
    expect(p99).toBeLessThan(5);
  });
});

describe.skipIf(!env['CPU_BENCH'])('CPU bench', () => {
  it('prints win rates', () => {
    const games = Number(env['CPU_BENCH_GAMES'] ?? 1000);
    const seed = Number(env['CPU_BENCH_SEED'] ?? 1_000_000);
    const rows = (
      [
        ['2p: hard vs normal', 'hard', 'normal', TWO],
        ['2p: normal vs easy', 'normal', 'easy', TWO],
        ['2p: hard vs easy', 'hard', 'easy', TWO],
        ['2p: normal vs normal (control)', 'normal', 'normal', TWO],
        ['4p: 1 hard + 3 normal', 'hard', 'normal', FOUR],
        ['4p: normal x4 (control)', 'normal', 'normal', FOUR],
      ] as const
    ).map(([name, a, b, colors]) => {
      const r = runMatchup(a, b, [...colors], games, seed);
      const [lo, hi] = wilson95(r.wins, r.games);
      return {
        matchup: name,
        games: r.games,
        seeds: `${seed}..${seed + games - 1}`,
        'win rate': `${((100 * r.wins) / r.games).toFixed(1)}%`,
        'ci95': `${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)}%`,
        'mean rolls': r.meanRolls.toFixed(0),
      };
    });
    console.log(`\n${rows.map((r) => Object.values(r).join(' | ')).join('\n')}\n(matchup | games | seeds | win rate of the first-named level | 95% Wilson | mean rolls)`);
    expect(rows.length).toBe(6);
  }, 600_000);
});
