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
  fitOrbitDistance,
  followShare,
  freeBand,
  freeBandX,
  mixPose,
  poseOf,
  posePosition,
  reserveInsets,
  seatCameraPosition,
  seatPose,
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

describe('framing beside a panel and on the home orbit', () => {
  // Viewport, then what covers it: the home page's title and call-to-action band, a side panel, a bottom sheet.
  for (const [name, w, h, insets] of [
    ['home desktop', 1440, 900, { top: 0, bottom: 150 }],
    ['home phone', 390, 844, { top: 96, bottom: 190 }],
    ['side panel', 1440, 900, { top: 0, bottom: 0, right: 460 }],
    ['bottom sheet', 390, 844, { top: 0, bottom: 480 }],
  ] as const) {
    it(`keeps every slab corner in the free area at every orbit angle, ${name}`, () => {
      const aspect = w / h;
      const polar = defaultPolar(aspect);
      const y = freeBand(insets, h);
      const x = freeBandX(insets, w);
      const fit = fitOrbitDistance(aspect, 40, polar, y.fraction, x.fraction);
      const left = 'left' in insets ? Number(insets.left) : 0;
      const right = 'right' in insets ? insets.right : 0;
      for (let step = 0; step < 72; step++) {
        const pos = posePosition({ azimuth: (step * Math.PI) / 36, polar, zoom: 1 }, fit);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const n = project(pos, [sx * SLAB_HALF, 0, sz * SLAB_HALF], 40, aspect);
            // Screen px from the top-left corner; the window slid right/down moves the picture left/up.
            const px = ((n.x + 1) / 2) * w - x.shiftPx;
            const py = ((1 - n.y) / 2) * h - y.shiftPx;
            expect(px).toBeGreaterThanOrEqual(left - 0.5);
            expect(px).toBeLessThanOrEqual(w - right + 0.5);
            expect(py).toBeGreaterThanOrEqual(insets.top - 0.5);
            expect(py).toBeLessThanOrEqual(h - insets.bottom + 0.5);
          }
        }
      }
    });
  }

  it('never asks for less distance than a seat view does', () => {
    for (const aspect of [390 / 844, 1.6]) {
      expect(fitOrbitDistance(aspect, 40)).toBeGreaterThanOrEqual(fitCameraDistance(aspect, 40));
    }
  });

  it('centres the board between side panels', () => {
    expect(freeBandX({ top: 0, bottom: 0, right: 400 }, 1600)).toEqual({ fraction: 0.75, shiftPx: 200 });
    expect(freeBandX({ top: 0, bottom: 0 }, 1600)).toEqual({ fraction: 1, shiftPx: 0 });
  });
});

describe('camera poses', () => {
  it('reads back the pose a position was built from', () => {
    const pose = { azimuth: 2.2, polar: 0.8, zoom: 1.1 };
    const back = poseOf(posePosition(pose, 20), 20);
    expect(back.azimuth).toBeCloseTo(pose.azimuth, 9);
    expect(back.polar).toBeCloseTo(pose.polar, 9);
    expect(back.zoom).toBeCloseTo(pose.zoom, 9);
  });

  it('puts a seat pose where the seat camera stands', () => {
    for (const color of COLORS) {
      const expected = seatCameraPosition(color, 18, 0.9);
      posePosition(seatPose(color, 0.9), 18).forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
    }
  });

  it('flies the shorter way round and lands exactly on the seat', () => {
    const from = { azimuth: Math.PI - 0.2, polar: 0.7, zoom: 1.2 };
    const to = { azimuth: -Math.PI + 0.2, polar: 0.9, zoom: 1 };
    // 0.4 rad apart across the ±π seam, not 2π - 0.4 the long way.
    expect(mixPose(from, to, 0.5).azimuth).toBeCloseTo(Math.PI, 9);
    const end = posePosition(mixPose(from, to, 1), 10);
    posePosition(to, 10).forEach((v, i) => expect(end[i]).toBeCloseTo(v, 9));
    expect(mixPose(from, to, 0)).toEqual(from);
  });

  it('follows faster over longer frames and jumps when there is no time constant', () => {
    expect(followShare(0)).toBe(0);
    expect(followShare(0.1)).toBeGreaterThan(followShare(0.016));
    expect(followShare(10)).toBeCloseTo(1, 6);
    expect(followShare(0.016, 0)).toBe(1);
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
