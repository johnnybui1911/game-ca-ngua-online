/**
 * Turns server batches (`GameState` + the events that led to it) into timed
 * animation. Independent of three.js and React: it drives a `SceneView`, so
 * the queueing, time budget and "end up showing exactly the game" rules are
 * unit-testable.
 */
import { COLORS, HORSES_PER_COLOR, POS_STABLE } from '../../../shared/game/types';
import { DEFAULT_PACE, PACES, animationSeconds, hopsOf, moveTiming, pauseSeconds, restAfterRoll } from '../../../shared/game/pace';
import type { PaceTimings } from '../../../shared/game/pace';
import type { Color, DiceValue, GameEvent, GameState, HorsePos } from '../../../shared/game/types';
import { DIE_REST, groundHeight, horseGround, obstacleHeight, restYaw, stableSlot, yawBetween } from './layout';
import type { Vec2 } from './layout';
import { angleDelta, arc, dampedSpring, easeOutCubic, lerp, lerpAngle, smoothstep } from './motion/curves';
import { createDieTumble, dieTumble, tiltedRise } from './motion/dice';
import { flyHomeDelay, flyHomePose, flyHomeSeconds } from './motion/fly-home';
import type { HomeFlight } from './motion/fly-home';
import { crouchLean, crouchStretch, hopEnergy, hopLean, hopStretch, settleStretch } from './motion/hop';
import { CONTACT_REACH, HEAD_HEIGHT, ROLL_THROUGH, baseFromHead, kickRoll } from './motion/kick-swing';

/** Height of a resting horse base above the board top. */
export const HORSE_Y = 0.07;
/** Half the die edge; a resting die has its centre this high. */
export const DIE_HALF = 0.32;

/** Batches allowed to wait behind the one playing; more than this snaps to the latest state. */
export const MAX_WAITING = 2;
export const CELEBRATION_SECONDS = 3.4;
/** A batch ends at least this long before the server commits the next one. */
const ARRIVAL_MARGIN = 0.05;

const HOP_LIFT = 0.42;
const STABLE_EXIT_LIFT = 0.9;
const POUNCE_LIFT = 0.7;
/** The cinematic kick's leap onto the victim, and how far its sweep shoves the victim aside and tips it, radians. */
const KICK_LEAP = 1.7;
const LATERAL_SHOVE = 0.05;
const HIT_ROLL = 0.45;
const KNOCKBACK_LIFT = 2.2;
/** Radius of the kicker's base for keeping it off the stairs, how far above a tread it rests, and where on the leap the swing is checked. */
const KICK_BASE_RADIUS = 0.4;
const CLEARANCE = 0.02;
const SWING_SAMPLES = [0.3, 0.45, 0.6, 0.75, 0.9, 1] as const;
/** How close the kicker's base, body and head may come to the column of another horse's base, in board units. */
const BASE_CLEAR = 0.85;
const BODY_CLEAR = 0.8;
const HEAD_CLEAR = 0.75;
/** A swing whose worst clash is no more than this is clear; the price of dropping straight down. */
const CLASH_OK = 0.03;
const STRAIGHT_DOWN_PENALTY = 0.25;
/** The cinematic kick: the quick pop the victim makes at contact, how much higher the fling takes it, and how far it tips back. */
const RISE_LIFT = 0.5;
const FLING_LIFT = 3.4;
const RISE_TILT = 0.5;
/** Ground the victim drifts away from the hit during the pop, board units, and the turn it starts spinning by. */
const RISE_DRIFT = 0.15;
const RISE_SPIN = 0.6;
/** Whole extra turns of the fling. */
const FLING_TURNS = 2;
/** How high the victim bounces when it lands, and how long the close-up keeps looking after it has landed. */
const LAND_BOUNCE = 0.22;
const CHASE_TAIL_SECONDS = 0.15;
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
   * `pitch` leans the horse forward (radians, about its own side axis, applied after `yaw`); `roll` (default 0)
   * leans it to its right (positive) or left, about its own forward axis; `stretch` scales its height from the
   * base (1 at rest), the view keeping its volume.
   */
  setHorse(color: Color, horse: number, x: number, y: number, z: number, yaw: number, pitch: number, stretch: number, roll?: number): void;
  /** Euler angles use order YXZ so the yaw never tilts the face on top. */
  setDie(visible: boolean, x: number, y: number, z: number, rx: number, ry: number, rz: number): void;
  setActive(color: Color | null): void;
  /** `t` runs 0..CELEBRATION_SECONDS; a null colour ends the effect. */
  setCelebration(color: Color | null, t: number): void;
  /**
   * A moving horse lands for the first time now, with `hops` landings `hopSeconds` apart in all; when it kicks
   * an opponent, the kick lands `kickAt` seconds from now (null without a kick). With a cinematic kick, `flight`
   * says when (`after` seconds from now) the victim is flung and for how long. For sound.
   */
  moveStarted(hops: number, hopSeconds: number, kickAt: number | null, flight: { after: number; seconds: number } | null): void;
  /**
   * A kick will land on ground point (x, z) in `contactIn` seconds. A cinematic kick asks the camera to hold the
   * close-up for `holdSeconds` after contact (0: for as long as it usually does). Not called in reduced motion.
   */
  kickStarted(x: number, z: number, contactIn: number, holdSeconds: number): void;
  /** The kick announced by `kickStarted` makes contact now. */
  kickLanded(): void;
  /**
   * The victim of a cinematic kick is now at ground point (x, z), `y` above its resting height: the close-up follows
   * it. `flung` once it has left the ground for its flight home: the close-up then pulls back to show it land.
   */
  kickFollow(x: number, z: number, y: number, flung: boolean): void;
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
  /** The victim's slow rise after the freeze; 0 for a plain kick. */
  riseDur: number;
  /** Which side of the kicker (1 its right, -1 its left, 0 straight down) its base hits the victim from: null until chosen. */
  side: number | null;
  /** Ground points of the horses standing around a kick (every horse but the kicker and its victim): the swing keeps clear of them. */
  bystanders: Vec2[];
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
  seg.riseDur *= scale;
  seg.kickDur *= scale;
  seg.hopsDur = (seg.hops - 1) * seg.hopDur + seg.lastHopDur;
  seg.contactAt = seg.crouchDur + seg.hopsDur;
  seg.soundAt = seg.reduced ? 0 : seg.crouchDur + (seg.hops > 1 ? seg.hopDur : seg.lastHopDur);
  seg.dur = seg.contactAt + (seg.kicked ? seg.stopDur + Math.max(seg.riseDur + seg.kickDur, seg.settleDur) : seg.settleDur);
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
  /**
   * Durations of every animation; in a match, the room's pace, which the server spaces its commits by.
   * Default: a normal match at the default pace.
   */
  pace?: PaceTimings;
  /** Asked when a batch starts: true plays it as short plain slides, without hit-stop or camera cues. */
  reducedMotion?: () => boolean;
  /**
   * Asked when a batch starts: false plays a kick plain (a short hit-stop, the victim flying straight home, the
   * close-up as usual) instead of the slow-motion rise and fling. Default: true.
   */
  cinematicKick?: () => boolean;
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
  private readonly swing = [0, 0, 0];
  private readonly head = [0, 0, 0];
  private readonly pace: PaceTimings;

  constructor(
    private readonly view: SceneView,
    private readonly onBusyChange?: (busy: boolean) => void,
    private readonly options: DirectorOptions = {},
  ) {
    this.pace = options.pace ?? PACES[DEFAULT_PACE].normal;
  }

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
    const pace = this.pace;
    let hadRoll = false;
    batch.events.forEach((e, index) => {
      if (e.type === 'rolled') {
        hadRoll = true;
        segs.push({ k: 'roll', color: e.color, dice: e.dice, reduced, dur: reduced ? pace.reducedRoll : pace.roll });
        // The die lies still long enough to be read before its move, or before the turn passes on.
        const rest = restAfterRoll(batch.events, index, pace);
        if (rest > 0) segs.push({ k: 'hold', dur: rest });
      } else if (e.type === 'moved') {
        // The die stays at rest through the move; a batch that moves has consumed its roll.
        if (hadRoll) hadRoll = false;
        segs.push(this.planMove(e, reduced, batch.game));
      } else if (e.type === 'turn') {
        segs.push({ k: 'turn', color: e.color, dur: 0 });
      } else {
        segs.push({ k: 'win', color: e.color, dur: 0 });
      }
    });
    // A full-motion kick is the show of the game: neither the pace's cap nor the pause squeezes it.
    const isKick = (s: Seg): boolean => s.k === 'move' && s.kicked !== null && !s.reduced;
    let total = 0;
    let kick = 0;
    for (const s of segs) {
      total += s.dur;
      if (isKick(s)) kick += s.dur;
    }
    // Never past the pause before the next batch, and never past the pace's own cap per roll and move.
    const budget = Math.min(pauseSeconds(batch.events, pace) - ARRIVAL_MARGIN, animationSeconds(batch.events, pace));
    if (total > budget && total > kick) {
      // Everything but a kick shrinks by the same factor, so the batch lasts exactly its budget.
      const scale = Math.max(0, budget - kick) / (total - kick);
      for (const s of segs) {
        if (isKick(s)) continue;
        if (s.k === 'move') timeMove(s, scale);
        else s.dur *= scale;
      }
    }
    return { batch, segs, i: 0, t: 0, started: false, cues: 0, hadRoll };
  }

  private planMove(e: Extract<GameEvent, { type: 'moved' }>, reduced: boolean, game: GameState): MoveSeg {
    const pace = this.pace;
    const hops = hopsOf(e);
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
      riseDur: 0,
      side: null,
      bystanders: [],
      kickDur: 0,
      hopsDur: 0,
      contactAt: 0,
      soundAt: 0,
      dur: 0,
    };
    if (reduced) {
      seg.hopDur = Math.min(pace.maxSlide, pace.slidePerCell * hops + 0.1) / hops;
      seg.lastHopDur = seg.hopDur;
      seg.kickDur = e.kicked ? pace.slideHome : 0;
    } else {
      const m = moveTiming(e, pace, this.options.cinematicKick?.() ?? true);
      seg.crouchDur = m.crouch;
      seg.hopDur = m.hop;
      seg.lastHopDur = m.lastHop;
      seg.settleDur = m.settle;
      seg.stopDur = m.hitStop;
      seg.riseDur = m.rise;
      seg.kickDur = m.knockback;
    }
    if (e.kicked && !reduced) {
      // The horses standing around the kick: every one out on the board but the kicker and its victim.
      for (const color of game.colors) {
        game.horses[color]?.forEach((pos, horse) => {
          const isKicker = color === e.color && horse === e.horse;
          const isVictim = color === e.kicked!.color && horse === e.kicked!.horse;
          if (pos >= 0 && !isKicker && !isVictim) seg.bystanders.push(horseGround(color, horse, pos));
        });
      }
    }
    return timeMove(seg);
  }

  private startSeg(seg: Seg): void {
    if (seg.k === 'turn') this.view.setActive(seg.color);
    else if (seg.k === 'win') this.startCelebration(seg.color);
    else if (seg.k === 'move' && seg.kicked && !seg.reduced) {
      const g = horseGround(seg.kicked.color, seg.kicked.horse, seg.kicked.from);
      // A cinematic kick keeps the close-up on the victim through its rise and flight.
      const hold = seg.riseDur > 0 ? seg.stopDur + seg.riseDur + seg.kickDur * KNOCKBACK_FLIGHT + CHASE_TAIL_SECONDS : 0;
      this.view.kickStarted(g.x, g.z, seg.contactAt, hold);
    }
  }

  /** Send the view each cue of a move once, when the segment clock `t` reaches it. */
  private cue(run: Run, seg: Seg, t: number): void {
    if (seg.k !== 'move') return;
    if (!(run.cues & CUE_SOUND) && t >= seg.soundAt) {
      run.cues |= CUE_SOUND;
      const gap = seg.hops > 1 ? seg.hopDur : seg.lastHopDur;
      const flight = seg.kicked && seg.riseDur > 0 ? { after: seg.contactAt - t + seg.stopDur + seg.riseDur, seconds: seg.kickDur * KNOCKBACK_FLIGHT } : null;
      this.view.moveStarted(seg.hops, gap, seg.kicked ? seg.contactAt - seg.soundAt : null, flight);
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
    this.view.setHorse(color, horse, g.x, HORSE_Y + groundHeight(pos), g.z, restYaw(color, horse, pos), 0, 1);
  }

  /** Ground point the mover stands on after `step` of its hops (0 = where it starts). */
  private stepGround(seg: MoveSeg, step: number): Vec2 {
    return horseGround(seg.color, seg.horse, this.stepPos(seg, step));
  }

  /** Model position the mover has after `step` of its hops (0 = where it starts). */
  private stepPos(seg: MoveSeg, step: number): HorsePos {
    if (seg.from < 0) return step === 0 ? POS_STABLE : 0;
    return seg.from + step;
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
      this.view.setHorse(color, horse, a.x, HORSE_Y + groundHeight(this.stepPos(seg, 0)), a.z, yaw, crouchLean(u, energy), crouchStretch(u, energy));
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
      // A cinematic kick leaps high with the head to the left and the rear to the right, then the rear whips round
      // to the left and hits with its side, while the head stays on its path.
      const leap = pounce && seg.riseDur > 0;
      const lift = leap ? KICK_LEAP : seg.from < 0 ? STABLE_EXIT_LIFT : pounce ? POUNCE_LIFT : HOP_LIFT * energy;
      let yaw = yawBetween(a, b);
      // After a corner the horse turns into the new direction during the first part of the hop.
      if (h > 0 && u < TURN_SHARE) yaw = lerpAngle(yawBetween(this.stepGround(seg, h - 1), a), yaw, smoothstep(u / TURN_SHARE));
      let x = lerp(a.x, b.x, u);
      let y = HORSE_Y + lerp(groundHeight(this.stepPos(seg, h)), groundHeight(this.stepPos(seg, h + 1)), u) + lift * arc(u);
      let z = lerp(a.z, b.z, u);
      let roll = 0;
      if (leap) {
        // The head drifts out to the side of the victim where its rear is; the rear then whips in from further out.
        const side = this.kickSideOf(seg);
        roll = side * kickRoll(u);
        const base = this.kickBase(seg, u, side, this.swing);
        x = base[0]!;
        z = base[2]!;
        y = Math.max(base[1]!, obstacleHeight(x, z, KICK_BASE_RADIUS) + CLEARANCE);
      }
      this.view.setHorse(
        color,
        horse,
        x,
        y,
        z,
        yaw,
        hopLean(u, energy) + (pounce ? POUNCE_LEAN * u * u * u : 0),
        hopStretch(u, energy),
        roll,
      );
      return;
    }
    // Landed. During the hit-stop `since` is negative and both horses hold their contact pose.
    const since = t - seg.contactAt - (seg.kicked ? seg.stopDur : 0);
    const u = since <= 0 ? 0 : Math.min(1, since / seg.settleDur);
    const g = this.stepGround(seg, hops);
    const travel = yawBetween(this.stepGround(seg, hops - 1), g);
    const yaw = lerpAngle(travel, restYaw(color, horse, seg.to), smoothstep(u));
    const lean = seg.kicked ? POUNCE_LEAN * dampedSpring(u, 1, 3) : 0;
    // A cinematic kicker holds its base against the victim's rear at contact, head leaning away, then steps
    // back to its cell and straightens up as it settles.
    const swung = seg.kicked !== null && seg.riseDur > 0;
    const ground = HORSE_Y + groundHeight(this.stepPos(seg, hops));
    let roll = 0;
    let x = g.x;
    let y = ground;
    let z = g.z;
    let side = 0;
    if (swung) {
      side = this.kickSideOf(seg);
      const rollContact = side * ROLL_THROUGH;
      const base = this.kickBase(seg, 1, side, this.swing);
      const e = smoothstep(u);
      x = lerp(base[0]!, g.x, e);
      z = lerp(base[2]!, g.z, e);
      // Propped up on a tread only while the base still overlaps one on its way back to the cell: the cell itself is clear of the stairs.
      y = Math.max(lerp(base[1]!, ground, e), obstacleHeight(x, z, KICK_BASE_RADIUS) + CLEARANCE);
      roll = rollContact * (1 - e);
    }
    this.view.setHorse(color, horse, x, y, z, yaw, lean, settleStretch(u, lastEnergy), roll);
    // The base hits from the kicker's `side`, (-cos travel, sin travel) times it, so the victim goes the other way.
    if (seg.kicked) this.poseKnockback(seg.kicked, since, seg.riseDur, seg.kickDur, swung ? side * Math.cos(travel) : 0, swung ? -side * Math.sin(travel) : 0);
  }

  /** Where the base of the kicker is at progress `u` of its leap onto the victim, written to `out`: the head swings the rest about its path. */
  private kickBase(seg: MoveSeg, u: number, side: number, out: number[]): number[] {
    const from = this.stepGround(seg, seg.hops - 1);
    const to = this.stepGround(seg, seg.hops);
    const travel = yawBetween(from, to);
    const reach = side * CONTACT_REACH * smoothstep(u);
    const y = HORSE_Y + lerp(groundHeight(this.stepPos(seg, seg.hops - 1)), groundHeight(this.stepPos(seg, seg.hops)), u) + KICK_LEAP * arc(u);
    // The kicker's right is (-cos travel, sin travel) on the ground.
    const headX = lerp(from.x, to.x, u) - Math.cos(travel) * reach;
    const headZ = lerp(from.z, to.z, u) + Math.sin(travel) * reach;
    // The head is the pivot, so it sits on the path (drifted out to the side); the base swings about it.
    this.head[0] = headX;
    this.head[1] = y + HEAD_HEIGHT;
    this.head[2] = headZ;
    return baseFromHead(out, headX, y + HEAD_HEIGHT, headZ, travel, side * kickRoll(u));
  }

  /**
   * The side of the kicker (1 its right, -1 its left) its base hits the victim from, or 0 for a kick straight down onto
   * it. It is the side the victim's rear is on, unless the swing there would go into the stairs or into a horse
   * standing by and the other side would not; with both sides blocked it drops straight down instead, where only
   * the victim is. Chosen once per kick, so the swing never goes through the board or another horse.
   */
  private kickSideOf(seg: MoveSeg): number {
    if (seg.side !== null) return seg.side;
    const k = seg.kicked!;
    const travel = yawBetween(this.stepGround(seg, seg.hops - 1), this.stepGround(seg, seg.hops));
    // The victim faces `yaw`; its rear is the opposite way, (-sin yaw, -cos yaw), and the kicker's right is (-cos travel, sin travel).
    // A victim facing the way the kicker travels has its rear straight behind it: no side is nearer, so take the right.
    const natural = Math.sin(restYaw(k.color, k.horse, k.from) - travel) > -0.05 ? 1 : -1;
    /** How far the swing to `side` goes into the stairs and the horses standing by (board units), at its worst moment. */
    const clash = (side: number) => {
      let worst = 0;
      for (const u of SWING_SAMPLES) {
        const base = this.kickBase(seg, u, side, this.swing);
        let sum = Math.max(0, obstacleHeight(base[0]!, base[2]!, KICK_BASE_RADIUS) - base[1]!);
        for (const other of seg.bystanders) {
          // The base, the middle of the body and the head must each keep clear of the other horse's column.
          const mx = (base[0]! + this.head[0]!) / 2;
          const mz = (base[2]! + this.head[2]!) / 2;
          sum += Math.max(0, BASE_CLEAR - Math.hypot(base[0]! - other.x, base[2]! - other.z));
          sum += Math.max(0, BODY_CLEAR - Math.hypot(mx - other.x, mz - other.z));
          sum += Math.max(0, HEAD_CLEAR - Math.hypot(this.head[0]! - other.x, this.head[2]! - other.z));
        }
        worst = Math.max(worst, sum);
      }
      return worst;
    };
    const first = clash(natural);
    if (first <= CLASH_OK) {
      seg.side = natural;
    } else {
      const otherSide = clash(-natural);
      // Straight down overlaps the victim, which is about to leave: a mild price, paid only when both sides are worse.
      const straight = clash(0) + STRAIGHT_DOWN_PENALTY;
      const best = Math.min(first, otherSide, straight);
      seg.side = best === first ? natural : best === otherSide ? -natural : 0;
    }
    return seg.side;
  }

  /**
   * The kicked horse. While `since` (seconds after the hit-stop) is not positive it is shoved and tipped. A plain
   * kick then arcs home with a spin. A cinematic one (`riseDur` > 0) first floats up slowly, tipping back and
   * starting to turn, then is flung high with two more turns and a somersault, and lands in its stable with a bounce.
   */
  private poseKnockback(k: KickInfo, since: number, riseDur: number, kickDur: number, sideX: number, sideZ: number): void {
    const a = horseGround(k.color, k.horse, k.from);
    const b = stableSlot(k.color, k.horse);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    const shove = HIT_SHOVE / length;
    const x0 = a.x + dx * shove + sideX * LATERAL_SHOVE;
    const z0 = a.z + dz * shove + sideZ * LATERAL_SHOVE;
    const yaw0 = restYaw(k.color, k.horse, k.from);
    // Struck from the side, it tips towards the shove: to its right when that is where the sweep pushes it.
    const roll0 = HIT_ROLL * (-sideX * Math.cos(yaw0) + sideZ * Math.sin(yaw0));
    if (since <= 0) {
      this.view.setHorse(k.color, k.horse, x0, HORSE_Y, z0, yaw0, -HIT_TILT, 0.86, roll0);
      return;
    }
    const yaw1 = restYaw(k.color, k.horse, POS_STABLE);
    if (riseDur > 0) {
      this.poseCinematicKnockback(k, since, riseDur, kickDur, { x0, z0, yaw0, yaw1, drift: RISE_DRIFT / length, dx, dz, b, roll0 });
      return;
    }
    const u = Math.min(1, since / kickDur);
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

  private poseCinematicKnockback(
    k: KickInfo,
    since: number,
    riseDur: number,
    kickDur: number,
    p: { x0: number; z0: number; yaw0: number; yaw1: number; drift: number; dx: number; dz: number; b: Vec2; roll0: number },
  ): void {
    const { b } = p;
    // Where the rise ends and the fling starts from.
    const x1 = p.x0 + p.dx * p.drift;
    const z1 = p.z0 + p.dz * p.drift;
    if (since < riseDur) {
      const u = since / riseDur;
      const e = smoothstep(u);
      const x = lerp(p.x0, x1, e);
      const z = lerp(p.z0, z1, e);
      const lift = RISE_LIFT * e;
      this.view.kickFollow(x, z, lift, false);
      this.view.setHorse(k.color, k.horse, x, HORSE_Y + lift, z, p.yaw0 + RISE_SPIN * u * u, lerp(-HIT_TILT, -RISE_TILT, e), lerp(0.86, 1.12, e), p.roll0 * (1 - e));
      return;
    }
    const u = Math.min(1, (since - riseDur) / kickDur);
    if (u >= KNOCKBACK_FLIGHT) {
      const landed = (u - KNOCKBACK_FLIGHT) / (1 - KNOCKBACK_FLIGHT);
      this.view.kickFollow(b.x, b.z, 0, true);
      this.view.setHorse(
        k.color,
        k.horse,
        b.x,
        HORSE_Y + LAND_BOUNCE * arc(Math.min(1, landed * 1.6)) * (1 - landed),
        b.z,
        p.yaw1,
        0,
        1 - 0.3 * dampedSpring(landed, 1, 3),
      );
      return;
    }
    const f = u / KNOCKBACK_FLIGHT;
    // A fast launch that slows as it comes down; the turn and the somersault end upright.
    const run = 1 - (1 - f) * (1 - f);
    const x = lerp(x1, b.x, run);
    const z = lerp(z1, b.z, run);
    const lift = RISE_LIFT * (1 - f) + FLING_LIFT * arc(f);
    const yawFrom = p.yaw0 + RISE_SPIN;
    this.view.kickFollow(x, z, lift, true);
    this.view.setHorse(
      k.color,
      k.horse,
      x,
      HORSE_Y + lift,
      z,
      yawFrom + (angleDelta(yawFrom, p.yaw1) + TAU * FLING_TURNS) * easeOutCubic(f),
      lerp(-RISE_TILT, -TAU, smoothstep(f)),
      lerp(1.12, 1, f),
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
      const height = lerp(groundHeight(this.stepPos(seg, h)), groundHeight(this.stepPos(seg, h + 1)), p - h);
      this.view.setHorse(color, horse, lerp(a.x, b.x, p - h), HORSE_Y + height, lerp(a.z, b.z, p - h), yawBetween(a, b), 0, 1);
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
