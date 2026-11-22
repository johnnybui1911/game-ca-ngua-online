/**
 * Turns server batches (`GameState` + the events that led to it) into timed
 * animation. Independent of three.js and React: it drives a `SceneView`, so
 * the queueing, time budget and "end up showing exactly the game" rules are
 * unit-testable.
 */
import { COLORS, HORSES_PER_COLOR, POS_STABLE } from '../../../shared/game/types';
import type { Color, DiceValue, GameEvent, GameState, HorsePos } from '../../../shared/game/types';
import { DIE_REST, horseGround, restYaw, stableSlot, yawBetween } from './layout';
import type { Vec2 } from './layout';
import { angleDelta, arc, dampedSpring, easeOutCubic, lerp, lerpAngle, smoothstep } from './motion/curves';
import { createDieTumble, dieTumble, tiltedRise } from './motion/dice';
import { flyHomeDelay, flyHomePose, flyHomeSeconds } from './motion/fly-home';
import type { HomeFlight } from './motion/fly-home';
import { crouchLean, crouchStretch, hopEnergy, hopLean, hopStretch, settleStretch } from './motion/hop';

/** Height of a resting horse base above the board top. */
export const HORSE_Y = 0.07;
/** Half the die edge; a resting die has its centre this high. */
export const DIE_HALF = 0.32;

/** One server action (a die tumble, or a move with its kick) must finish within this; a batch gets it per action. */
export const BATCH_BUDGET = 0.6;
/** Batches allowed to wait behind the one playing; more than this snaps to the latest state. */
export const MAX_WAITING = 2;
/**
 * Quick match: seconds one animated segment (a roll or a move) may take. Kept below the server's
 * `quickSegmentMs` of 400 ms, the pace at which it commits one segment, so a batch never outlasts
 * the interval to the next one. Raise both together, never one alone.
 */
export const QUICK_SEGMENT_SECONDS = 0.35;
export const CELEBRATION_SECONDS = 3.4;

const ROLL_SECONDS = 0.55;
/** Pause after a roll that is followed by its move in the same batch, so the die face can be read. */
const ROLL_HOLD_SECONDS = 0.2;
/** Crouch before the first hop, and the spring back to rest on the last cell. */
const CROUCH_SECONDS = 0.07;
const SETTLE_SECONDS = 0.09;
/** All the hops of a move share this much time, each at most `MAX_HOP_SECONDS`: a long move hops faster, not longer. */
const MOVE_HOPS_SECONDS = 0.4;
const MAX_HOP_SECONDS = 0.16;
/** The one long jump from the stable to the entry cell. */
const STABLE_EXIT_SECONDS = 0.22;
/** A kicking move: a quick run-up, a higher last hop onto the victim, a freeze at contact, then the victim flies home. */
const KICK_CROUCH_SECONDS = 0.06;
const KICK_RUN_SECONDS = 0.18;
const MAX_RUN_HOP_SECONDS = 0.12;
const POUNCE_SECONDS = 0.13;
/** Freeze at contact. Never compressed: a shorter one is not seen at all. */
const HIT_STOP_SECONDS = 0.05;
const KNOCKBACK_SECONDS = 0.18;
/** Reduced motion: a horse slides along its path, a kicked one slides home, the die slides into place. */
const SLIDE_SECONDS_PER_CELL = 0.08;
const MAX_SLIDE_SECONDS = 0.3;
const SLIDE_HOME_SECONDS = 0.2;
const REDUCED_ROLL_SECONDS = 0.2;

const HOP_LIFT = 0.42;
const STABLE_EXIT_LIFT = 0.9;
const POUNCE_LIFT = 0.7;
const KNOCKBACK_LIFT = 2.2;
/** Forward lean of the kicker at contact, radians. */
const POUNCE_LEAN = 0.26;
/** How far the hit shoves the victim towards its stable before it takes off, and how far it tips, radians. */
const HIT_SHOVE = 0.22;
const HIT_TILT = 0.38;
/** Share of the knockback spent in the air; the rest is the landing squash springing back. */
const KNOCKBACK_FLIGHT = 0.78;
/** Share of a hop spent turning into its direction after a corner. */
const TURN_SHARE = 0.4;
/** Distance the die travels to its resting spot: thrown, and slid in reduced motion. */
const DIE_THROW = 2.4;
const DIE_SLIDE = 0.6;
/** Longest frame the clock accepts, so a stalled tab cannot fast-forward half a game in one step. */
const MAX_DT = 0.1;

export interface SceneView {
  /**
   * `pitch` leans the horse forward (radians, about its own side axis, applied after `yaw`); `stretch` scales its
   * height from the base (1 at rest), the view keeping its volume.
   */
  setHorse(color: Color, horse: number, x: number, y: number, z: number, yaw: number, pitch: number, stretch: number): void;
  /** Euler angles use order YXZ so the yaw never tilts the face on top. */
  setDie(visible: boolean, x: number, y: number, z: number, rx: number, ry: number, rz: number): void;
  setActive(color: Color | null): void;
  /** `t` runs 0..CELEBRATION_SECONDS; a null colour ends the effect. */
  setCelebration(color: Color | null, t: number): void;
  /**
   * A moving horse lands for the first time now, with `hops` landings `hopSeconds` apart in all; when it kicks
   * an opponent, the kick lands `kickAt` seconds from now (null without a kick). For sound.
   */
  moveStarted(hops: number, hopSeconds: number, kickAt: number | null): void;
  /** A kick will land on ground point (x, z) in `contactIn` seconds. Not called in reduced motion. */
  kickStarted(x: number, z: number, contactIn: number): void;
  /** The kick announced by `kickStarted` makes contact now. */
  kickLanded(): void;
}

interface Batch {
  game: GameState;
  events: GameEvent[];
}

interface KickInfo {
  color: Color;
  horse: number;
  from: HorsePos;
}

interface MoveSeg {
  k: 'move';
  color: Color;
  horse: number;
  from: HorsePos;
  to: HorsePos;
  hops: number;
  kicked: KickInfo | null;
  /** Plain slides instead of hops. */
  reduced: boolean;
  crouchDur: number;
  hopDur: number;
  /** The last hop; longer than the others when it lands a kick. */
  lastHopDur: number;
  settleDur: number;
  /** Freeze at contact; outside the time that compresses. */
  stopDur: number;
  kickDur: number;
  /** Derived by `timeMove`: all hops, the moment the last hop lands, the first landing, and the whole segment. */
  hopsDur: number;
  contactAt: number;
  soundAt: number;
  dur: number;
}

type Seg =
  | { k: 'roll'; color: Color; dice: DiceValue; reduced: boolean; dur: number }
  | MoveSeg
  | { k: 'hold'; dur: number }
  | { k: 'home'; flights: (HomeFlight & { color: Color; horse: number })[]; reduced: boolean; dur: number }
  | { k: 'turn'; color: Color; dur: 0 }
  | { k: 'win'; color: Color; dur: 0 };

/** Fill the derived times of a move from its phase durations, each first multiplied by `scale`. */
function timeMove(seg: MoveSeg, scale = 1): MoveSeg {
  seg.crouchDur *= scale;
  seg.hopDur *= scale;
  seg.lastHopDur *= scale;
  seg.settleDur *= scale;
  seg.kickDur *= scale;
  seg.hopsDur = (seg.hops - 1) * seg.hopDur + seg.lastHopDur;
  seg.contactAt = seg.crouchDur + seg.hopsDur;
  seg.soundAt = seg.reduced ? 0 : seg.crouchDur + (seg.hops > 1 ? seg.hopDur : seg.lastHopDur);
  seg.dur = seg.contactAt + (seg.kicked ? seg.stopDur + Math.max(seg.kickDur, seg.settleDur) : seg.settleDur);
  return seg;
}

const CUE_SOUND = 1;
const CUE_CONTACT = 2;

interface Run {
  batch: Batch;
  segs: Seg[];
  i: number;
  t: number;
  started: boolean;
  /** Cues of the current segment already sent to the view. */
  cues: number;
  hadRoll: boolean;
}

/** Euler (rx, rz) bringing the face with `value` pips to the top; opposite faces sum to 7. */
const FACE_TO_TOP: Record<DiceValue, readonly [number, number]> = {
  1: [0, 0],
  6: [Math.PI, 0],
  2: [-Math.PI / 2, 0],
  5: [Math.PI / 2, 0],
  3: [0, Math.PI / 2],
  4: [0, -Math.PI / 2],
};
/** Resting yaw of the die, fixed per value so the same roll always looks the same. */
const dieYaw = (value: DiceValue) => 0.3 + value * 0.45;

const TAU = Math.PI * 2;

export interface DirectorOptions {
  /** When set, a batch lasts at most this many seconds per roll and move segment instead of `BATCH_BUDGET`. */
  budgetPerSegment?: number;
  /** Asked when a batch starts: true plays it as short plain slides, without hit-stop or camera cues. */
  reducedMotion?: () => boolean;
}

export class Director {
  private queue: Batch[] = [];
  private run: Run | null = null;
  private celebrating: { color: Color; t: number } | null = null;
  private celebrated: Color | null = null;
  private busy = false;
  /** The newest game this director was given. */
  private latest: GameState | null = null;
  private readonly tumble = createDieTumble();
  private readonly flightPose = [0, 0, 0, 0, 0, 0];

  constructor(
    private readonly view: SceneView,
    private readonly onBusyChange?: (busy: boolean) => void,
    private readonly options: DirectorOptions = {},
  ) {}

  /** Show `game` immediately without celebrating a finished game (mount, reload). */
  reset(game: GameState): void {
    this.latest = game;
    this.celebrated = game.winner;
    this.celebrating = null;
    this.view.setCelebration(null, 0);
    this.snap(game);
  }

  /** Queue a new batch; snaps to the latest state when too many are waiting. */
  push(game: GameState, events: GameEvent[]): void {
    this.latest = game;
    this.queue.push({ game, events });
    if (this.queue.length > MAX_WAITING) {
      const latest = this.queue[this.queue.length - 1];
      if (latest) this.snap(latest.game);
      return;
    }
    this.notify();
  }

  /**
   * Ends the game on the board: whatever is still animating is skipped, the die and any celebration go,
   * and every horse outside its stable flies home, one taking off after the other (a plain slide in
   * reduced motion). The board then shows that game with every horse in its stable until the next
   * `push` or `reset`. Returns the seconds it takes; 0 when every horse is home already.
   */
  sendHome(): number {
    const flying = this.run?.segs[this.run.i];
    if (this.run && flying?.k === 'home') return flying.dur - this.run.t;
    const game = this.latest;
    if (!game) return 0;
    const rest: GameState = {
      ...game,
      horses: game.horses.map((row) => row.map(() => POS_STABLE)),
      phase: 'finished',
      dice: null,
      legalHorses: [],
    };
    this.latest = rest;
    this.queue = [];
    this.run = null;
    this.reconcile(game, false);
    this.celebrating = null;
    this.view.setCelebration(null, 0);
    this.view.setActive(null);
    this.view.setDie(false, 0, 0, 0, 0, 0, 0);

    const out: { color: Color; horse: number; pos: HorsePos }[] = [];
    for (const color of game.colors) {
      game.horses[color]?.forEach((pos, horse) => {
        if (pos !== POS_STABLE) out.push({ color, horse, pos });
      });
    }
    const reduced = this.options.reducedMotion?.() ?? false;
    const dur = flyHomeSeconds(out.length, reduced);
    if (out.length > 0) {
      const flights = out.map(({ color, horse, pos }, index) => {
        const from = horseGround(color, horse, pos);
        const to = stableSlot(color, horse);
        return {
          color,
          horse,
          fromX: from.x,
          fromZ: from.z,
          toX: to.x,
          toZ: to.z,
          yawFrom: restYaw(color, horse, pos),
          yawTo: restYaw(color, horse, POS_STABLE),
          delay: flyHomeDelay(index, out.length),
        };
      });
      this.run = { batch: { game: rest, events: [] }, segs: [{ k: 'home', flights, reduced, dur }], i: 0, t: 0, started: false, cues: 0, hadRoll: false };
    }
    this.notify();
    return dur;
  }

  private snap(game: GameState): void {
    this.queue = [];
    this.run = null;
    this.reconcile(game, false);
    this.notify();
  }

  get isBusy(): boolean {
    return this.run !== null || this.queue.length > 0;
  }

  update(dtSeconds: number): void {
    this.tickCelebration(dtSeconds);
    let left = Math.min(dtSeconds, MAX_DT);
    for (;;) {
      if (!this.run) {
        const next = this.queue.shift();
        if (!next) break;
        this.run = this.begin(next);
      }
      const run = this.run;
      const seg = run.segs[run.i];
      if (!seg) {
        this.reconcile(run.batch.game, run.hadRoll);
        this.run = null;
        continue;
      }
      if (!run.started) {
        run.started = true;
        this.startSeg(seg);
        this.cue(run, seg, 0);
      }
      const remaining = seg.dur - run.t;
      if (left < remaining) {
        run.t += left;
        this.applySeg(seg, run.t);
        this.cue(run, seg, run.t);
        break;
      }
      left -= remaining;
      this.cue(run, seg, seg.dur);
      this.finishSeg(seg);
      run.i++;
      run.t = 0;
      run.started = false;
      run.cues = 0;
    }
    this.notify();
  }

  private notify(): void {
    const busy = this.isBusy;
    if (busy !== this.busy) {
      this.busy = busy;
      this.onBusyChange?.(busy);
    }
  }

  private begin(batch: Batch): Run {
    const segs: Seg[] = [];
    const reduced = this.options.reducedMotion?.() ?? false;
    let hadRoll = false;
    let actions = 0;
    for (const e of batch.events) {
      if (e.type === 'rolled') {
        hadRoll = true;
        actions++;
        segs.push({ k: 'roll', color: e.color, dice: e.dice, reduced, dur: reduced ? REDUCED_ROLL_SECONDS : ROLL_SECONDS });
      } else if (e.type === 'moved') {
        actions++;
        // The die stays at rest through the move; a batch that moves has consumed its roll.
        if (hadRoll) hadRoll = false;
        if (segs[segs.length - 1]?.k === 'roll') segs.push({ k: 'hold', dur: ROLL_HOLD_SECONDS });
        segs.push(this.planMove(e, reduced));
      } else if (e.type === 'turn') {
        segs.push({ k: 'turn', color: e.color, dur: 0 });
      } else {
        segs.push({ k: 'win', color: e.color, dur: 0 });
      }
    }
    let total = 0;
    let fixed = 0;
    for (const s of segs) {
      total += s.dur;
      if (s.k === 'move' && s.kicked) fixed += s.stopDur;
    }
    const budget = (this.options.budgetPerSegment ?? BATCH_BUDGET) * Math.max(1, actions);
    if (total > budget) {
      // Everything but the hit-stop shrinks by the same factor, so the batch lasts exactly its budget.
      const scale = Math.max(0, budget - fixed) / (total - fixed);
      for (const s of segs) {
        if (s.k === 'move') timeMove(s, scale);
        else s.dur *= scale;
      }
    }
    return { batch, segs, i: 0, t: 0, started: false, cues: 0, hadRoll };
  }

  private planMove(e: Extract<GameEvent, { type: 'moved' }>, reduced: boolean): MoveSeg {
    const fromStable = e.from < 0;
    const hops = fromStable ? 1 : Math.max(1, e.to - e.from);
    const seg: MoveSeg = {
      k: 'move',
      color: e.color,
      horse: e.horse,
      from: e.from,
      to: e.to,
      hops,
      kicked: e.kicked,
      reduced,
      crouchDur: 0,
      hopDur: 0,
      lastHopDur: 0,
      settleDur: 0,
      stopDur: 0,
      kickDur: 0,
      hopsDur: 0,
      contactAt: 0,
      soundAt: 0,
      dur: 0,
    };
    if (reduced) {
      seg.hopDur = Math.min(MAX_SLIDE_SECONDS, SLIDE_SECONDS_PER_CELL * hops + 0.1) / hops;
      seg.lastHopDur = seg.hopDur;
      seg.kickDur = e.kicked ? SLIDE_HOME_SECONDS : 0;
    } else if (e.kicked) {
      seg.crouchDur = KICK_CROUCH_SECONDS;
      seg.hopDur = hops > 1 ? Math.min(MAX_RUN_HOP_SECONDS, KICK_RUN_SECONDS / (hops - 1)) : 0;
      seg.lastHopDur = fromStable ? STABLE_EXIT_SECONDS : POUNCE_SECONDS;
      seg.settleDur = SETTLE_SECONDS;
      seg.stopDur = HIT_STOP_SECONDS;
      seg.kickDur = KNOCKBACK_SECONDS;
    } else {
      seg.crouchDur = CROUCH_SECONDS;
      seg.hopDur = fromStable ? STABLE_EXIT_SECONDS : Math.min(MAX_HOP_SECONDS, MOVE_HOPS_SECONDS / hops);
      seg.lastHopDur = seg.hopDur;
      seg.settleDur = SETTLE_SECONDS;
    }
    return timeMove(seg);
  }

  private startSeg(seg: Seg): void {
    if (seg.k === 'turn') this.view.setActive(seg.color);
    else if (seg.k === 'win') this.startCelebration(seg.color);
    else if (seg.k === 'move' && seg.kicked && !seg.reduced) {
      const g = horseGround(seg.kicked.color, seg.kicked.horse, seg.kicked.from);
      this.view.kickStarted(g.x, g.z, seg.contactAt);
    }
  }

  /** Send the view each cue of a move once, when the segment clock `t` reaches it. */
  private cue(run: Run, seg: Seg, t: number): void {
    if (seg.k !== 'move') return;
    if (!(run.cues & CUE_SOUND) && t >= seg.soundAt) {
      run.cues |= CUE_SOUND;
      const gap = seg.hops > 1 ? seg.hopDur : seg.lastHopDur;
      this.view.moveStarted(seg.hops, gap, seg.kicked ? seg.contactAt - seg.soundAt : null);
    }
    if (!(run.cues & CUE_CONTACT) && t >= seg.contactAt) {
      run.cues |= CUE_CONTACT;
      if (seg.kicked && !seg.reduced) this.view.kickLanded();
    }
  }

  private applySeg(seg: Seg, t: number): void {
    if (seg.k === 'roll') this.poseDie(seg, t / seg.dur);
    else if (seg.k === 'move') {
      if (seg.reduced) this.poseSlide(seg, t);
      else this.poseMove(seg, t);
    } else if (seg.k === 'home') {
      for (const flight of seg.flights) {
        const p = flyHomePose(this.flightPose, flight, t, seg.reduced);
        this.view.setHorse(flight.color, flight.horse, p[0]!, HORSE_Y + p[1]!, p[2]!, p[3]!, p[4]!, p[5]!);
      }
    }
  }

  private finishSeg(seg: Seg): void {
    if (seg.k === 'roll') {
      this.showDie(seg.color, seg.dice);
    } else if (seg.k === 'move') {
      this.place(seg.color, seg.horse, seg.to);
      if (seg.kicked) this.place(seg.kicked.color, seg.kicked.horse, POS_STABLE);
    } else if (seg.k === 'home') {
      for (const flight of seg.flights) this.place(flight.color, flight.horse, POS_STABLE);
    }
  }

  private place(color: Color, horse: number, pos: HorsePos): void {
    const g = horseGround(color, horse, pos);
    this.view.setHorse(color, horse, g.x, HORSE_Y, g.z, restYaw(color, horse, pos), 0, 1);
  }

  /** Ground point the mover stands on after `step` of its hops (0 = where it starts). */
  private stepGround(seg: MoveSeg, step: number): Vec2 {
    if (seg.from < 0) return horseGround(seg.color, seg.horse, step === 0 ? POS_STABLE : 0);
    return horseGround(seg.color, seg.horse, seg.from + step);
  }

  /** Full motion: crouch, hop cell by cell, settle; a kick freezes at contact, then the victim flies home. */
  private poseMove(seg: MoveSeg, t: number): void {
    const { color, horse, hops } = seg;
    const lastEnergy = hopEnergy(seg.lastHopDur);
    if (t < seg.crouchDur) {
      const u = t / seg.crouchDur;
      const a = this.stepGround(seg, 0);
      const energy = hops > 1 ? hopEnergy(seg.hopDur) : lastEnergy;
      const yaw = lerpAngle(restYaw(color, horse, seg.from), yawBetween(a, this.stepGround(seg, 1)), smoothstep(u));
      this.view.setHorse(color, horse, a.x, HORSE_Y, a.z, yaw, crouchLean(u, energy), crouchStretch(u, energy));
      return;
    }
    if (t < seg.contactAt) {
      const tt = t - seg.crouchDur;
      const h = seg.hopDur > 0 ? Math.min(hops - 1, Math.floor(tt / seg.hopDur)) : hops - 1;
      const last = h === hops - 1;
      const hopDur = last ? seg.lastHopDur : seg.hopDur;
      const u = Math.min(1, (tt - h * seg.hopDur) / hopDur);
      const a = this.stepGround(seg, h);
      const b = this.stepGround(seg, h + 1);
      const energy = last ? lastEnergy : hopEnergy(hopDur);
      const pounce = last && seg.kicked !== null;
      const lift = seg.from < 0 ? STABLE_EXIT_LIFT : pounce ? POUNCE_LIFT : HOP_LIFT * energy;
      let yaw = yawBetween(a, b);
      // After a corner the horse turns into the new direction during the first part of the hop.
      if (h > 0 && u < TURN_SHARE) yaw = lerpAngle(yawBetween(this.stepGround(seg, h - 1), a), yaw, smoothstep(u / TURN_SHARE));
      this.view.setHorse(
        color,
        horse,
        lerp(a.x, b.x, u),
        HORSE_Y + lift * arc(u),
        lerp(a.z, b.z, u),
        yaw,
        hopLean(u, energy) + (pounce ? POUNCE_LEAN * u * u * u : 0),
        hopStretch(u, energy),
      );
      return;
    }
    // Landed. During the hit-stop `since` is negative and both horses hold their contact pose.
    const since = t - seg.contactAt - (seg.kicked ? seg.stopDur : 0);
    const u = since <= 0 ? 0 : Math.min(1, since / seg.settleDur);
    const g = this.stepGround(seg, hops);
    const yaw = lerpAngle(yawBetween(this.stepGround(seg, hops - 1), g), restYaw(color, horse, seg.to), smoothstep(u));
    const lean = seg.kicked ? POUNCE_LEAN * dampedSpring(u, 1, 3) : 0;
    this.view.setHorse(color, horse, g.x, HORSE_Y, g.z, yaw, lean, settleStretch(u, lastEnergy));
    if (seg.kicked) this.poseKnockback(seg.kicked, since, seg.kickDur);
  }

  /** The kicked horse: shoved and tipped while `since` (seconds after the hit-stop) is not positive, then an arc home with a spin. */
  private poseKnockback(k: KickInfo, since: number, kickDur: number): void {
    const a = horseGround(k.color, k.horse, k.from);
    const b = stableSlot(k.color, k.horse);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const shove = HIT_SHOVE / (Math.hypot(dx, dz) || 1);
    const x0 = a.x + dx * shove;
    const z0 = a.z + dz * shove;
    const yaw0 = restYaw(k.color, k.horse, k.from);
    if (since <= 0) {
      this.view.setHorse(k.color, k.horse, x0, HORSE_Y, z0, yaw0, -HIT_TILT, 0.86);
      return;
    }
    const u = Math.min(1, since / kickDur);
    const yaw1 = restYaw(k.color, k.horse, POS_STABLE);
    if (u >= KNOCKBACK_FLIGHT) {
      const landed = (u - KNOCKBACK_FLIGHT) / (1 - KNOCKBACK_FLIGHT);
      this.view.setHorse(k.color, k.horse, b.x, HORSE_Y, b.z, yaw1, 0, 1 - 0.3 * dampedSpring(landed, 1, 3));
      return;
    }
    const f = u / KNOCKBACK_FLIGHT;
    // One extra full turn on the way, and a backward somersault that ends upright.
    this.view.setHorse(
      k.color,
      k.horse,
      lerp(x0, b.x, f),
      HORSE_Y + KNOCKBACK_LIFT * arc(f),
      lerp(z0, b.z, f),
      yaw0 + (angleDelta(yaw0, yaw1) + TAU) * easeOutCubic(f),
      lerp(-HIT_TILT, -TAU, f),
      1 + 0.1 * arc(f),
    );
  }

  /** Reduced motion: the mover slides along its cells, then a kicked horse slides straight home. */
  private poseSlide(seg: MoveSeg, t: number): void {
    const { color, horse, hops } = seg;
    if (t < seg.hopsDur) {
      const p = smoothstep(t / seg.hopsDur) * hops;
      const h = Math.min(hops - 1, Math.floor(p));
      const a = this.stepGround(seg, h);
      const b = this.stepGround(seg, h + 1);
      this.view.setHorse(color, horse, lerp(a.x, b.x, p - h), HORSE_Y, lerp(a.z, b.z, p - h), yawBetween(a, b), 0, 1);
      return;
    }
    this.place(color, horse, seg.to);
    const k = seg.kicked;
    if (!k) return;
    const u = smoothstep((t - seg.hopsDur) / seg.kickDur);
    const a = horseGround(k.color, k.horse, k.from);
    const b = stableSlot(k.color, k.horse);
    this.view.setHorse(k.color, k.horse, lerp(a.x, b.x, u), HORSE_Y, lerp(a.z, b.z, u), restYaw(k.color, k.horse, POS_STABLE), 0, 1);
  }

  private poseDie(seg: Extract<Seg, { k: 'roll' }>, u: number): void {
    const rest: Vec2 | undefined = DIE_REST[seg.color];
    if (!rest) return;
    const norm = Math.hypot(rest.x, rest.z) || 1;
    const [fx, fz] = FACE_TO_TOP[seg.dice];
    if (seg.reduced) {
      // Already showing its face, sliding the last stretch from the board side.
      const far = (1 - smoothstep(u)) * DIE_SLIDE;
      this.view.setDie(true, rest.x - (rest.x / norm) * far, DIE_HALF, rest.z - (rest.z / norm) * far, fx, dieYaw(seg.dice), fz);
      return;
    }
    // Thrown in from the board side: drops, bounces twice, then rocks on an edge until flat.
    const m = dieTumble(u, this.tumble);
    const far = m.travel * DIE_THROW;
    const spin = m.spin * TAU;
    this.view.setDie(
      true,
      rest.x - (rest.x / norm) * far,
      // A tumbling cube needs room for its corners; a rocking one rises on its edge.
      DIE_HALF * (1 + 0.4 * m.spin) + m.lift + tiltedRise(DIE_HALF, m.rock),
      rest.z - (rest.z / norm) * far,
      fx + spin * 2 + m.rock,
      dieYaw(seg.dice) + spin * 1.25,
      fz + spin * 2.5,
    );
  }

  private showDie(color: Color, value: DiceValue): void {
    const rest = DIE_REST[color];
    if (!rest) return;
    const [fx, fz] = FACE_TO_TOP[value];
    this.view.setDie(true, rest.x, DIE_HALF, rest.z, fx, dieYaw(value), fz);
  }

  /** Make the view show exactly `game`; a die from this batch's own roll may stay until the next batch. */
  private reconcile(game: GameState, keepRolledDie: boolean): void {
    for (const color of COLORS) {
      const row = game.horses[color];
      for (let horse = 0; horse < HORSES_PER_COLOR; horse++) {
        const pos = row?.[horse] ?? POS_STABLE;
        this.place(color, horse, pos);
      }
    }
    this.view.setActive(game.winner === null && game.phase !== 'finished' ? game.turn : null);
    if (game.dice !== null) this.showDie(game.turn, game.dice);
    else if (!keepRolledDie) this.view.setDie(false, 0, 0, 0, 0, 0, 0);
    if (game.winner === null) {
      this.celebrated = null;
    } else if (this.celebrated !== game.winner) {
      this.startCelebration(game.winner);
    }
  }

  private startCelebration(color: Color): void {
    this.celebrated = color;
    this.celebrating = { color, t: 0 };
    this.view.setCelebration(color, 0);
  }

  private tickCelebration(dt: number): void {
    const c = this.celebrating;
    if (!c) return;
    c.t += Math.min(dt, MAX_DT);
    if (c.t >= CELEBRATION_SECONDS) {
      this.celebrating = null;
      this.view.setCelebration(null, 0);
    } else {
      this.view.setCelebration(c.color, c.t);
    }
  }
}
