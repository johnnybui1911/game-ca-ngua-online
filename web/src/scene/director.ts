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

const ROLL_SECONDS = 0.5;
/** Pause after a roll that is followed by its move in the same batch, so the die face can be read. */
const ROLL_HOLD_SECONDS = 0.2;
const MOVE_SECONDS = 0.5;
const MOVE_WITH_KICK_SECONDS = 0.36;
const KICK_SECONDS = 0.22;
const MAX_HOP_SECONDS = 0.16;
/** Longest frame the clock accepts, so a stalled tab cannot fast-forward half a game in one step. */
const MAX_DT = 0.1;

export interface SceneView {
  setHorse(color: Color, horse: number, x: number, y: number, z: number, yaw: number): void;
  /** Euler angles use order YXZ so the yaw never tilts the face on top. */
  setDie(visible: boolean, x: number, y: number, z: number, rx: number, ry: number, rz: number): void;
  setActive(color: Color | null): void;
  /** `t` runs 0..CELEBRATION_SECONDS; a null colour ends the effect. */
  setCelebration(color: Color | null, t: number): void;
  /**
   * A horse starts an animated move of `hops` cell hops, each `hopSeconds` long; when it kicks an
   * opponent, the kick starts `kickAt` seconds from now (null without a kick). For sound.
   */
  moveStarted(hops: number, hopSeconds: number, kickAt: number | null): void;
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

type Seg =
  | { k: 'roll'; color: Color; dice: DiceValue; dur: number }
  | {
      k: 'move';
      color: Color;
      horse: number;
      from: HorsePos;
      to: HorsePos;
      hops: number;
      hopDur: number;
      hopsDur: number;
      kicked: KickInfo | null;
      kickDur: number;
      dur: number;
    }
  | { k: 'hold'; dur: number }
  | { k: 'turn'; color: Color; dur: 0 }
  | { k: 'win'; color: Color; dur: 0 };

interface Run {
  batch: Batch;
  segs: Seg[];
  i: number;
  t: number;
  started: boolean;
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
}

export class Director {
  private queue: Batch[] = [];
  private run: Run | null = null;
  private celebrating: { color: Color; t: number } | null = null;
  private celebrated: Color | null = null;
  private busy = false;

  constructor(
    private readonly view: SceneView,
    private readonly onBusyChange?: (busy: boolean) => void,
    private readonly options: DirectorOptions = {},
  ) {}

  /** Show `game` immediately without celebrating a finished game (mount, reload). */
  reset(game: GameState): void {
    this.celebrated = game.winner;
    this.celebrating = null;
    this.view.setCelebration(null, 0);
    this.snap(game);
  }

  /** Queue a new batch; snaps to the latest state when too many are waiting. */
  push(game: GameState, events: GameEvent[]): void {
    this.queue.push({ game, events });
    if (this.queue.length > MAX_WAITING) {
      const latest = this.queue[this.queue.length - 1];
      if (latest) this.snap(latest.game);
      return;
    }
    this.notify();
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
      }
      const remaining = seg.dur - run.t;
      if (left < remaining) {
        run.t += left;
        this.applySeg(seg, run.t);
        break;
      }
      left -= remaining;
      this.finishSeg(seg);
      run.i++;
      run.t = 0;
      run.started = false;
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
    let hadRoll = false;
    let actions = 0;
    for (const e of batch.events) {
      if (e.type === 'rolled') {
        hadRoll = true;
        actions++;
        segs.push({ k: 'roll', color: e.color, dice: e.dice, dur: ROLL_SECONDS });
      } else if (e.type === 'moved') {
        actions++;
        // The die stays at rest through the move; a batch that moves has consumed its roll.
        if (hadRoll) hadRoll = false;
        if (segs[segs.length - 1]?.k === 'roll') segs.push({ k: 'hold', dur: ROLL_HOLD_SECONDS });
        const hops = e.from < 0 ? 1 : Math.max(1, e.to - e.from);
        const moveTime = e.kicked ? MOVE_WITH_KICK_SECONDS : MOVE_SECONDS;
        const hopDur = Math.min(MAX_HOP_SECONDS, moveTime / hops);
        const kickDur = e.kicked ? KICK_SECONDS : 0;
        segs.push({
          k: 'move',
          color: e.color,
          horse: e.horse,
          from: e.from,
          to: e.to,
          hops,
          hopDur,
          hopsDur: hopDur * hops,
          kicked: e.kicked,
          kickDur,
          dur: hopDur * hops + kickDur,
        });
      } else if (e.type === 'turn') {
        segs.push({ k: 'turn', color: e.color, dur: 0 });
      } else {
        segs.push({ k: 'win', color: e.color, dur: 0 });
      }
    }
    const total = segs.reduce((sum, s) => sum + s.dur, 0);
    const budget = (this.options.budgetPerSegment ?? BATCH_BUDGET) * Math.max(1, actions);
    if (total > budget) {
      const scale = budget / total;
      for (const s of segs) {
        s.dur *= scale;
        if (s.k === 'move') {
          s.hopDur *= scale;
          s.hopsDur *= scale;
          s.kickDur *= scale;
        }
      }
    }
    return { batch, segs, i: 0, t: 0, started: false, hadRoll };
  }

  private startSeg(seg: Seg): void {
    if (seg.k === 'turn') this.view.setActive(seg.color);
    else if (seg.k === 'win') this.startCelebration(seg.color);
    else if (seg.k === 'move') this.view.moveStarted(seg.hops, seg.hopDur, seg.kicked ? seg.hopsDur : null);
  }

  private applySeg(seg: Seg, t: number): void {
    if (seg.k === 'roll') this.poseDie(seg, t / seg.dur);
    else if (seg.k === 'move') this.poseMove(seg, t);
  }

  private finishSeg(seg: Seg): void {
    if (seg.k === 'roll') {
      this.poseDie(seg, 1);
    } else if (seg.k === 'move') {
      this.place(seg.color, seg.horse, seg.to);
      if (seg.kicked) this.place(seg.kicked.color, seg.kicked.horse, POS_STABLE);
    }
  }

  private place(color: Color, horse: number, pos: HorsePos): void {
    const g = horseGround(color, horse, pos);
    this.view.setHorse(color, horse, g.x, HORSE_Y, g.z, restYaw(color, horse, pos));
  }

  private poseMove(seg: Extract<Seg, { k: 'move' }>, t: number): void {
    if (t < seg.hopsDur || !seg.kicked) {
      const h = Math.min(Math.floor(t / seg.hopDur), seg.hops - 1);
      const u = Math.min(1, (t - h * seg.hopDur) / seg.hopDur);
      const fromPos = seg.from < 0 ? POS_STABLE : seg.from + h;
      const toPos = seg.from < 0 ? 0 : seg.from + h + 1;
      const a = horseGround(seg.color, seg.horse, fromPos);
      const b = horseGround(seg.color, seg.horse, toPos);
      const lift = seg.from < 0 ? 0.9 : 0.42;
      this.view.setHorse(
        seg.color,
        seg.horse,
        a.x + (b.x - a.x) * u,
        HORSE_Y + lift * 4 * u * (1 - u),
        a.z + (b.z - a.z) * u,
        yawBetween(a, b),
      );
      return;
    }
    // Mover has landed; the kicked horse flies home.
    this.place(seg.color, seg.horse, seg.to);
    const k = seg.kicked;
    const u = Math.min(1, (t - seg.hopsDur) / seg.kickDur);
    const a = horseGround(k.color, k.horse, k.from);
    const b = stableSlot(k.color, k.horse);
    this.view.setHorse(
      k.color,
      k.horse,
      a.x + (b.x - a.x) * u,
      HORSE_Y + 2.2 * 4 * u * (1 - u),
      a.z + (b.z - a.z) * u,
      restYaw(k.color, k.horse, k.from) + TAU * u,
    );
  }

  private poseDie(seg: Extract<Seg, { k: 'roll' }>, u: number): void {
    const rest: Vec2 | undefined = DIE_REST[seg.color];
    if (!rest) return;
    const norm = Math.hypot(rest.x, rest.z) || 1;
    // Fly in from the board side, bouncing three times and slowing to rest.
    const far = (1 - u) * (1 - u) * 2.4;
    const bounce = Math.abs(Math.sin(Math.PI * (u * 2.5 + 0.5))) * Math.pow(1 - u, 1.5) * 1.7;
    const spin = (1 - u) * (1 - u) * TAU;
    const [fx, fz] = FACE_TO_TOP[seg.dice];
    this.view.setDie(
      true,
      rest.x - (rest.x / norm) * far,
      DIE_HALF + bounce,
      rest.z - (rest.z / norm) * far,
      fx + spin * 3,
      dieYaw(seg.dice) + spin * 2,
      fz + spin * 4,
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
