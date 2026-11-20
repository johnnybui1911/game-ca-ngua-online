import { describe, expect, it } from 'vitest';
import { COLORS } from '../../../shared/game/types';
import { DEFAULT_POLAR, defaultPolar, fitCameraDistance, seatCameraPosition } from './camera';
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
});
