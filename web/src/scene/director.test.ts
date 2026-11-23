import { Euler, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyMove, applyRoll, createGame } from '../../../shared/game/engine';
import { chooseCpuMove } from '../../../shared/game/cpu';
import { DEFAULT_PACE, PACES, PACE_NAMES, animationSeconds, pauseSeconds } from '../../../shared/game/pace';
import type { PaceTimings } from '../../../shared/game/pace';
import type { Color, DiceValue, GameEvent, GameState, HorsePos } from '../../../shared/game/types';
import { CELEBRATION_SECONDS, DIE_HALF, Director, HORSE_Y, MAX_WAITING } from './director';
import type { DirectorOptions, SceneView } from './director';
import { TRACK, groundHeight, horseGround } from './layout';

interface HorsePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  stretch: number;
}

class FakeView implements SceneView {
  horses = new Map<string, HorsePose>();
  die = { visible: false, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  active: Color | null = null;
  celebration: Color | null = null;
  maxY = 0;
  minStretch = 1;
  maxStretch = 1;
  maxLean = 0;
  maxDieY = 0;
  minDieY = Infinity;

  setHorse(color: Color, horse: number, x: number, y: number, z: number, yaw: number, pitch: number, stretch: number) {
    this.horses.set(`${color}:${horse}`, { x, y, z, yaw, pitch, stretch });
    this.maxY = Math.max(this.maxY, y);
    this.minStretch = Math.min(this.minStretch, stretch);
    this.maxStretch = Math.max(this.maxStretch, stretch);
    this.maxLean = Math.max(this.maxLean, Math.abs(pitch));
  }
  setDie(visible: boolean, x: number, y: number, z: number, rx: number, ry: number, rz: number) {
    this.die = { visible, x, y, z, rx, ry, rz };
    if (visible) {
      this.maxDieY = Math.max(this.maxDieY, y);
      this.minDieY = Math.min(this.minDieY, y);
    }
  }
  setActive(color: Color | null) {
    this.active = color;
  }
  setCelebration(color: Color | null) {
    this.celebration = color;
  }
  moves: { hops: number; hopSeconds: number; kickAt: number | null }[] = [];
  moveStarted(hops: number, hopSeconds: number, kickAt: number | null) {
    this.moves.push({ hops, hopSeconds, kickAt });
  }
  kicks: { x: number; z: number; contactIn: number }[] = [];
  contacts = 0;
  kickStarted(x: number, z: number, contactIn: number) {
    this.kicks.push({ x, z, contactIn });
  }
  kickLanded() {
    this.contacts++;
  }

  /** Every horse of the colours in play stands exactly where `game` says, upright and at its own size. */
  expectShows(game: GameState) {
    for (const color of game.colors) {
      game.horses[color]!.forEach((pos: HorsePos, horse) => {
        const want = horseGround(color, horse, pos);
        const got = this.horses.get(`${color}:${horse}`);
        expect(got, `horse ${color}:${horse}`).toBeDefined();
        expect(got!.x).toBeCloseTo(want.x, 6);
        expect(got!.z).toBeCloseTo(want.z, 6);
        expect(got!.y).toBeCloseTo(HORSE_Y + groundHeight(pos), 6);
        expect(got!.pitch).toBe(0);
        expect(got!.stretch).toBe(1);
      });
    }
  }
}

/** A two-player position where red's horse 0 kicks blue's horse 0 by moving `hops` cells. */
function kickSetup(hops: DiceValue, variant: 'classic' | 'quick' = 'classic') {
  const base = createGame([0, 2], variant);
  const horses = base.horses.map((row) => row.slice());
  horses[0] = [1, -1, -1, -1];
  // Blue's track positions are red's shifted by half the loop.
  horses[2] = [29 + hops, -1, -1, -1];
  const before: GameState = { ...base, horses, turn: 0, phase: 'move', dice: hops, legalHorses: [0] };
  const moved = applyMove(before, 0);
  const event = moved.events.find((e) => e.type === 'moved');
  if (event?.type !== 'moved' || !event.kicked) throw new Error('setup does not kick');
  return { before, after: moved.state, events: moved.events };
}

/** The pace a director plays at unless told otherwise, and the quick one of the same profile. */
const NORMAL = PACES[DEFAULT_PACE].normal;
const QUICK = PACES[DEFAULT_PACE].quick;
/** One 60 Hz frame: how far `drain` can overshoot the true length of an animation. */
const FRAME = 1 / 60;

/** Advance the clock in 16 ms frames until idle; returns elapsed seconds. */
function drain(d: Director, limit = 30): number {
  let t = 0;
  while (d.isBusy && t < limit) {
    d.update(1 / 60);
    t += 1 / 60;
  }
  return t;
}

/** Play a few real turns and return states with the events that led to each. */
function playActions(n: number, colors: Color[] = [0, 1, 2, 3]) {
  let game = createGame(colors);
  let seed = 3;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  const out: { game: GameState; events: GameEvent[] }[] = [];
  for (let i = 0; i < n && game.phase !== 'finished'; i++) {
    const r =
      game.phase === 'roll'
        ? applyRoll(game, (1 + (rnd() % 6)) as DiceValue)
        : applyMove(game, chooseCpuMove(game));
    game = r.state;
    out.push({ game, events: r.events });
  }
  return out;
}

describe('Director', () => {
  it('reports each animated move once, with one hop per cell, and nothing on reset', () => {
    let game = createGame([0, 2]);
    game = applyRoll(game, 6).state;
    game = applyMove(game, 0).state;
    const afterRoll = applyRoll(game, 5);
    const move = applyMove(afterRoll.state, afterRoll.state.legalHorses[0]!);
    const view = new FakeView();
    const d = new Director(view);
    d.reset(afterRoll.state);
    expect(view.moves).toEqual([]);
    d.push(move.state, move.events);
    drain(d);
    expect(view.moves).toHaveLength(1);
    expect(view.moves[0]).toMatchObject({ hops: 5, kickAt: null });
    expect(view.moves[0]!.hopSeconds).toBeGreaterThan(0);
  });

  it('shows the game immediately on reset', () => {
    const view = new FakeView();
    const d = new Director(view);
    const steps = playActions(40);
    const last = steps[steps.length - 1]!.game;
    d.reset(last);
    view.expectShows(last);
    expect(d.isBusy).toBe(false);
  });

  it('plays every action batch for the time the shared pace model says and ends on the exact state', () => {
    for (const { game, events } of playActions(300)) {
      const view = new FakeView();
      const d = new Director(view);
      d.reset(createGame(game.colors)); // irrelevant start; the batch then reconciles
      d.push(game, events);
      const took = drain(d);
      const planned = animationSeconds(events, NORMAL);
      expect(took).toBeGreaterThanOrEqual(planned - 1e-6);
      expect(took).toBeLessThanOrEqual(planned + 2 * FRAME);
      view.expectShows(game);
      expect(d.isBusy).toBe(false);
    }
  });

  it('hops cell by cell: a move of 5 cells passes over every cell on the way', () => {
    // Start from a state with a horse on the track, then watch it move 5.
    let game = createGame([0, 2]);
    game = applyRoll(game, 6).state;
    game = applyMove(game, 0).state; // horse 0 enters, rolled 6 -> rolls again
    const afterRoll = applyRoll(game, 5);
    const before = afterRoll.state;
    const move = applyMove(before, afterRoll.state.legalHorses[0]!);
    const view = new FakeView();
    const d = new Director(view);
    d.reset(before);
    d.push(move.state, move.events);
    const horse = afterRoll.state.legalHorses[0]!;
    const visited = new Set<number>();
    while (d.isBusy) {
      d.update(1 / 120);
      const p = view.horses.get(`0:${horse}`)!;
      // Cell the horse is currently closest to; a hop never skips one.
      let best = 0;
      TRACK.forEach((c, i) => {
        if (Math.hypot(c.x - p.x, c.z - p.z) < Math.hypot(TRACK[best]!.x - p.x, TRACK[best]!.z - p.z)) best = i;
      });
      visited.add(best);
    }
    expect([...visited].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(view.maxY).toBeGreaterThan(HORSE_Y + 0.1);
    view.expectShows(move.state);
  });

  it('does not start a queued batch before the current one ends', () => {
    const steps = playActions(6);
    const view = new FakeView();
    const d = new Director(view);
    d.reset(createGame([0, 1, 2, 3]));
    d.push(steps[0]!.game, steps[0]!.events);
    d.push(steps[1]!.game, steps[1]!.events);
    d.update(0.05);
    expect(d.isBusy).toBe(true);
    drain(d);
    view.expectShows(steps[1]!.game);
  });

  it('snaps to the latest state when more than the allowed batches are waiting', () => {
    const steps = playActions(30);
    const view = new FakeView();
    const d = new Director(view);
    d.reset(createGame([0, 1, 2, 3]));
    d.push(steps[0]!.game, steps[0]!.events);
    d.update(0.02);
    for (let i = 1; i <= MAX_WAITING + 1; i++) d.push(steps[i]!.game, steps[i]!.events);
    expect(d.isBusy).toBe(false);
    view.expectShows(steps[MAX_WAITING + 1]!.game);
  });

  it('highlights the active colour and clears it when the game ends', () => {
    const view = new FakeView();
    const d = new Director(view);
    const game = createGame([0, 2]);
    d.reset(game);
    expect(view.active).toBe(game.turn);
    d.reset({ ...game, phase: 'finished', winner: 2 });
    expect(view.active).toBeNull();
  });

  it('shows the rolled die, and hides it once the turn has moved on', () => {
    const view = new FakeView();
    const d = new Director(view);
    const start = createGame([0, 2]);
    d.reset(start);
    const rolled = applyRoll(start, 6);
    d.push(rolled.state, rolled.events);
    drain(d);
    expect(view.die.visible).toBe(true);
    const moved = applyMove(rolled.state, rolled.state.legalHorses[0]!);
    d.push(moved.state, moved.events);
    drain(d);
    expect(view.die.visible).toBe(false);
  });

  it('plays a combined roll and move as roll, hold, move, then hides the die', () => {
    const view = new FakeView();
    const d = new Director(view);
    const start = createGame([0, 2]);
    d.reset(start);
    const rolled = applyRoll(start, 6);
    const moved = applyMove(rolled.state, rolled.state.legalHorses[0]!);
    d.push(moved.state, [...rolled.events, ...moved.events]);

    // The roll lands, the die is on show while the hold runs, then the horse leaves its stable.
    const rollEnd = NORMAL.roll;
    const holdEnd = rollEnd + NORMAL.rollHold;
    let t = 0;
    const step = () => {
      d.update(1 / 240);
      t += 1 / 240;
    };
    while (t < rollEnd + 0.02) step();
    expect(view.die.visible).toBe(true);
    expect(view.die.y).toBe(DIE_HALF);
    expect(view.maxY).toBeCloseTo(HORSE_Y, 6);
    while (t < holdEnd - 0.02) step();
    expect(view.die.visible).toBe(true);
    expect(view.maxY).toBeCloseTo(HORSE_Y, 6);
    expect(view.moves).toHaveLength(0);
    while (t < holdEnd + NORMAL.crouch + NORMAL.stableExit / 2) step();
    expect(view.maxY).toBeGreaterThan(HORSE_Y + 0.3);
    expect(view.die.visible).toBe(true);

    const total = t + drain(d);
    // The hooves are reported when the horse first lands.
    expect(view.moves).toHaveLength(1);
    expect(total).toBeGreaterThan(holdEnd + NORMAL.stableExit);
    expect(total).toBeLessThanOrEqual(animationSeconds([...rolled.events, ...moved.events], NORMAL) + 2 * FRAME);
    expect(view.die.visible).toBe(false);
    view.expectShows(moved.state);
  });

  it('keeps the die visible after a roll that passes the turn, and stays busy while it is read', () => {
    const view = new FakeView();
    const d = new Director(view);
    const start = createGame([0, 2]);
    d.reset(start);
    const rolled = applyRoll(start, 3); // nobody is out of the stable: no legal move
    expect(rolled.state.dice).toBeNull();
    d.push(rolled.state, rolled.events);
    const took = drain(d);
    expect(took).toBeGreaterThanOrEqual(NORMAL.roll + NORMAL.rollRest - 1e-6);
    expect(view.die.visible).toBe(true);
  });

  it('does not hold up a roll that leaves the player a horse to pick', () => {
    let game = createGame([0, 2]);
    game = applyRoll(game, 6).state;
    game = applyMove(game, 0).state;
    const rolled = applyRoll(game, 6); // one horse out, three in the stable: a choice
    expect(rolled.state.phase).toBe('move');
    const d = new Director(new FakeView());
    d.reset(game);
    d.push(rolled.state, rolled.events);
    expect(drain(d)).toBeLessThanOrEqual(NORMAL.roll + 2 * FRAME);
  });

  it('celebrates a win when it arrives through events and ends the effect on its own', () => {
    const base = createGame([0, 2]);
    const horses = base.horses.map((row) => row.slice());
    horses[0] = [59, 60, 61, 55];
    let game: GameState = { ...base, horses, phase: 'move', dice: 3, legalHorses: [3] };
    const moved = applyMove(game, 3);
    expect(moved.state.winner).toBe(0);
    const view = new FakeView();
    const d = new Director(view);
    d.reset(game);
    d.push(moved.state, moved.events);
    drain(d);
    expect(view.celebration).toBe(0);
    for (let t = 0; t < CELEBRATION_SECONDS + 0.5; t += 1 / 30) d.update(1 / 30);
    expect(view.celebration).toBeNull();
    game = moved.state;
    view.expectShows(game);
  });

  it('does not celebrate when mounted on an already finished game', () => {
    const base = createGame([0, 2]);
    const view = new FakeView();
    const d = new Director(view);
    d.reset({ ...base, phase: 'finished', winner: 0 });
    expect(view.celebration).toBeNull();
  });
  describe('quick pace', () => {
    const quick = (): DirectorOptions => ({ pace: QUICK });

    it('plays a combined roll and move faster than the normal pace does', () => {
      const start = createGame([0, 2], 'quick');
      const rolled = applyRoll(start, 6);
      const moved = applyMove(rolled.state, rolled.state.legalHorses[0]!);
      const events = [...rolled.events, ...moved.events];
      const view = new FakeView();
      const d = new Director(view, undefined, quick());
      d.reset(start);
      d.push(moved.state, events);
      const took = drain(d);
      expect(took).toBeLessThanOrEqual(animationSeconds(events, QUICK) + 2 * FRAME);
      expect(took).toBeGreaterThan(QUICK.roll + QUICK.rollHold);
      expect(took).toBeLessThan(animationSeconds(events, NORMAL));
      view.expectShows(moved.state);
    });

    it('never snaps when combined batches arrive at the pace of the server', () => {
      let seed = 11;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed;
      };
      const view = new FakeView();
      const d = new Director(view, undefined, quick());
      let game = createGame([0, 1, 2, 3], 'quick');
      d.reset(game);
      let batches = 0;
      let movesPlayed = 0;
      /** The server commits the next batch this long after `events`; by then the board has played them all. */
      const wait = (events: GameEvent[]) => {
        for (let t = 0; t < pauseSeconds(events, QUICK); t += 1 / 60) d.update(1 / 60);
        expect(d.isBusy).toBe(false);
        expect(view.moves).toHaveLength(movesPlayed);
      };
      while (batches < 100) {
        if (game.phase === 'finished') {
          game = createGame([0, 1, 2, 3], 'quick');
          d.reset(game);
          view.moves = [];
          movesPlayed = 0;
        }
        const rolled = applyRoll(game, (1 + (rnd() % 6)) as DiceValue);
        let next = rolled.state;
        let events = rolled.events;
        if (next.phase === 'move' && next.legalHorses.length === 1) {
          const moved = applyMove(next, next.legalHorses[0]!);
          next = moved.state;
          events = [...events, ...moved.events];
        }
        d.push(next, events);
        movesPlayed += events.filter((e) => e.type === 'moved').length;
        game = next;
        batches++;
        wait(events);
        if (game.phase === 'move') {
          const moved = applyMove(game, chooseCpuMove(game));
          d.push(moved.state, moved.events);
          movesPlayed += 1;
          game = moved.state;
          batches++;
          wait(moved.events);
        }
      }
      view.expectShows(game);
    });
  });

  describe('timing contract', () => {
    /** Every pace, in both modes, in full and in reduced motion. */
    const cases: [string, PaceTimings, boolean][] = PACE_NAMES.flatMap((name) =>
      (['normal', 'quick'] as const).flatMap((mode) =>
        [false, true].map((reduced): [string, PaceTimings, boolean] => [`${name} ${mode}${reduced ? ' reduced' : ''}`, PACES[name][mode], reduced]),
      ),
    );

    /** A CPU's roll and move reach the board as one batch; a person's as two. */
    function batchesOfGame(n: number) {
      const out: { game: GameState; events: GameEvent[] }[] = [];
      const steps = playActions(n);
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        const next = steps[i + 1];
        out.push(step);
        if (step.game.phase === 'move' && next) out.push({ game: next.game, events: [...step.events, ...next.events] });
      }
      return out;
    }

    it.each(cases)('%s: every batch of a real game ends before the server commits the next, on the exact state', (_name, pace, reduced) => {
      let kicks = 0;
      let combined = 0;
      for (const { game, events } of batchesOfGame(600)) {
        const view = new FakeView();
        const d = new Director(view, undefined, { pace, reducedMotion: () => reduced });
        d.reset(createGame(game.colors));
        d.push(game, events);
        const took = drain(d);
        expect(took).toBeLessThanOrEqual(pauseSeconds(events, pace) - pace.beat + 2 * FRAME);
        expect(took).toBeLessThan(pauseSeconds(events, pace));
        // Full motion lasts exactly what the server counts on when it starts a person's clock.
        if (!reduced) expect(Math.abs(took - animationSeconds(events, pace))).toBeLessThanOrEqual(2 * FRAME);
        view.expectShows(game);
        if (events.some((e) => e.type === 'moved' && e.kicked)) kicks++;
        if (events.filter((e) => e.type === 'rolled' || e.type === 'moved').length === 2) combined++;
      }
      expect(kicks).toBeGreaterThan(0);
      expect(combined).toBeGreaterThan(0);
    });

    it('Nhanh keeps the flat budgets from before the table: 0.6 s per roll and move, 0.35 s in a quick match', () => {
      for (const [pace, perSegment, pause] of [
        [PACES.nhanh.normal, 0.6, 0.7],
        [PACES.nhanh.quick, 0.35, 0.4],
      ] as const) {
        for (const { game, events } of batchesOfGame(300)) {
          const segments = events.filter((e) => e.type === 'rolled' || e.type === 'moved').length;
          const d = new Director(new FakeView(), undefined, { pace });
          d.reset(createGame(game.colors));
          d.push(game, events);
          expect(drain(d)).toBeLessThanOrEqual(perSegment * segments + 2 * FRAME);
          expect(pauseSeconds(events, pace)).toBeCloseTo(pause * Math.max(1, segments), 9);
        }
      }
    });

    it('a long move takes longer than a short one, and hops a little faster', () => {
      const durations = ([2, 6] as DiceValue[]).map((hops) => {
        const base = createGame([0, 2]);
        const horses = base.horses.map((row) => row.slice());
        horses[0] = [1, -1, -1, -1];
        const before: GameState = { ...base, horses, turn: 0, phase: 'move', dice: hops, legalHorses: [0] };
        const moved = applyMove(before, 0);
        const view = new FakeView();
        const d = new Director(view);
        d.reset(before);
        d.push(moved.state, moved.events);
        const took = drain(d);
        return { took, hopSeconds: view.moves[0]!.hopSeconds };
      });
      expect(durations[1]!.took).toBeGreaterThan(durations[0]!.took);
      expect(durations[1]!.hopSeconds).toBeLessThan(durations[0]!.hopSeconds);
      // Six cells still read as six separate hops: at least 0.1 s each.
      expect(durations[1]!.hopSeconds).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('full motion', () => {
    it('a move crouches, stretches, squashes and leans, and ends upright at rest size', () => {
      const steps = playActions(40);
      const move = steps.find((s) => s.events.some((e) => e.type === 'moved' && e.from >= 0 && e.to - e.from >= 3))!;
      const view = new FakeView();
      const d = new Director(view);
      d.reset(createGame(move.game.colors));
      d.push(move.game, move.events);
      drain(d);
      expect(view.minStretch).toBeLessThan(0.9);
      expect(view.maxStretch).toBeGreaterThan(1.03);
      expect(view.maxLean).toBeGreaterThan(0.05);
      view.expectShows(move.game);
    });

    it('a kick announces its contact, freezes on it, then throws the victim home in an arc', () => {
      const { before, after, events } = kickSetup(4);
      const view = new FakeView();
      const d = new Director(view);
      d.reset(before);
      d.push(after, events);
      const victimCell = horseGround(2, 0, before.horses[2]![0]!);
      expect(view.kicks).toEqual([]);

      const dt = 1 / 240;
      let t = 0;
      let soundAt = -1;
      let contactAt = -1;
      let liftOffAt = -1;
      let victimTop = 0;
      let frozen: HorsePose | null = null;
      while (d.isBusy) {
        d.update(dt);
        t += dt;
        const mover = view.horses.get('0:0')!;
        const victim = view.horses.get('2:0')!;
        if (soundAt < 0 && view.moves.length === 1) soundAt = t;
        if (contactAt < 0 && view.contacts === 1) {
          contactAt = t;
          frozen = { ...mover };
          // The kicker is down on the victim's cell.
          expect(mover.x).toBeCloseTo(victimCell.x, 6);
          expect(mover.z).toBeCloseTo(victimCell.z, 6);
          expect(mover.y).toBeCloseTo(HORSE_Y, 6);
        } else if (contactAt >= 0 && liftOffAt < 0) {
          if (victim.y > HORSE_Y + 1e-6) liftOffAt = t;
          else expect(mover).toEqual(frozen);
        }
        victimTop = Math.max(victimTop, victim.y);
      }
      expect(view.kicks).toHaveLength(1);
      expect(view.kicks[0]!.x).toBeCloseTo(victimCell.x, 6);
      expect(view.kicks[0]!.z).toBeCloseTo(victimCell.z, 6);
      expect(view.contacts).toBe(1);
      // Contact comes when it was announced, for the camera and for the sound.
      expect(contactAt).toBeCloseTo(view.kicks[0]!.contactIn, 1);
      expect(contactAt - soundAt).toBeCloseTo(view.moves[0]!.kickAt!, 1);
      // The freeze at contact lasts the pace's hit-stop.
      expect(liftOffAt - contactAt).toBeGreaterThanOrEqual(NORMAL.hitStop - 0.01);
      expect(liftOffAt - contactAt).toBeLessThanOrEqual(NORMAL.hitStop + 0.015);
      expect(victimTop).toBeGreaterThan(1);
      view.expectShows(after);
    });

    it('keeps the hit-stop at full length when the batch is compressed', () => {
      const { before, after, events } = kickSetup(6, 'quick');
      const view = new FakeView();
      const pace = PACES.nhanh.quick;
      const d = new Director(view, undefined, { pace });
      d.reset(before);
      d.push(after, events);
      const dt = 1 / 240;
      let t = 0;
      let contactAt = -1;
      let liftOffAt = -1;
      while (d.isBusy) {
        d.update(dt);
        t += dt;
        if (contactAt < 0 && view.contacts === 1) contactAt = t;
        if (liftOffAt < 0 && view.horses.get('2:0')!.y > HORSE_Y + 1e-6) liftOffAt = t;
      }
      expect(t).toBeLessThan(0.5);
      expect(liftOffAt - contactAt).toBeGreaterThanOrEqual(pace.hitStop - 0.01);
      view.expectShows(after);
    });

    it('the die drops in, bounces, and rests flat with the rolled face up', () => {
      // Face normals of the die model: 1 up, 2 front, 3 right, opposite faces sum to 7.
      const normals: Record<DiceValue, [number, number, number]> = {
        1: [0, 1, 0],
        6: [0, -1, 0],
        2: [0, 0, 1],
        5: [0, 0, -1],
        3: [1, 0, 0],
        4: [-1, 0, 0],
      };
      for (const value of [1, 2, 3, 4, 5, 6] as DiceValue[]) {
        const view = new FakeView();
        const d = new Director(view);
        const start = createGame([0, 2]);
        d.reset(start);
        const rolled = applyRoll(start, value);
        d.push(rolled.state, rolled.events);
        // Count the times the die comes down and goes up again.
        let bounces = 0;
        let falling = true;
        let last = Infinity;
        while (d.isBusy) {
          d.update(1 / 240);
          const y = view.die.y;
          if (falling && y > last + 1e-9) {
            bounces++;
            falling = false;
          } else if (!falling && y < last - 1e-9) {
            falling = true;
          }
          last = y;
        }
        expect(bounces).toBeGreaterThanOrEqual(2);
        expect(view.maxDieY).toBeGreaterThan(DIE_HALF + 1);
        expect(view.minDieY).toBeGreaterThanOrEqual(DIE_HALF);
        expect(view.die.y).toBe(DIE_HALF);
        const up = new Vector3(...normals[value]).applyEuler(new Euler(view.die.rx, view.die.ry, view.die.rz, 'YXZ'));
        expect(up.x).toBeCloseTo(0, 6);
        expect(up.y).toBeCloseTo(1, 6);
        expect(up.z).toBeCloseTo(0, 6);
      }
    });
  });

  describe('reduced motion', () => {
    const reduced = () => ({ reducedMotion: () => true });

    it('slides a kicking move flat along its cells with no hit-stop and no camera cues', () => {
      const { before, after, events } = kickSetup(5);
      const view = new FakeView();
      const d = new Director(view, undefined, reduced());
      d.reset(before);
      d.push(after, events);
      const full = new Director(new FakeView());
      full.reset(before);
      full.push(after, events);
      const visited = new Set<number>();
      let t = 0;
      while (d.isBusy) {
        d.update(1 / 240);
        t += 1 / 240;
        const p = view.horses.get('0:0')!;
        visited.add(TRACK.findIndex((c) => Math.hypot(c.x - p.x, c.z - p.z) < 0.5));
      }
      expect(t).toBeLessThan(drain(full));
      expect(view.maxY).toBeCloseTo(HORSE_Y, 6);
      expect(view.minStretch).toBe(1);
      expect(view.maxStretch).toBe(1);
      expect(view.maxLean).toBe(0);
      expect([...visited].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(view.kicks).toEqual([]);
      expect(view.contacts).toBe(0);
      // Sound still gets its cue.
      expect(view.moves).toHaveLength(1);
      expect(view.moves[0]!.kickAt).toBeGreaterThan(0);
      view.expectShows(after);
    });

    it('shows the die on its face without a throw', () => {
      const view = new FakeView();
      const d = new Director(view, undefined, reduced());
      const start = createGame([0, 2]);
      d.reset(start);
      const rolled = applyRoll(start, 4);
      d.push(rolled.state, rolled.events);
      const took = drain(d);
      expect(took).toBeLessThan(NORMAL.roll);
      expect(view.maxDieY).toBe(DIE_HALF);
      expect(view.die.visible).toBe(true);
    });

    it('asks for the level at each batch, so a change applies to the next one', () => {
      let level = false;
      const steps = playActions(40).filter((s) => s.events.some((e) => e.type === 'moved'));
      const view = new FakeView();
      const d = new Director(view, undefined, { reducedMotion: () => level });
      d.reset(createGame([0, 1, 2, 3]));
      d.push(steps[0]!.game, steps[0]!.events);
      drain(d);
      expect(view.maxY).toBeGreaterThan(HORSE_Y + 0.1);
      view.maxY = 0;
      level = true;
      d.push(steps[1]!.game, steps[1]!.events);
      drain(d);
      expect(view.maxY).toBeCloseTo(HORSE_Y, 6);
    });
  });

  describe('sendHome', () => {
    /** A game some way in, with horses of several colours on the track. */
    function midGame() {
      const steps = playActions(160);
      const game = steps[steps.length - 1]!.game;
      const out = game.horses.flat().filter((pos) => pos >= 0).length;
      expect(out).toBeGreaterThan(2);
      return { steps, game, out };
    }
    const allHome = (game: GameState): GameState => ({ ...game, horses: game.horses.map((row) => row.map(() => -1)) });

    it('flies every horse outside its stable home within 0.8 to 1.2 seconds and reports that time', () => {
      const { game } = midGame();
      const view = new FakeView();
      const d = new Director(view);
      d.reset(game);
      view.maxY = 0;
      const seconds = d.sendHome();
      expect(seconds).toBeGreaterThanOrEqual(0.8);
      expect(seconds).toBeLessThanOrEqual(1.2);
      expect(d.isBusy).toBe(true);
      const elapsed = drain(d);
      expect(elapsed).toBeGreaterThanOrEqual(seconds - 1 / 60);
      expect(elapsed).toBeLessThanOrEqual(seconds + 2 / 60);
      expect(view.maxY).toBeGreaterThan(HORSE_Y + 1);
      view.expectShows(allHome(game));
    });

    it('takes off one horse after the other', () => {
      const { game, out } = midGame();
      const view = new FakeView();
      const d = new Director(view);
      d.reset(game);
      d.sendHome();
      const airborne = () => [...view.horses.values()].filter((h) => h.y > HORSE_Y + 0.01).length;
      for (let i = 0; i < 9; i++) d.update(1 / 60);
      const early = airborne();
      expect(early).toBeGreaterThan(0);
      expect(early).toBeLessThan(out);
      drain(d);
      expect(airborne()).toBe(0);
    });

    it('clears the die, the active colour and a celebration', () => {
      const view = new FakeView();
      const d = new Director(view);
      const rolled = applyRoll(createGame([0, 2]), 6);
      d.reset(rolled.state);
      expect(view.die.visible).toBe(true);
      const moved = applyMove(rolled.state, 0);
      d.push(moved.state, moved.events);
      drain(d);
      view.celebration = 0;
      d.sendHome();
      expect(view.die.visible).toBe(false);
      expect(view.active).toBeNull();
      expect(view.celebration).toBeNull();
      drain(d);
      expect(view.die.visible).toBe(false);
      expect(view.active).toBeNull();
      view.expectShows(allHome(moved.state));
    });

    it('skips what is still queued and flies from the newest game', () => {
      const { steps, game } = midGame();
      const view = new FakeView();
      const d = new Director(view);
      d.reset(steps[steps.length - 3]!.game);
      d.push(steps[steps.length - 2]!.game, steps[steps.length - 2]!.events);
      d.push(game, steps[steps.length - 1]!.events);
      d.update(1 / 60);
      const moves = view.moves.length;
      d.sendHome();
      // The frame it is asked in shows the newest game, every horse still on its cell.
      d.update(0);
      view.expectShows(game);
      drain(d);
      expect(view.moves).toHaveLength(moves);
      view.expectShows(allHome(game));
    });

    it('returns 0 and stays idle when every horse is home already', () => {
      const busy: boolean[] = [];
      const d = new Director(new FakeView(), (b) => busy.push(b));
      expect(d.sendHome()).toBe(0);
      d.reset(createGame([0, 1, 2, 3]));
      expect(d.sendHome()).toBe(0);
      expect(d.isBusy).toBe(false);
      expect(busy).toEqual([]);
    });

    it('reports busy for the length of the flight, and a second request joins it', () => {
      const { game } = midGame();
      const busy: boolean[] = [];
      const d = new Director(new FakeView(), (b) => busy.push(b));
      d.reset(game);
      const seconds = d.sendHome();
      for (let i = 0; i < 30; i++) d.update(1 / 60);
      expect(d.sendHome()).toBeCloseTo(seconds - 0.5, 6);
      drain(d);
      expect(busy).toEqual([true, false]);
      expect(d.sendHome()).toBe(0);
    });

    it('animates the next game from the stables', () => {
      const { game } = midGame();
      const view = new FakeView();
      const d = new Director(view);
      d.reset(game);
      d.sendHome();
      drain(d);
      const fresh = createGame([0, 1, 2, 3], 'quick');
      const events: GameEvent[] = fresh.colors.map((color) => ({ type: 'moved', color, horse: 0, from: -1, to: 0, kicked: null }));
      d.push(fresh, events);
      d.update(1 / 60);
      const first = view.horses.get('0:0')!;
      const stable = horseGround(0, 0, -1);
      expect(Math.hypot(first.x - stable.x, first.z - stable.z)).toBeLessThan(1);
      drain(d);
      expect(view.moves.length).toBe(4);
      view.expectShows(fresh);
    });

    it('slides home flat and quickly in reduced motion', () => {
      const { game } = midGame();
      const view = new FakeView();
      const d = new Director(view, undefined, { reducedMotion: () => true });
      d.reset(game);
      view.maxY = 0;
      expect(d.sendHome()).toBeLessThanOrEqual(0.3);
      drain(d);
      expect(view.maxY).toBeCloseTo(HORSE_Y, 6);
      view.expectShows(allHome(game));
    });
  });
});
