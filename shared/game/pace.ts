/**
 * The one table of timings that sets how fast a match feels, shared by the board animation and the
 * server. The board plays a batch (the events of one commit) for `animationSeconds`; the server waits
 * `pauseSeconds` after the commit before it plays the next automated action. Both come from the same
 * numbers, so an animation never outlasts the wait for it. The host picks a room's pace ("Nhịp ván"); to
 * tune the feel, edit a profile below. Nothing else holds a duration of its own.
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
  /** The kicked horse lifting off slowly after the hit-stop, before it is flung. Part of the cinematic kick. */
  kickRise: number;
  /** The kicked horse's flight home and its landing. */
  knockback: number;
  /**
   * The same two phases of a kick played without the cinematic slow-motion (a device too weak for it): no rise,
   * and a short hit-stop and flight. Never longer than the cinematic kick, so a client that plays it still
   * finishes inside the server's pause.
   */
  plainHitStop: number;
  plainKnockback: number;
  /** The last hop onto the victim in a plain kick: low and short. The cinematic kick's `pounce` is a high leap. */
  plainPounce: number;
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

/** "Nhanh", "Vừa", "Thư thả": the choices of a room's "Nhịp ván" setting, fastest first. */
export const PACE_NAMES = ['nhanh', 'vua', 'thu-thai'] as const;
export type PaceName = (typeof PACE_NAMES)[number];

/** "Nhanh", the pace before this table existed: a flat pause per segment and every plain move squeezed into 0.6 s (0.35 s quick). A kick keeps its own, longer time. */
const NHANH_NORMAL: PaceTimings = {
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
  pounce: 0.3,
  hitStop: 0.05,
  kickRise: 0.08,
  knockback: 1.1,
  plainHitStop: 0.05,
  plainKnockback: 0.18,
  plainPounce: 0.13,
  reducedRoll: 0.2,
  slidePerCell: 0.08,
  maxSlide: 0.3,
  slideHome: 0.2,
  beat: 0.05,
  minSegmentPause: 0.7,
  segmentCap: 0.6,
};

export const PACES: Record<PaceName, PaceProfile> = {
  nhanh: {
    normal: NHANH_NORMAL,
    quick: { ...NHANH_NORMAL, minSegmentPause: 0.4, segmentCap: 0.35 },
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
      pounce: 0.5,
      hitStop: 0.06,
      kickRise: 0.12,
      knockback: 1.75,
      plainHitStop: 0.08,
      plainKnockback: 0.36,
      plainPounce: 0.22,
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
      pounce: 0.33,
      hitStop: 0.05,
      kickRise: 0.08,
      knockback: 0.9,
      plainHitStop: 0.06,
      plainKnockback: 0.22,
      plainPounce: 0.15,
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
      pounce: 0.55,
      hitStop: 0.08,
      kickRise: 0.12,
      knockback: 1.65,
      plainHitStop: 0.1,
      plainKnockback: 0.5,
      plainPounce: 0.28,
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
      pounce: 0.35,
      hitStop: 0.05,
      kickRise: 0.08,
      knockback: 0.85,
      plainHitStop: 0.07,
      plainKnockback: 0.28,
      plainPounce: 0.18,
      reducedRoll: 0.25,
      slidePerCell: 0.09,
      maxSlide: 0.4,
      slideHome: 0.25,
      beat: 0.2,
      minSegmentPause: 0.5,
    },
  },
};

/** The pace of a room whose host chose none (and of rooms stored before the setting existed), and of the home page's demo. */
export const DEFAULT_PACE: PaceName = 'vua';

export function isPaceName(value: unknown): value is PaceName {
  return PACE_NAMES.some((name) => name === value);
}

/** Timings of a normal or a quick match at pace `name`. */
export function paceTimings(name: PaceName, quick: boolean): PaceTimings {
  return quick ? PACES[name].quick : PACES[name].normal;
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
  /** The kicked horse's slow lift-off before it is flung; 0 without a kick or without the cinematic kick. */
  rise: number;
  knockback: number;
}

/**
 * Phase durations of the move `e`. A kick is the cinematic one (slow rise, then a flung flight) unless `cinematic`
 * is false: then it is the plain hit-stop and flight a weak device plays. The server always plans the cinematic kick.
 */
export function moveTiming(e: Pick<Moved, 'from' | 'to' | 'kicked'>, t: PaceTimings, cinematic = true): MoveTiming {
  const hops = hopsOf(e);
  const fromStable = e.from < 0;
  if (e.kicked) {
    return {
      crouch: t.kickCrouch,
      hop: hops > 1 ? Math.min(t.maxRunHop, t.kickRun / (hops - 1)) : 0,
      lastHop: fromStable ? t.stableExit : cinematic ? t.pounce : t.plainPounce,
      settle: t.settle,
      hitStop: cinematic ? t.hitStop : t.plainHitStop,
      rise: cinematic ? t.kickRise : 0,
      knockback: cinematic ? t.knockback : t.plainKnockback,
    };
  }
  const hop = fromStable ? t.stableExit : Math.min(t.maxHop, t.hopsTotal / hops);
  return { crouch: t.crouch, hop, lastHop: hop, settle: t.settle, hitStop: 0, rise: 0, knockback: 0 };
}

/** Seconds a move with these phases lasts. */
export function moveSeconds(m: MoveTiming, hops: number, kicked: boolean): number {
  const landed = m.crouch + (hops - 1) * m.hop + m.lastHop;
  return landed + (kicked ? m.hitStop + Math.max(m.rise + m.knockback, m.settle) : m.settle);
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

/** Seconds the board animates `events` in full motion, before any compression: the kicking moves, and everything else. */
function plannedParts(events: readonly GameEvent[], t: PaceTimings): { kick: number; rest: number; restSegments: number } {
  let kick = 0;
  let rest = 0;
  let restSegments = 0;
  events.forEach((e, i) => {
    if (e.type === 'rolled') {
      rest += t.roll + restAfterRoll(events, i, t);
      restSegments++;
    } else if (e.type === 'moved') {
      const seconds = moveSeconds(moveTiming(e, t), hopsOf(e), e.kicked !== null);
      if (e.kicked) kick += seconds;
      else {
        rest += seconds;
        restSegments++;
      }
    }
  });
  return { kick, rest, restSegments };
}

/** Seconds the board animates `events` in full motion, before any compression. */
export function plannedSeconds(events: readonly GameEvent[], t: PaceTimings): number {
  const p = plannedParts(events, t);
  return p.kick + p.rest;
}

/**
 * Seconds the board takes to animate `events`: the planned time, with everything but a kicking move compressed to
 * `segmentCap` per segment where a profile has one. A kick is the show of the game and is never cut short by the cap.
 */
export function animationSeconds(events: readonly GameEvent[], t: PaceTimings): number {
  const p = plannedParts(events, t);
  const rest = t.segmentCap === undefined ? p.rest : Math.min(p.rest, t.segmentCap * Math.max(1, p.restSegments));
  return p.kick + rest;
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
