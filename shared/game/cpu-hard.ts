import { HOME_STEPS, HORSES_PER_COLOR, POS_GATE, POS_STABLE, POS_START, TRACK_LENGTH, isOnTrack, trackCell } from './types';
import type { Color, GameState, HorsePos } from './types';
import { isLocked, landingFor, type Landing } from './engine';

/**
 * Weights of the Hard evaluator. Tuned by coordinate descent against Normal (two-player and
 * four-player games, seeds 1..5000), then confirmed on held-out seeds with `cpu-bench.test.ts`, and frozen here.
 */
export const HARD_WEIGHTS = {
  /** Every own horse is on the home column after the move. */
  WIN: 1000,
  /** Flat value of kicking an opponent horse. */
  KICK_BASE: 4,
  /** Extra kick value per cell of progress the victim loses. */
  KICK_PROGRESS: 0.75,
  /** Value of leaving the stable (a 1 or 6 is needed for it). */
  LEAVE: 10,
  /** Preference for moving the horse that is already furthest along: finishing one beats spreading. */
  ADVANCE: 0.12,
  /** Cost of losing a track horse, per cell of progress it had. */
  LOSS_PROGRESS: 0.3,
  /** Weight on the kick value the own horses threaten for the next turn (share of dice values with a kick, times kick value). */
  THREAT: 1,
  /** Value of freeing the own entry cell while horses still wait in the stable (a 1 or 6 can then bring one out). */
  ENTRY: 4,
  /** Quick game: extra value of the first kick of a colour, which opens its home column (it cannot win before). */
  UNLOCK: 12,
  /** Cost per horse that no longer fits below the lowest occupied home step (it must wait for an exact climb). */
  COLUMN_DEFICIT: 30,
};

type Weights = typeof HARD_WEIGHTS;

function rowOf(board: HorsePos[][], color: Color): HorsePos[] {
  const row = board[color];
  if (!row) throw new Error('bad colour');
  return row;
}

/** Board after `horse` of `color` makes `landing`; the kicked horse returns to its stable. Never mutates `board`. */
function boardAfter(board: HorsePos[][], color: Color, horse: number, landing: Landing): HorsePos[][] {
  const next = board.map((row) => row.slice());
  rowOf(next, color)[horse] = landing.to;
  if (landing.kicked) rowOf(next, landing.kicked.color)[landing.kicked.horse] = POS_STABLE;
  return next;
}

/** Absolute track cell -> colour * 4 + horse standing on it, or -1. */
function occupancy(board: HorsePos[][]): Int8Array {
  const occ = new Int8Array(TRACK_LENGTH).fill(-1);
  board.forEach((row, color) =>
    row.forEach((pos, horse) => {
      if (isOnTrack(pos)) occ[trackCell(color as Color, pos)] = color * HORSES_PER_COLOR + horse;
    }),
  );
  return occ;
}

/**
 * Every kick the horses of `movers` could make on the next roll, by die value, with the same
 * movement rules as `landingFor`: a horse is stopped by any horse on its way and kicks the first
 * foreign horse it lands on; a horse in the stable enters on a 1 or 6. `onHit` gets the die value
 * and the victim (colour * 4 + horse). Gate and home-column horses never kick.
 */
function kicksOf(movers: Color[], board: HorsePos[][], occ: Int8Array, onHit: (dice: number, victim: number) => void): void {
  for (const mover of movers) {
    for (const pos of rowOf(board, mover)) {
      if (pos === POS_STABLE) {
        const hit = occ[trackCell(mover, POS_START)] ?? -1;
        if (hit >= 0 && Math.floor(hit / HORSES_PER_COLOR) !== mover) {
          onHit(1, hit);
          onHit(6, hit);
        }
      } else if (isOnTrack(pos)) {
        for (let dice = 1; pos + dice <= POS_GATE; dice++) {
          const hit = occ[trackCell(mover, pos + dice)] ?? -1;
          if (hit < 0) continue;
          if (Math.floor(hit / HORSES_PER_COLOR) !== mover) onHit(dice, hit);
          break;
        }
      }
    }
  }
}

/**
 * The kick value the own horses threaten and the cost of what the opponents threaten. Danger of an
 * own track horse = share of the six die values with which some opponent kicks it, times what losing
 * it costs. Threat = per die value the most valuable kick of the own horses, averaged over the six.
 */
function assess(board: HorsePos[][], opponents: Color[], color: Color, w: Weights): { danger: number; threat: number } {
  const occ = occupancy(board);
  const hitMask = new Map<number, number>();
  kicksOf(opponents, board, occ, (dice, victim) => hitMask.set(victim, (hitMask.get(victim) ?? 0) | (1 << dice)));
  let danger = 0;
  for (const [victim, mask] of hitMask) {
    if (Math.floor(victim / HORSES_PER_COLOR) !== color) continue;
    const pos = rowOf(board, color)[victim % HORSES_PER_COLOR] ?? 0;
    let dice = 0;
    for (let d = 1; d <= 6; d++) if (mask & (1 << d)) dice++;
    danger += (dice / 6) * w.LOSS_PROGRESS * pos;
  }

  const reach = new Array<number>(7).fill(-1);
  kicksOf([color], board, occ, (dice, victim) => {
    const pos = rowOf(board, Math.floor(victim / HORSES_PER_COLOR) as Color)[victim % HORSES_PER_COLOR] ?? 0;
    reach[dice] = Math.max(reach[dice] ?? -1, pos);
  });
  let threat = 0;
  for (let d = 1; d <= 6; d++) {
    const pos = reach[d] ?? -1;
    if (pos >= 0) threat += (w.KICK_BASE + w.KICK_PROGRESS * pos) / 6;
  }
  return { danger, threat };
}

/**
 * Horses still outside the home column must each end on a step below every occupied one (rule 3: a
 * climb needs steps 1..n free). Returns how many of them do not fit below the lowest occupied step.
 */
function columnDeficit(row: HorsePos[]): number {
  let lowest = POS_GATE + HOME_STEPS + 1;
  let outside = 0;
  for (const pos of row) {
    if (pos > POS_GATE) lowest = Math.min(lowest, pos);
    else outside++;
  }
  return Math.max(0, outside - (lowest - POS_GATE - 1));
}

/** 1 when a horse waits in the stable and the own entry cell holds no own horse, else 0. */
function entryFree(row: HorsePos[]): number {
  if (!row.includes(POS_STABLE)) return 0;
  return row.includes(POS_START) ? 0 : 1;
}

/**
 * Highest-scoring legal horse; ties go to the lowest index. Deterministic and pure: it reads only the
 * public board and the current roll, and scores hypothetical boards on copies.
 */
export function chooseHard(state: GameState, w: Weights = HARD_WEIGHTS): number {
  const color = state.turn;
  const dice = state.dice;
  if (dice === null) throw new Error('CPU can only choose in the move phase');
  const opponents = state.colors.filter((c) => c !== color);
  const own = rowOf(state.horses, color);
  const quick = state.variant === 'quick';
  const locked = isLocked(state, color);
  const now = assess(state.horses, opponents, color, w);
  const deficitNow = columnDeficit(own);
  const entryNow = entryFree(own);

  let best = -1;
  let bestScore = -Infinity;
  for (const horse of [...state.legalHorses].sort((a, b) => a - b)) {
    const landing = landingFor(state.horses, color, horse, dice, locked);
    if (landing === null) continue;
    const from = own[horse] ?? POS_STABLE;
    const after = boardAfter(state.horses, color, horse, landing);
    const ownAfter = rowOf(after, color);
    const next = assess(after, opponents, color, w);

    let score = w.ADVANCE * Math.max(from, 0);
    // Quick: the first horse into the home column wins; there is no column to fill afterwards.
    if (quick ? landing.to > POS_GATE : ownAfter.every((p) => p > POS_GATE)) score += w.WIN;
    if (landing.kicked) score += w.KICK_BASE + w.KICK_PROGRESS * landing.kicked.from + (locked ? w.UNLOCK : 0);
    if (from === POS_STABLE) score += w.LEAVE;
    if (!quick) score += w.COLUMN_DEFICIT * (deficitNow - columnDeficit(ownAfter));
    score += w.ENTRY * (entryFree(ownAfter) - entryNow);
    score += now.danger - next.danger;
    score += w.THREAT * (next.threat - now.threat);

    if (score > bestScore) {
      bestScore = score;
      best = horse;
    }
  }
  if (best < 0) throw new Error('No legal horse to choose');
  return best;
}
