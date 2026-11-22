import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../../shared/game/seeded-random';
import { COLORS, POS_STABLE } from '../../../shared/game/types';
import type { GameState } from '../../../shared/game/types';
import { Director } from '../scene/director';
import type { SceneView } from '../scene/director';
import type { ShowcaseStep } from '../scene/props';
import { showcaseBatches } from '../shell/showcase';
import { DEMO_SEGMENT_SECONDS, DemoDriver, stepSeconds } from './demo-driver';

/** Plays whole CPU turns until the game ends; returns every step, the opening one included. */
function playOut(driver: DemoDriver, limit = 5000): ShowcaseStep[] {
  const steps = [driver.getStep()];
  while (!driver.finished && steps.length < limit) steps.push(driver.playTurn());
  return steps;
}

/** The horses of `before` after the moves reported in `step`. */
function replay(before: GameState, step: ShowcaseStep): number[][] {
  const horses = before.horses.map((row) => row.slice());
  for (const e of step.events) {
    if (e.type !== 'moved') continue;
    expect(horses[e.color]![e.horse], 'a move starts where the horse stood').toBe(e.from);
    horses[e.color]![e.horse] = e.to;
    if (e.kicked) {
      expect(horses[e.kicked.color]![e.kicked.horse]).toBe(e.kicked.from);
      horses[e.kicked.color]![e.kicked.horse] = POS_STABLE;
    }
  }
  return horses;
}

afterEach(() => vi.unstubAllGlobals());

describe('DemoDriver', () => {
  it('plays a four-colour game to its end in steps whose events lead exactly to their state', () => {
    const driver = new DemoDriver({ seed: 5, variant: 'quick' });
    const steps = playOut(driver);
    expect(driver.finished).toBe(true);
    expect(steps[0]!.game.colors).toEqual([...COLORS]);
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i]!;
      expect(step.seq).toBe(steps[i - 1]!.seq + 1);
      expect(step.events[0]?.type).toBe('rolled');
      expect(replay(steps[i - 1]!.game, step)).toEqual(step.game.horses);
    }
    const last = steps[steps.length - 1]!;
    expect(last.events.at(-1)).toEqual({ type: 'won', color: last.game.winner });
  });

  it('also plays a classic game to its end', () => {
    const driver = new DemoDriver({ seed: 2 });
    playOut(driver, 20_000);
    expect(driver.game.winner).not.toBeNull();
  });

  it('plays the same game for the same seed and another for another', () => {
    const a = playOut(new DemoDriver({ seed: 42, variant: 'quick' }));
    const b = playOut(new DemoDriver({ seed: 42, variant: 'quick' }));
    const c = playOut(new DemoDriver({ seed: 43, variant: 'quick' }));
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('draws one die per roll, in the order of its seed', () => {
    const driver = new DemoDriver({ seed: 9 });
    const rand = mulberry32(9);
    for (let i = 0; i < 40; i++) {
      const step = driver.game.phase === 'roll' ? driver.roll() : driver.cpuMove();
      const rolled = step.events.find((e) => e.type === 'rolled');
      if (rolled?.type === 'rolled') expect(rolled.dice).toBe(1 + Math.floor(rand() * 6));
    }
  });

  it('keeps its steps as batches the board accepts: in order, newest last, bounded', () => {
    const driver = new DemoDriver({ seed: 3, variant: 'quick', history: 4 });
    for (let i = 0; i < 10; i++) driver.playTurn();
    const batches = showcaseBatches({ key: 'demo', steps: driver.getSteps(), quick: true });
    expect(batches).toHaveLength(4);
    expect(batches.map((b) => b.room.seq)).toEqual([8, 9, 10, 11]);
    expect(batches.at(-1)!.room.game).toBe(driver.game);
    expect(batches.every((b) => b.room.settings.quick)).toBe(true);
  });

  it('tells its subscribers about every step with a new list', () => {
    const driver = new DemoDriver({ seed: 3 });
    const seen: ShowcaseStep[][] = [];
    const stop = driver.subscribe(() => seen.push(driver.getSteps()));
    driver.roll();
    stop();
    driver.park();
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBe(driver.getSteps());
  });

  it('starts parked on request, and deals the first game with its own seed', () => {
    const parked = new DemoDriver({ seed: 42, variant: 'quick', parked: true });
    expect(parked.parked).toBe(true);
    expect(parked.game.horses.flat().every((pos) => pos === POS_STABLE)).toBe(true);
    expect(() => parked.playTurn()).toThrow();
    parked.deal();
    const dealt = playOut(parked).slice(1);
    const direct = playOut(new DemoDriver({ seed: 42, variant: 'quick' })).slice(1);
    expect(dealt.map((s) => s.events)).toEqual(direct.map((s) => s.events));
  });

  it('deals onto a board at rest with the moves that bring the starting horses out', () => {
    const driver = new DemoDriver({ seed: 1, variant: 'quick', parked: true });
    const rest = driver.game;
    const step = driver.deal();
    const moves = step.events.filter((e) => e.type === 'moved');
    expect(moves).toHaveLength(4);
    expect(replay(rest, step)).toEqual(step.game.horses);
    expect(step.events.at(-1)).toEqual({ type: 'turn', color: step.game.turn, extraRoll: false });
  });

  it('deals over a game in progress without events, with the next seed unless one is given', () => {
    const driver = new DemoDriver({ seed: 7 });
    driver.roll();
    expect(driver.deal().events).toEqual([]);
    expect(driver.actions).toBe(0);
    const second = playOut(driver, 60).map((s) => s.events);
    expect(second).toEqual(playOut(new DemoDriver({ seed: 8 }), 60).map((s) => s.events));
    driver.deal({ seed: 7, colors: [0, 2] });
    expect(driver.game.colors).toEqual([0, 2]);
  });

  it('parks once: every horse home, nothing to play, no second step', () => {
    const driver = new DemoDriver({ seed: 4, variant: 'quick' });
    driver.playTurn();
    const parked = driver.park();
    expect(parked.game.horses.flat().every((pos) => pos === POS_STABLE)).toBe(true);
    expect(parked.events).toEqual([]);
    expect(driver.park()).toBe(parked);
  });

  it('moves the horse a person picked, and refuses an illegal one', () => {
    const driver = new DemoDriver({ seed: 1, variant: 'quick' });
    while (driver.game.phase !== 'move') driver.roll();
    const legal = driver.game.legalHorses[0]!;
    const illegal = [0, 1, 2, 3].find((h) => !driver.game.legalHorses.includes(h));
    if (illegal !== undefined) expect(() => driver.move(illegal)).toThrow();
    expect(driver.move(legal).events[0]).toMatchObject({ type: 'moved', horse: legal });
  });

  it('never touches the network', () => {
    const network = vi.fn(() => {
      throw new Error('the demo must stay in the browser');
    });
    vi.stubGlobal('fetch', network);
    vi.stubGlobal('WebSocket', network);
    vi.stubGlobal('XMLHttpRequest', network);
    vi.stubGlobal('EventSource', network);
    vi.stubGlobal('navigator', { sendBeacon: network });
    const driver = new DemoDriver({ seed: 11, variant: 'quick', parked: true });
    for (let game = 0; game < 3; game++) {
      driver.deal();
      playOut(driver);
      driver.park();
    }
    expect(network).not.toHaveBeenCalled();
  });

  it('gives the board time for every animated segment of a step', () => {
    const driver = new DemoDriver({ seed: 1, variant: 'quick', parked: true });
    expect(stepSeconds(driver.getStep())).toBe(DEMO_SEGMENT_SECONDS);
    expect(stepSeconds(driver.deal())).toBeCloseTo(4 * DEMO_SEGMENT_SECONDS, 9);
  });

  it('paces its steps so the board animates each one without falling behind', () => {
    const view: SceneView = {
      setHorse() {},
      setDie() {},
      setActive() {},
      setCelebration() {},
      moveStarted() {},
      kickStarted() {},
      kickLanded() {},
    };
    const director = new Director(view, undefined, { budgetPerSegment: 0.35 });
    const driver = new DemoDriver({ seed: 11, variant: 'quick', parked: true });
    director.reset(driver.game);
    let step = driver.deal();
    for (let i = 0; i < 400 && !driver.finished; i++) {
      director.push(step.game, step.events);
      for (let t = 0; t < stepSeconds(step) - 1e-9; t += 1 / 60) director.update(1 / 60);
      expect(director.isBusy, `step ${step.seq} still animating`).toBe(false);
      step = driver.playTurn();
    }
  });
});
