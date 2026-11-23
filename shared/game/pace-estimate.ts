/**
 * How long a match lasts at each pace, for the waiting room's "Nhịp ván" choice. The numbers come from the
 * pacing simulation (`playGame` in `pacing.ts`, 200 seeded games per row); `pace-estimate.test.ts` recomputes
 * them, so a change to a pace profile fails that test until this table is updated from its output.
 */
import type { PaceName } from './pace';

/** Mean minutes the board itself takes for one match; people's thinking time comes on top. */
export interface MatchEstimate {
  /** When people take every action: the animations alone. */
  people: number;
  /** When CPUs take every action: the server's pauses, i.e. the animations and the beat after each. */
  cpus: number;
}

export const ESTIMATE_SEATS = [2, 3, 4] as const;
type EstimateSeats = (typeof ESTIMATE_SEATS)[number];

export const PACE_ESTIMATES: Record<PaceName, Record<'normal' | 'quick', Record<EstimateSeats, MatchEstimate>>> = {
  nhanh: {
    normal: { 2: { people: 3.7, cpus: 5 }, 3: { people: 8.4, cpus: 11.3 }, 4: { people: 17.1, cpus: 22.8 } },
    quick: { 2: { people: 0.7, cpus: 0.7 }, 3: { people: 1.2, cpus: 1.3 }, 4: { people: 2, cpus: 2.3 } },
  },
  vua: {
    normal: { 2: { people: 6.2, cpus: 8.3 }, 3: { people: 14, cpus: 18.8 }, 4: { people: 28.3, cpus: 38 } },
    quick: { 2: { people: 1.1, cpus: 1.4 }, 3: { people: 2, cpus: 2.5 }, 4: { people: 3.5, cpus: 4.3 } },
  },
  'thu-thai': {
    normal: { 2: { people: 8, cpus: 11.3 }, 3: { people: 18.2, cpus: 25.5 }, 4: { people: 36.9, cpus: 51.5 } },
    quick: { 2: { people: 1.4, cpus: 1.7 }, 3: { people: 2.5, cpus: 3.1 }, 4: { people: 4.4, cpus: 5.4 } },
  },
};

/** The estimate for a room of `seats` seats; a count outside the table reads as the nearest one in it. */
export function paceEstimate(pace: PaceName, seats: number, quick: boolean): MatchEstimate {
  const known = seats <= 2 ? 2 : seats >= 4 ? 4 : 3;
  return PACE_ESTIMATES[pace][quick ? 'quick' : 'normal'][known];
}
