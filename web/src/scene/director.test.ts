import { describe, expect, it } from 'vitest';
import { applyMove, applyRoll, createGame } from '../../../shared/game/engine';
import { chooseCpuMove } from '../../../shared/game/cpu';
import type { Color, DiceValue, GameEvent, GameState, HorsePos } from '../../../shared/game/types';
import { BATCH_BUDGET, CELEBRATION_SECONDS, Director, HORSE_Y, MAX_WAITING } from './director';
import type { SceneView } from './director';
import { TRACK, horseGround } from './layout';

class FakeView implements SceneView {
  horses = new Map<string, { x: number; y: number; z: number }>();
  die = { visible: false, value: null as unknown };
  active: Color | null = null;
  celebration: Color | null = null;
  maxY = 0;

  setHorse(color: Color, horse: number, x: number, y: number, z: number) {
    this.horses.set(`${color}:${horse}`, { x, y, z });
    this.maxY = Math.max(this.maxY, y);
  }
  setDie(visible: boolean, _x: number, y: number) {
    this.die = { visible, value: y };
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

  /** Every horse of the colours in play stands exactly where `game` says. */
  expectShows(game: GameState) {
    for (const color of game.colors) {
      game.horses[color]!.forEach((pos: HorsePos, horse) => {
        const want = horseGround(color, horse, pos);
        const got = this.horses.get(`${color}:${horse}`);
        expect(got, `horse ${color}:${horse}`).toBeDefined();
        expect(got!.x).toBeCloseTo(want.x, 6);
        expect(got!.z).toBeCloseTo(want.z, 6);
        expect(got!.y).toBeCloseTo(HORSE_Y, 6);
      });
    }
  }
}

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

  it('plays every action batch within the time budget and ends on the exact state', () => {
    for (const { game, events } of playActions(300)) {
      const view = new FakeView();
      const d = new Director(view);
      d.reset(createGame(game.colors)); // irrelevant start; the batch then reconciles
      d.push(game, events);
      const took = drain(d);
      expect(took).toBeLessThanOrEqual(BATCH_BUDGET + 0.05);
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

  it('keeps the die visible after a roll that passes the turn', () => {
    const view = new FakeView();
    const d = new Director(view);
    const start = createGame([0, 2]);
    d.reset(start);
    const rolled = applyRoll(start, 3); // nobody is out of the stable: no legal move
    expect(rolled.state.dice).toBeNull();
    d.push(rolled.state, rolled.events);
    drain(d);
    expect(view.die.visible).toBe(true);
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
});
