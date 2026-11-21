import { describe, expect, it } from 'vitest';
import { chooseCpuMove } from './cpu';
import { applyMove, applyRoll, createGame } from './engine';
import { playGame, summarize, type GameCounters, type PacingPolicy } from './pacing';
import { mulberry32 } from './seeded-random';
import { SEAT_COLORS } from '../protocol';
import type { Color, DiceValue, GameEvent, RuleVariant } from './types';

/** Environment of the test runner; shared code is also type-checked without Node types. */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

const dice = (seed: number) => {
  const rand = mulberry32(seed);
  return () => (Math.floor(rand() * 6) + 1) as DiceValue;
};
const choose = (state: Parameters<typeof chooseCpuMove>[0]) => chooseCpuMove(state);
const play = (colors: Color[], seed: number, policy: PacingPolicy, variant: RuleVariant = 'classic') =>
  playGame(colors, dice(seed), choose, policy, variant);

describe('playGame', () => {
  it('is deterministic for a seed and policy', () => {
    expect(play([0, 1, 2], 7, 'normal')).toEqual(play([0, 1, 2], 7, 'normal'));
    expect(play([0, 1, 2], 7, 'quick', 'quick')).toEqual(play([0, 1, 2], 7, 'quick', 'quick'));
  });

  it('commits equal actions under normal and actions minus forced moves under quick', () => {
    for (const variant of ['classic', 'quick'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const normal = play([0, 1], seed, 'normal', variant);
        const quick = play([0, 1], seed, 'quick', variant);
        expect(normal.finished && quick.finished).toBe(true);
        expect(normal.commits).toBe(normal.actions);
        expect(quick.commits).toBe(quick.actions - quick.singleMoves);
        // A CPU plays a roll and its move in one commit whatever the mode.
        expect(normal.automatedCommits).toBe(normal.rolls);
        expect(quick.automatedCommits).toBe(quick.rolls);
      }
    }
  });

  it('merging forced moves does not change the game: same winner, actions and kicks', () => {
    for (const variant of ['classic', 'quick'] as const) {
      for (let seed = 100; seed < 130; seed++) {
        const normal = play([0, 1, 2, 3], seed, 'normal', variant);
        const quick = play([0, 1, 2, 3], seed, 'quick', variant);
        expect(quick.winner).toBe(normal.winner);
        expect(quick.actions).toBe(normal.actions);
        expect(quick.singleMoves).toBe(normal.singleMoves);
        expect(quick.kicks).toBe(normal.kicks);
      }
    }
  });

  it('counts rolls and moves like the events a room would emit', () => {
    const rollDie = dice(3);
    const events: GameEvent[] = [];
    let state = createGame([0, 2]);
    while (state.phase !== 'finished') {
      const r = applyRoll(state, rollDie());
      events.push(...r.events);
      state = r.state;
      if (state.phase === 'move') {
        const m = applyMove(state, choose(state));
        events.push(...m.events);
        state = m.state;
      }
    }
    const counted = playGame([0, 2], dice(3), choose, 'normal');
    expect(counted.rolls).toBe(events.filter((e) => e.type === 'rolled').length);
    expect(counted.moves).toBe(events.filter((e) => e.type === 'moved').length);
  });

  it('projects less pacing under quick than under normal for the same dice', () => {
    for (const seats of [2, 3, 4]) {
      const colors = SEAT_COLORS[seats] ?? [];
      const normal = play(colors, 11, 'normal');
      const quick = play(colors, 11, 'quick', 'quick');
      expect(quick.pacingSeconds).toBeLessThan(normal.pacingSeconds);
    }
  });
});

describe('summarize', () => {
  it('reports mean, median and nearest-rank p90', () => {
    const s = summarize([5, 1, 3, 2, 4, 6, 7, 8, 9, 10]);
    expect(s.mean).toBe(5.5);
    expect(s.median).toBe(5);
    expect(s.p90).toBe(9);
  });
});

/** `PACING_REPORT=1 npx vitest run shared/game/pacing.test.ts` prints the measurement tables; nothing is asserted about the averages. */
describe.skipIf(env.PACING_REPORT !== '1')('pacing report', () => {
  const GAMES = 200;
  const SEEDS = Array.from({ length: GAMES }, (_, i) => 1000 + i);
  const fmt = (n: number, digits = 0) => n.toFixed(digits);
  const modes: { name: string; policy: PacingPolicy; variant: RuleVariant }[] = [
    { name: 'thường', policy: 'normal', variant: 'classic' },
    { name: 'luật nhanh, nhịp thường', policy: 'normal', variant: 'quick' },
    { name: 'ván nhanh (N3)', policy: 'quick', variant: 'quick' },
  ];
  it('prints actions, commits and projected minutes per match', () => {
    const lines = [
      `Seeds 1000..${999 + GAMES}, ${GAMES} games per row, every seat Thường CPU.`,
      '| Ghế | Chế độ | Hoàn tất | Thao tác (TB / trung vị / p90) | Commit khi người chơi (TB / trung vị / p90) | Commit khi máy chơi (TB / trung vị / p90) | Phút theo nhịp server (TB / trung vị / p90) | Lượt chọn ngựa (TB) | Nước bắt buộc (TB) | Đá ngựa (TB) |',
      '|---|---|---|---|---|---|---|---|---|---|',
    ];
    for (const seats of [2, 3, 4]) {
      const colors = SEAT_COLORS[seats] ?? [];
      for (const m of modes) {
        const runs: GameCounters[] = SEEDS.map((seed) => playGame(colors, dice(seed), choose, m.policy, m.variant));
        const done = runs.filter((r) => r.finished);
        const col = (f: (r: GameCounters) => number) => summarize(done.map(f));
        const three = (s: ReturnType<typeof summarize>, d = 0) => `${fmt(s.mean, d)} / ${fmt(s.median, d)} / ${fmt(s.p90, d)}`;
        lines.push(
          `| ${seats} | ${m.name} | ${done.length}/${runs.length} | ${three(col((r) => r.actions))} | ${three(col((r) => r.commits))} | ${three(col((r) => r.automatedCommits))} | ${three(col((r) => r.pacingSeconds / 60), 1)} | ${fmt(col((r) => r.humanPrompts).mean)} | ${fmt(col((r) => r.singleMoves).mean)} | ${fmt(col((r) => r.kicks).mean, 1)} |`,
        );
      }
    }
    console.log(`\n${lines.join('\n')}\n`);
    expect(lines.length).toBeGreaterThan(3);
  }, 120_000);
});
