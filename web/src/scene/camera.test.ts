import { describe, expect, it } from 'vitest';
import { COLORS } from '../../../shared/game/types';
import {
  CLOSE_UP_AIM,
  CLOSE_UP_DOLLY,
  CLOSE_UP_HEIGHT,
  DEFAULT_POLAR,
  SHAKE_AMPLITUDE,
  closeUpFraming,
  defaultPolar,
  fitCameraDistance,
  freeBand,
  reserveInsets,
  seatCameraPosition,
  shakeOffset,
} from './camera';
import { SLAB_HALF } from './layout';

/** NDC of a ground point for a camera at `pos` looking at the origin. */
function project(pos: [number, number, number], p: [number, number, number], vfov: number, aspect: number) {
  const [cx, cy, cz] = pos;
  const len = Math.hypot(cx, cy, cz);
  const f = [-cx / len, -cy / len, -cz / len] as const;
  // right = f x worldUp, normalised
  const rx = -f[2];
  const rz = f[0];
  const rl = Math.hypot(rx, rz);
  const r = [rx / rl, 0, rz / rl] as const;
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] as const;
  const d: [number, number, number] = [p[0] - cx, p[1] - cy, p[2] - cz];
  const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const tanV = Math.tan((vfov * Math.PI) / 360);
  return {
    x: (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (depth * tanV * aspect),
    y: (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (depth * tanV),
  };
}

describe('camera fit', () => {
  for (const [name, aspect] of [
    ['phone portrait', 390 / 844],
    ['square', 1],
    ['desktop landscape', 16 / 9],
    ['ultrawide', 21 / 9],
  ] as const) {
    for (const color of COLORS) {
      it(`keeps the whole board in view, ${name}, seat ${color}`, () => {
        const d = fitCameraDistance(aspect, 40);
        const pos = seatCameraPosition(color, d, defaultPolar(aspect));
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const n = project(pos, [sx * SLAB_HALF, 0, sz * SLAB_HALF], 40, aspect);
            expect(Math.abs(n.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(n.y)).toBeLessThanOrEqual(1);
          }
        }
      });
    }
  }

  it('places colour 0 on +z so its arm and stable face the camera', () => {
    const [x, y, z] = seatCameraPosition(0, 20);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeGreaterThan(0);
    expect(y).toBeCloseTo(20 * Math.cos(DEFAULT_POLAR), 9);
  });

  describe('with HUD panels reserving space', () => {
    for (const [w, h, top, bottom] of [
      [1280, 800, 56, 120],
      [1440, 900, 56, 120],
      [1920, 1080, 56, 120],
      [1280, 800, 56, 190],
      [390, 844, 90, 130],
    ] as const) {
      for (const color of COLORS) {
        it(`keeps every slab corner inside the free band, ${w}x${h}, seat ${color}`, () => {
          const aspect = w / h;
          const { fraction, shiftPx } = freeBand({ top, bottom }, h);
          const d = fitCameraDistance(aspect, 40, defaultPolar(aspect), fraction);
          const pos = seatCameraPosition(color, d, defaultPolar(aspect));
          // The window slides down by shiftPx, which moves the picture up by that many pixels.
          const lift = shiftPx / (h / 2);
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              const n = project(pos, [sx * SLAB_HALF, 0, sz * SLAB_HALF], 40, aspect);
              expect(Math.abs(n.x)).toBeLessThanOrEqual(1);
              const ySlackBottom = (n.y + lift - (-1 + (2 * bottom) / h)) * (h / 2);
              const ySlackTop = (1 - (2 * top) / h - (n.y + lift)) * (h / 2);
              expect(ySlackBottom).toBeGreaterThanOrEqual(0);
              expect(ySlackTop).toBeGreaterThanOrEqual(0);
            }
          }
        });
      }
    }

    it('is the plain fit when nothing is reserved', () => {
      expect(freeBand({ top: 0, bottom: 0 }, 800)).toEqual({ fraction: 1, shiftPx: 0 });
      for (const aspect of [390 / 844, 1.6, 16 / 9]) {
        expect(fitCameraDistance(aspect, 40, defaultPolar(aspect), 1)).toBe(fitCameraDistance(aspect, 40));
      }
    });

    it('moves the board centre toward the roomier side and pushes the camera back', () => {
      const band = freeBand({ top: 56, bottom: 120 }, 800);
      expect(band.fraction).toBeCloseTo(1 - 176 / 800, 9);
      expect(band.shiftPx).toBe(32);
      expect(fitCameraDistance(16 / 9, 40, undefined, band.fraction)).toBeGreaterThan(fitCameraDistance(16 / 9, 40));
    });

    it('never lets absurdly tall panels shrink the board away', () => {
      const band = freeBand({ top: 500, bottom: 500 }, 800);
      expect(band.fraction).toBeCloseTo(0.3, 9);
      expect(Number.isFinite(fitCameraDistance(16 / 9, 40, undefined, band.fraction))).toBe(true);
    });
  });

  describe('reserved insets', () => {
    it('starts from the first measurement', () => {
      expect(reserveInsets(null, { top: 50, bottom: 100 }, 390, 844)).toEqual({ width: 390, height: 844, top: 50, bottom: 100 });
    });

    it('grows but never shrinks at one viewport size, per side', () => {
      let r = reserveInsets(null, { top: 50, bottom: 100 }, 390, 844);
      r = reserveInsets(r, { top: 40, bottom: 160 }, 390, 844);
      expect(r).toMatchObject({ top: 50, bottom: 160 });
      r = reserveInsets(r, { top: 60, bottom: 90 }, 390, 844);
      expect(r).toMatchObject({ top: 60, bottom: 160 });
    });

    it('keeps the same object when nothing grows', () => {
      const r = reserveInsets(null, { top: 50, bottom: 100 }, 390, 844);
      expect(reserveInsets(r, { top: 50, bottom: 80 }, 390, 844)).toBe(r);
    });

    it('starts over when the viewport size changes', () => {
      const r = reserveInsets(null, { top: 50, bottom: 160 }, 390, 844);
      expect(reserveInsets(r, { top: 56, bottom: 120 }, 844, 390)).toEqual({ width: 844, height: 390, top: 56, bottom: 120 });
      expect(reserveInsets(r, { top: 56, bottom: 120 }, 390, 700)).toMatchObject({ top: 56, bottom: 120 });
    });
  });
});

describe('kick close-up', () => {
  const seat = seatCameraPosition(0, 30, DEFAULT_POLAR);

  it('leaves the framing untouched at weight 0', () => {
    // `+ 0` turns the -0 of a zero weight times a negative coordinate into 0.
    expect(closeUpFraming([], ...seat, 5, -3, 0).map((v) => v + 0)).toEqual([...seat, 0, 0, 0]);
  });

  it('moves part of the way to the contact point and aims near it at weight 1', () => {
    const f = closeUpFraming([], ...seat, 5, -3, 1);
    expect(f[0]).toBeCloseTo(seat[0] + (5 - seat[0]) * CLOSE_UP_DOLLY, 9);
    expect(f[1]).toBeCloseTo(seat[1] + (CLOSE_UP_HEIGHT - seat[1]) * CLOSE_UP_DOLLY, 9);
    expect(f[2]).toBeCloseTo(seat[2] + (-3 - seat[2]) * CLOSE_UP_DOLLY, 9);
    expect(f.slice(3)).toEqual([5 * CLOSE_UP_AIM, CLOSE_UP_HEIGHT * CLOSE_UP_AIM, -3 * CLOSE_UP_AIM]);
  });

  it('gets closer to the contact point as the weight grows, and never goes below the board', () => {
    let last = Infinity;
    for (let w = 0; w <= 1.0001; w += 0.1) {
      const f = closeUpFraming([], ...seat, -6, 6, w);
      const d = Math.hypot(f[0]! + 6, f[1]! - CLOSE_UP_HEIGHT, f[2]! - 6);
      expect(d).toBeLessThan(last);
      expect(f[1]).toBeGreaterThan(CLOSE_UP_HEIGHT);
      last = d;
    }
  });

  it('writes into the array it is given', () => {
    const out = [9, 9, 9, 9, 9, 9];
    expect(closeUpFraming(out, ...seat, 1, 1, 0.5)).toBe(out);
  });
});

describe('camera shake', () => {
  it('is zero before, after and without a shake', () => {
    expect(shakeOffset([], -1, 0.26)).toEqual([0, 0]);
    expect(shakeOffset([], 0.26, 0.26)).toEqual([0, 0]);
    expect(shakeOffset([], 5, 0.26)).toEqual([0, 0]);
  });

  it('stays small and dies away', () => {
    const size = (t: number) => Math.hypot(...(shakeOffset([], t, 0.26) as [number, number]));
    let early = 0;
    let late = 0;
    for (let t = 0; t < 0.26; t += 0.002) {
      expect(size(t)).toBeLessThanOrEqual(SHAKE_AMPLITUDE * Math.SQRT2);
      if (t < 0.06) early = Math.max(early, size(t));
      if (t > 0.2) late = Math.max(late, size(t));
    }
    expect(early).toBeGreaterThan(SHAKE_AMPLITUDE * 0.5);
    expect(late).toBeLessThan(early / 8);
  });
});
