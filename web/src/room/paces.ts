import type { PaceName } from '../../../shared/game/pace';
import { paceEstimate } from '../../../shared/game/pace-estimate';

export const PACE_LABELS: Record<PaceName, string> = {
  nhanh: 'Nhanh',
  vua: 'Vừa',
  'thu-thai': 'Thư thả',
};

/** Whole minutes as the waiting room shows them: to the minute under ten, to five minutes above, never 0. */
function shownMinutes(minutes: number): number {
  return minutes < 10 ? Math.max(1, Math.round(minutes)) : Math.round(minutes / 5) * 5;
}

/**
 * One line on how long a match of this room lasts at `pace`: from the animations alone (people take every
 * action) to a match CPUs play. It is the board's own time; what people spend thinking is not in it.
 */
export function paceEstimateText(pace: PaceName, seats: number, quick: boolean): string {
  const estimate = paceEstimate(pace, seats, quick);
  const low = shownMinutes(estimate.people);
  const high = shownMinutes(estimate.cpus);
  const minutes = low === high ? `${low}` : `${low}–${high}`;
  return `${PACE_LABELS[pace]} · ván ${quick ? 'nhanh ' : ''}${seats} người khoảng ${minutes} phút bàn cờ chạy, chưa kể thời gian suy nghĩ.`;
}
