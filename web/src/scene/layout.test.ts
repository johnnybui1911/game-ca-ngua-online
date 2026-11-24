import { describe, expect, it } from 'vitest';
import {
  CELLS_PER_COLOR,
  COLORS,
  HOME_STEPS,
  HORSES_PER_COLOR,
  POS_GATE,
  POS_START,
  POS_STABLE,
  TRACK_LENGTH,
  trackCell,
} from '../../../shared/game/types';
import {
  CELL_RADIUS,
  DAIS_WIDTH,
  DIE_REST,
  GATE_DISTANCE,
  HUB_RING_RADIUS,
  HOME,
  INLAY_HALF_LENGTH,
  INLAY_HALF_WIDTH,
  INLAY_TOP,
  LANE_END,
  LANE_HALF_WIDTH,
  STABLE,
  STABLE_CENTERS,
  STABLE_TRAY_SIZE,
  STAIR_RISE,
  TRACK,
  TRACK_OUTSET,
  TREAD_WIDTH,
  armDirection,
  groundHeight,
  horseGround,
  obstacleHeight,
  restYaw,
  type Vec2,
} from './layout';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const key = (v: Vec2) => `${v.x.toFixed(3)},${v.z.toFixed(3)}`;

describe('track', () => {
  it('has 56 distinct cells', () => {
    expect(TRACK).toHaveLength(TRACK_LENGTH);
    expect(new Set(TRACK.map(key)).size).toBe(TRACK_LENGTH);
  });

  it('is a closed loop with aligned tip rows and evenly spaced inner lanes', () => {
    for (let i = 0; i < TRACK_LENGTH; i++) {
      const a = TRACK[i];
      const b = TRACK[(i + 1) % TRACK_LENGTH];
      const k = i % CELLS_PER_COLOR;
      const spacing = k === 0 || k === CELLS_PER_COLOR - 3
        ? 1 + GATE_DISTANCE - 7 - TRACK_OUTSET
        : k >= CELLS_PER_COLOR - 2 ? 1 + TRACK_OUTSET : 1;
      expect(a && b && dist(a, b)).toBeCloseTo(
        spacing, 9,
      );
    }
  });

  it('is symmetric: each colour sees the same loop turned a quarter turn', () => {
    for (const c of COLORS) {
      for (let k = 0; k < CELLS_PER_COLOR; k++) {
        const base = TRACK[k];
        const here = TRACK[c * CELLS_PER_COLOR + k];
        expect(base && here && Math.hypot(here.x, here.z)).toBeCloseTo(Math.hypot(base!.x, base!.z), 9);
      }
    }
  });
});

describe('gates, entries and home columns', () => {
  for (const c of COLORS) {
    it(`colour ${c}: entry follows the previous gate, gate precedes home step 1`, () => {
      const entry = horseGround(c, 0, POS_START);
      expect(entry).toBe(TRACK[trackCell(c, POS_START)]);
      expect(trackCell(c, POS_START)).toBe(c * CELLS_PER_COLOR);

      const gate = horseGround(c, 0, POS_GATE);
      expect(gate).toBe(TRACK[(c * CELLS_PER_COLOR + TRACK_LENGTH - 1) % TRACK_LENGTH]);
      expect(dist(gate, HOME[c]![0]!)).toBeCloseTo(GATE_DISTANCE - 6, 9);

      // The gate is on the arm axis; the next cell is the outward-offset entry.
      const dir = armDirection(c);
      expect(gate.x * dir.z - gate.z * dir.x).toBeCloseTo(0, 9);
      expect(dist(gate, entry)).toBeCloseTo(1 + TRACK_OUTSET, 9);
      const gateIndex = (c * CELLS_PER_COLOR + TRACK_LENGTH - 1) % TRACK_LENGTH;
      const otherSide = TRACK[(gateIndex + TRACK_LENGTH - 1) % TRACK_LENGTH]!;
      expect(entry.x * dir.x + entry.z * dir.z).toBeCloseTo(GATE_DISTANCE, 9);
      expect(otherSide.x * dir.x + otherSide.z * dir.z).toBeCloseTo(GATE_DISTANCE, 9);
      expect(dist(gate, otherSide)).toBeCloseTo(1 + TRACK_OUTSET, 9);
      expect(GATE_DISTANCE - CELL_RADIUS - LANE_END).toBeCloseTo(
        INLAY_HALF_LENGTH - GATE_DISTANCE - CELL_RADIUS, 9,
      );
    });

    it(`colour ${c}: home column is six unit steps from the gate towards the centre`, () => {
      const column = HOME[c]!;
      expect(column).toHaveLength(HOME_STEPS);
      for (let s = 1; s < HOME_STEPS; s++) {
        expect(dist(column[s - 1]!, column[s]!)).toBeCloseTo(1, 9);
      }
      expect(Math.hypot(column[HOME_STEPS - 1]!.x, column[HOME_STEPS - 1]!.z)).toBeCloseTo(1, 9);
    });
  }

  it('shares no ground position between track cells and home columns', () => {
    const all = [...TRACK, ...HOME.flat()];
    expect(new Set(all.map(key)).size).toBe(all.length);
  });

  it('colour 0 sits nearest the default camera at +z', () => {
    expect(armDirection(0)).toEqual({ x: 0, z: 1 });
  });
});

describe('stables', () => {
  it('hold four distinct slots per colour inside a tray that touches no cell', () => {
    const cells = [...TRACK, ...HOME.flat()];
    const slots = STABLE.flat();
    expect(new Set(slots.map(key)).size).toBe(4 * HORSES_PER_COLOR);
    for (const c of COLORS) {
      const centre = STABLE_CENTERS[c]!;
      const half = STABLE_TRAY_SIZE / 2;
      for (const cell of cells) {
        const inside = Math.abs(cell.x - centre.x) < half + 0.5 && Math.abs(cell.z - centre.z) < half + 0.5;
        expect(inside).toBe(false);
      }
      for (const slot of STABLE[c]!) {
        expect(Math.abs(slot.x - centre.x)).toBeLessThan(half);
        expect(Math.abs(slot.z - centre.z)).toBeLessThan(half);
      }
      // slots are spaced wide enough for a base each
      for (let a = 0; a < 4; a++) {
        for (let b = a + 1; b < 4; b++) {
          expect(dist(STABLE[c]![a]!, STABLE[c]![b]!)).toBeGreaterThan(1.5);
        }
      }
    }
  });

  it('are in distinct corners, next to the colour entry cell', () => {
    expect(new Set(STABLE_CENTERS.map(key)).size).toBe(4);
    for (const c of COLORS) {
      const entry = TRACK[c * CELLS_PER_COLOR]!;
      const mine = dist(STABLE_CENTERS[c]!, entry);
      for (const other of COLORS) {
        if (other !== c) expect(mine).toBeLessThan(dist(STABLE_CENTERS[other]!, entry));
      }
    }
  });

  it('keeps each die rest spot outside every tray and cell', () => {
    const cells = [...TRACK, ...HOME.flat()];
    for (const spot of DIE_REST) {
      for (const cell of cells) expect(dist(spot, cell)).toBeGreaterThan(0.6);
      for (const centre of STABLE_CENTERS) {
        const outside =
          Math.abs(spot.x - centre.x) > STABLE_TRAY_SIZE / 2 || Math.abs(spot.z - centre.z) > STABLE_TRAY_SIZE / 2;
        expect(outside).toBe(true);
      }
    }
  });
});

describe('horse placement', () => {
  it('maps every model position to a ground spot and a finite yaw', () => {
    for (const c of COLORS) {
      for (const pos of [POS_STABLE, 0, 20, POS_GATE, 56, 61]) {
        const v = horseGround(c, 2, pos);
        expect(Number.isFinite(v.x) && Number.isFinite(v.z)).toBe(true);
        expect(Number.isFinite(restYaw(c, 2, pos))).toBe(true);
      }
    }
  });

  it('rejects positions outside the model', () => {
    expect(() => horseGround(0, 0, 62)).toThrow(RangeError);
  });
});

describe('home stair clearances', () => {
  it('leaves the same gap beside the neighbouring track discs for every step', () => {
    expect(1 + TRACK_OUTSET - TREAD_WIDTH / 2 - CELL_RADIUS).toBeCloseTo(0.23, 9);
    expect(1 + TRACK_OUTSET - CELL_RADIUS - LANE_HALF_WIDTH).toBeCloseTo(
      INLAY_HALF_WIDTH - (1 + TRACK_OUTSET + CELL_RADIUS), 9,
    );
    for (const color of COLORS) {
      const dir = armDirection(color);
      for (const step of HOME[color]!) {
        for (const side of [-1, 1]) {
          const neighbour = {
            x: step.x + side * dir.z * (1 + TRACK_OUTSET) + dir.x * TRACK_OUTSET,
            z: step.z - side * dir.x * (1 + TRACK_OUTSET) + dir.z * TRACK_OUTSET,
          };
          expect(TRACK.some((cell) => dist(cell, neighbour) < 1e-9)).toBe(true);
          expect(dist(step, neighbour) - 2 * CELL_RADIUS).toBeGreaterThan(TRACK_OUTSET);
        }
      }
    }
  });

  it('keeps each sixth disc clear of the dais, with its centre and horse pose unchanged', () => {
    expect(1 - DAIS_WIDTH / 2 - CELL_RADIUS).toBeCloseTo(0.06, 9);
    expect(1 - HUB_RING_RADIUS - CELL_RADIUS).toBeCloseTo(0.071, 9);
    for (const color of COLORS) {
      for (let step = 1; step <= HOME_STEPS; step++) {
        const centre = HOME[color]![step - 1]!;
        expect(horseGround(color, 0, POS_GATE + step)).toEqual(centre);
        expect(groundHeight(POS_GATE + step)).toBeCloseTo(step * STAIR_RISE, 9);
        expect(obstacleHeight(centre.x, centre.z, 0)).toBeCloseTo(INLAY_TOP + step * STAIR_RISE, 9);
      }
    }
    expect(obstacleHeight(DAIS_WIDTH / 2 - 0.001, 0, 0)).toBeCloseTo(INLAY_TOP + 7 * STAIR_RISE, 9);
    expect(obstacleHeight((DAIS_WIDTH / 2 + 0.5) / 2, 0, 0)).toBe(0);
    expect(obstacleHeight(0.501, 0, 0)).toBeCloseTo(INLAY_TOP + HOME_STEPS * STAIR_RISE, 9);
  });
});
