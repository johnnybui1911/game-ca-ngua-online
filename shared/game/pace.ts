/**
 * The one table of timings that sets how fast a match feels, shared by the board animation and the
 * server. The board plays a batch (the events of one commit) for `animationSeconds`; the server waits
 * `pauseSeconds` after the commit before it plays the next automated action. Both come from the same
 * numbers, so an animation never outlasts the wait for it. To tune the feel, edit a profile below or
 * change `DEFAULT_PACE`; nothing else holds a duration of its own.
 */
import type { GameEvent } from './types';

/** Seconds, unless stated otherwise. */
export interface PaceTimings {
  /** The die from the throw until it lies flat. */
  roll: number;
  /** The die at rest before its move in the same batch, so the face can be read. */
  rollHold: number;
  /** The die at rest after a roll that moves nothing, before the turn passes on. */
  rollRest: number;
  /** Crouch before the first hop, and the spring back to rest on the last cell. */
  crouch: number;
  settle: number;
  /** All the hops of a move share `hopsTotal`, each at most `maxHop`: a long move hops a little faster, not for longer. */
  hopsTotal: number;
  maxHop: number;
  /** The one long jump from the stable to the entry cell. */
  stableExit: number;
  /** A kicking move: a run-up of `kickRun` in all (each hop at most `maxRunHop`), then a higher last hop onto the victim. */
  kickCrouch: number;
  kickRun: number;
  maxRunHop: number;
  pounce: number;
  /** Freeze at contact. Never compressed: a shorter one is not seen at all. */
  hitStop: number;
  /** The kicked horse's flight home and its landing. */
  knockback: number;
  /** Reduced motion: the die slides into place; a horse slides along its path, a kicked one slides home. */
  reducedRoll: number;
  slidePerCell: number;
  maxSlide: number;
  slideHome: number;
  /** Idle time the server leaves after a batch's animation before the next automated action. */
  beat: number;
  /** Shortest server pause per animated segment (a roll or a move) of a commit, however short its animation. */
  minSegmentPause: number;
  /** Longest animation per animated segment; a batch over it is compressed. Absent: only the server pause limits it. */
  segmentCap?: number;
}

export interface PaceProfile {
  /** A normal match. */
  normal: PaceTimings;
  /** A quick match (Ván nhanh), and the home page's demo game. */
  quick: PaceTimings;
}

export const PACE_NAMES = ['current', 'vua', 'thu-thai'] as const;
export type PaceName = (typeof PACE_NAMES)[number];

/** The pace before this table existed: a flat pause per segment and every move squeezed into 0.6 s (0.35 s quick). */
const CURRENT_NORMAL: PaceTimings = {
  roll: 0.55,
  rollHold: 0.2,
  rollRest: 0,
  crouch: 0.07,
  settle: 0.09,
  hopsTotal: 0.4,
  maxHop: 0.16,
  stableExit: 0.22,
  kickCrouch: 0.06,
  kickRun: 0.18,
  maxRunHop: 0.12,
  pounce: 0.13,
  hitStop: 0.05,
  knockback: 0.18,
  reducedRoll: 0.2,
  slidePerCell: 0.08,
  maxSlide: 0.3,
  slideHome: 0.2,
  beat: 0,
  minSegmentPause: 0.7,
  segmentCap: 0.6,
};

export const PACES: Record<PaceName, PaceProfile> = {
  current: {
    normal: CURRENT_NORMAL,
    quick: { ...CURRENT_NORMAL, minSegmentPause: 0.4, segmentCap: 0.35 },
  },
  /** "Vừa": every beat about one and a half times as long as before, and a move takes as long as its cells need. */
  vua: {
    normal: {
      roll: 0.85,
      rollHold: 0.3,
      rollRest: 0.2,
      crouch: 0.11,
      settle: 0.15,
      hopsTotal: 0.84,
      maxHop: 0.21,
      stableExit: 0.36,
      kickCrouch: 0.09,
      kickRun: 0.45,
      maxRunHop: 0.15,
      pounce: 0.22,
      hitStop: 0.08,
      knockback: 0.36,
      reducedRoll: 0.3,
      slidePerCell: 0.1,
      maxSlide: 0.5,
      slideHome: 0.3,
      beat: 0.3,
      minSegmentPause: 0.7,
    },
    quick: {
      roll: 0.55,
      rollHold: 0.2,
      rollRest: 0.1,
      crouch: 0.07,
      settle: 0.1,
      hopsTotal: 0.6,
      maxHop: 0.15,
      stableExit: 0.24,
      kickCrouch: 0.06,
      kickRun: 0.3,
      maxRunHop: 0.11,
      pounce: 0.15,
      hitStop: 0.06,
      knockback: 0.22,
      reducedRoll: 0.2,
      slidePerCell: 0.08,
      maxSlide: 0.3,
      slideHome: 0.2,
      beat: 0.15,
      minSegmentPause: 0.4,
    },
  },
  /** "Thư thả": about twice as long as before, close to a game played by hand on a table. */
  'thu-thai': {
    normal: {
      roll: 1.1,
      rollHold: 0.45,
      rollRest: 0.3,
      crouch: 0.14,
      settle: 0.2,
      hopsTotal: 1.2,
      maxHop: 0.26,
      stableExit: 0.45,
      kickCrouch: 0.12,
      kickRun: 0.6,
      maxRunHop: 0.2,
      pounce: 0.28,
      hitStop: 0.1,
      knockback: 0.5,
      reducedRoll: 0.35,
      slidePerCell: 0.12,
      maxSlide: 0.6,
      slideHome: 0.35,
      beat: 0.45,
      minSegmentPause: 0.9,
    },
    quick: {
      roll: 0.7,
      rollHold: 0.25,
      rollRest: 0.15,
      crouch: 0.09,
      settle: 0.12,
      hopsTotal: 0.66,
      maxHop: 0.18,
      stableExit: 0.3,
      kickCrouch: 0.08,
      kickRun: 0.32,
      maxRunHop: 0.13,
      pounce: 0.18,
      hitStop: 0.07,
      knockback: 0.28,
      reducedRoll: 0.25,
      slidePerCell: 0.09,
      maxSlide: 0.4,
      slideHome: 0.25,
      beat: 0.2,
      minSegmentPause: 0.5,
    },
  },
};

/** The pace the server keeps, and the board unless told otherwise. */
export const DEFAULT_PACE: PaceName = 'vua';

export function isPaceName(value: unknown): value is PaceName {
  return PACE_NAMES.some((name) => name === value);
}

type Moved = Extract<GameEvent, { type: 'moved' }>;

/** Hops a move is animated with: one long jump out of the stable, otherwise one per cell. */
export function hopsOf(e: Pick<Moved, 'from' | 'to'>): number {
  return e.from < 0 ? 1 : Math.max(1, e.to - e.from);
}

/** Phase durations of one full-motion move. */
export interface MoveTiming {
  crouch: number;
  /** Every hop but the last. */
  hop: number;
  /** The last hop; longer than the others when it lands a kick. */
  lastHop: number;
  settle: number;
  /** 0 without a kick. */
  hitStop: number;
  knockback: number;
}

export function moveTiming(e: Pick<Moved, 'from' | 'to' | 'kicked'>, t: PaceTimings): MoveTiming {
  const hops = hopsOf(e);
  const fromStable = e.from < 0;
  if (e.kicked) {
    return {
      crouch: t.kickCrouch,
      hop: hops > 1 ? Math.min(t.maxRunHop, t.kickRun / (hops - 1)) : 0,
      lastHop: fromStable ? t.stableExit : t.pounce,
      settle: t.settle,
      hitStop: t.hitStop,
      knockback: t.knockback,
    };
  }
  const hop = fromStable ? t.stableExit : Math.min(t.maxHop, t.hopsTotal / hops);
  return { crouch: t.crouch, hop, lastHop: hop, settle: t.settle, hitStop: 0, knockback: 0 };
}

/** Seconds a move with these phases lasts. */
export function moveSeconds(m: MoveTiming, hops: number, kicked: boolean): number {
  const landed = m.crouch + (hops - 1) * m.hop + m.lastHop;
  return landed + (kicked ? m.hitStop + Math.max(m.knockback, m.settle) : m.settle);
}

/**
 * Seconds the die thrown by `events[index]` rests before the batch goes on: `rollHold` when its move follows
 * in the same batch, `rollRest` when nothing can move and the turn passes on. A roll that leaves the player
 * a horse to pick holds nothing up.
 */
export function restAfterRoll(events: readonly GameEvent[], index: number, t: PaceTimings): number {
  const next = events[index + 1];
  if (next?.type === 'moved') return t.rollHold;
  return next?.type === 'turn' ? t.rollRest : 0;
}

/** Rolls and moves in `events`. */
function segments(events: readonly GameEvent[]): number {
  let n = 0;
  for (const e of events) if (e.type === 'rolled' || e.type === 'moved') n++;
  return n;
}

/** Seconds the board animates `events` in full motion, before any compression. */
export function plannedSeconds(events: readonly GameEvent[], t: PaceTimings): number {
  let total = 0;
  events.forEach((e, i) => {
    if (e.type === 'rolled') total += t.roll + restAfterRoll(events, i, t);
    else if (e.type === 'moved') total += moveSeconds(moveTiming(e, t), hopsOf(e), e.kicked !== null);
  });
  return total;
}

/** Seconds of hit-stop in `events`: the part of a batch that compression leaves alone. */
export function hitStopSeconds(events: readonly GameEvent[], t: PaceTimings): number {
  let total = 0;
  for (const e of events) if (e.type === 'moved' && e.kicked) total += t.hitStop;
  return total;
}

/** Seconds the board takes to animate `events`: the planned time, compressed to `segmentCap` per segment where a profile has one. */
export function animationSeconds(events: readonly GameEvent[], t: PaceTimings): number {
  const planned = plannedSeconds(events, t);
  return t.segmentCap === undefined ? planned : Math.min(planned, t.segmentCap * Math.max(1, segments(events)));
}

/** Seconds the server waits after committing `events` before it plays the next automated action. */
export function pauseSeconds(events: readonly GameEvent[], t: PaceTimings): number {
  return Math.max(t.minSegmentPause * Math.max(1, segments(events)), animationSeconds(events, t) + t.beat);
}

/** The longest any one batch (a roll and its kicking move) animates under `t`: how long a roll may have to wait for the board. */
export function longestBatchSeconds(t: PaceTimings): number {
  const rolled: GameEvent = { type: 'rolled', color: 0, dice: 6, legalHorses: [0] };
  const turn: GameEvent = { type: 'turn', color: 1, extraRoll: false };
  let longest = 0;
  for (const from of [-1, 0]) {
    for (let cells = 1; cells <= 6; cells++) {
      for (const kicked of [null, { color: 1 as const, horse: 0, from: 0 }]) {
        const moved: GameEvent = { type: 'moved', color: 0, horse: 0, from, to: from < 0 ? 0 : cells, kicked };
        longest = Math.max(longest, animationSeconds([rolled, moved, turn], t));
      }
    }
  }
  return longest;
}
