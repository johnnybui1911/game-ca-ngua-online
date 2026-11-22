import { describe, expect, it } from 'vitest';
import { chooseCpuMove } from './cpu';
import { PACES, PACE_NAMES } from './pace';
import { ESTIMATE_SEATS, PACE_ESTIMATES, paceEstimate, type MatchEstimate } from './pace-estimate';
import { playGame } from './pacing';
import { mulberry32 } from './seeded-random';
import { SEAT_COLORS } from '../protocol';
import type { DiceValue } from './types';

/** The seeds the table was made with: 200 games per row, every seat a Thường CPU. */
const SEEDS = Array.from({ length: 200 }, (_, i) => 1000 + i);

function simulate(pace: (typeof PACE_NAMES)[number], seats: number, quick: boolean): MatchEstimate {
  let people = 0;
  let cpus = 0;
  for (const seed of SEEDS) {
    const rand = mulberry32(seed);
    const game = playGame(
      SEAT_COLORS[seats] ?? [],
      () => (Math.floor(rand() * 6) + 1) as DiceValue,
      (state) => chooseCpuMove(state),
      quick ? 'quick' : 'normal',
      quick ? 'quick' : 'classic',
      undefined,
      PACES[pace],
    );
    expect(game.finished).toBe(true);
    people += game.animationSeconds;
    cpus += game.pacingSeconds;
  }
  const minutes = (seconds: number) => Math.round((seconds / SEEDS.length / 60) * 10) / 10;
  return { people: minutes(people), cpus: minutes(cpus) };
}

describe('match length estimates', () => {
  it('the stored table is what the pacing simulation gives for every pace, seat count and mode', () => {
    const row = (pace: (typeof PACE_NAMES)[number], quick: boolean) => Object.fromEntries(ESTIMATE_SEATS.map((seats) => [seats, simulate(pace, seats, quick)]));
    const simulated = Object.fromEntries(PACE_NAMES.map((pace) => [pace, { normal: row(pace, false), quick: row(pace, true) }]));
    expect(PACE_ESTIMATES).toEqual(simulated);
  }, 60_000);

  it('a slower pace is a longer match, a quick match a shorter one, and CPUs take longer than the bare animation', () => {
    for (const seats of ESTIMATE_SEATS) {
      for (const quick of [false, true]) {
        const [nhanh, vua, thuThai] = PACE_NAMES.map((pace) => paceEstimate(pace, seats, quick));
        expect(nhanh!.cpus).toBeLessThan(vua!.cpus);
        expect(vua!.cpus).toBeLessThan(thuThai!.cpus);
        expect(nhanh!.people).toBeLessThan(vua!.people);
        expect(vua!.people).toBeLessThan(thuThai!.people);
      }
      for (const pace of PACE_NAMES) {
        expect(paceEstimate(pace, seats, true).cpus).toBeLessThan(paceEstimate(pace, seats, false).people);
        expect(paceEstimate(pace, seats, false).people).toBeLessThan(paceEstimate(pace, seats, false).cpus);
      }
    }
  });

  it('reads a seat count outside the table as the nearest one in it', () => {
    expect(paceEstimate('vua', 1, false)).toBe(PACE_ESTIMATES.vua.normal[2]);
    expect(paceEstimate('vua', 9, true)).toBe(PACE_ESTIMATES.vua.quick[4]);
  });
});
