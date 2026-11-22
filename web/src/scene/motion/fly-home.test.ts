import { describe, expect, it } from 'vitest';
import {
  FLY_HOME_FLIGHT_SECONDS,
  FLY_HOME_SLIDE_SECONDS,
  FLY_HOME_STAGGER_SECONDS,
  flyHomeDelay,
  flyHomePose,
  flyHomeSeconds,
} from './fly-home';
import type { HomeFlight } from './fly-home';

const flight: HomeFlight = { fromX: 4, fromZ: -2, toX: -5, toZ: 6, yawFrom: 0.4, yawTo: 2.1, delay: 0.2 };
const pose = (t: number, reduced = false) => flyHomePose([], flight, t, reduced);

describe('fly home', () => {
  it('lasts between 0.8 and 1.2 seconds for a board with several horses out', () => {
    for (const count of [2, 5, 16]) {
      expect(flyHomeSeconds(count)).toBeGreaterThanOrEqual(0.8);
      expect(flyHomeSeconds(count)).toBeLessThanOrEqual(1.2);
    }
    expect(flyHomeSeconds(1)).toBe(FLY_HOME_FLIGHT_SECONDS);
    expect(flyHomeSeconds(0)).toBe(0);
  });

  it('staggers the take-offs evenly from the first to the last', () => {
    expect(flyHomeDelay(0, 1)).toBe(0);
    expect(flyHomeDelay(0, 5)).toBe(0);
    expect(flyHomeDelay(4, 5)).toBeCloseTo(FLY_HOME_STAGGER_SECONDS, 9);
    expect(flyHomeDelay(2, 5)).toBeCloseTo(FLY_HOME_STAGGER_SECONDS / 2, 9);
    for (let i = 0; i < 16; i++) expect(flyHomeDelay(i, 16) + FLY_HOME_FLIGHT_SECONDS).toBeLessThanOrEqual(flyHomeSeconds(16) + 1e-9);
  });

  it('waits on its cell until its take-off', () => {
    expect(pose(0)).toEqual([4, 0, -2, 0.4, 0, 1]);
    expect(pose(flight.delay)).toEqual([4, 0, -2, 0.4, 0, 1]);
  });

  it('ends standing in its stable, upright and at its own size', () => {
    const end = pose(flight.delay + FLY_HOME_FLIGHT_SECONDS);
    expect(end).toEqual([-5, 0, 6, 2.1, 0, 1]);
    expect(pose(10)).toEqual(end);
  });

  it('flies one arc: up, over, and down, never below the board', () => {
    let peak = 0;
    let previousX = 4;
    for (let t = 0; t <= 1; t += 1 / 120) {
      const p = pose(t);
      expect(p[1]).toBeGreaterThanOrEqual(0);
      expect(p[0]).toBeLessThanOrEqual(previousX + 1e-9);
      previousX = p[0]!;
      peak = Math.max(peak, p[1]!);
    }
    expect(peak).toBeGreaterThan(1.5);
    expect(peak).toBeLessThanOrEqual(3.2);
  });

  it('slides flat and straight in reduced motion, everyone together', () => {
    expect(flyHomeSeconds(9, true)).toBe(FLY_HOME_SLIDE_SECONDS);
    const mid = pose(FLY_HOME_SLIDE_SECONDS / 2, true);
    expect(mid[0]).toBeCloseTo(-0.5, 9);
    expect(mid[1]).toBe(0);
    expect(mid[4]).toBe(0);
    expect(mid[5]).toBe(1);
    expect(pose(FLY_HOME_SLIDE_SECONDS, true)).toEqual([-5, 0, 6, 2.1, 0, 1]);
  });
});
