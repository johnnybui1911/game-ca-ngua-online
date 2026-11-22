import { Matrix4, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { piecesOf } from './layout';
import { createMelonSkin, seedSpots, watermelonPlates } from './pieces';
import { SURFACES, SetBuilder } from './set-builder';

function vertices(geometry: BufferGeometry): Vector3[] {
  const position = geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i));
}

describe('melon skin', () => {
  const stripes = 10;
  const { dark, light } = createMelonSkin(stripes, 14);

  /** Total area of the triangles of a skin; each must face away from the centre. */
  function outwardArea(geometry: BufferGeometry): number {
    const points = vertices(geometry);
    const index = geometry.index!;
    let area = 0;
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [points[index.getX(i)]!, points[index.getX(i + 1)]!, points[index.getX(i + 2)]!];
      const cross = b.clone().sub(a).cross(c.clone().sub(a));
      expect(cross.dot(a.clone().add(b).add(c))).toBeGreaterThan(0);
      area += cross.length() / 2;
    }
    return area;
  }

  it('lies on the unit sphere with every normal pointing straight out', () => {
    for (const geometry of [dark, light]) {
      const normal = geometry.getAttribute('normal');
      for (const [i, p] of vertices(geometry).entries()) {
        expect(p.length()).toBeCloseTo(1, 5);
        expect(new Vector3().fromBufferAttribute(normal, i).distanceTo(p)).toBeLessThan(1e-6);
      }
    }
  });

  it('covers the whole sphere, the light stripes taking the smaller share', () => {
    const lightArea = outwardArea(light);
    const total = lightArea + outwardArea(dark);
    expect(total).toBeGreaterThan(4 * Math.PI * 0.95);
    expect(total).toBeLessThanOrEqual(4 * Math.PI);
    expect(lightArea / total).toBeGreaterThan(0.25);
    expect(lightArea / total).toBeLessThan(0.45);
  });

  it('wavers along the stripes instead of following a meridian', () => {
    const longitudes = vertices(light)
      .filter((p) => Math.abs(p.y) < 0.9)
      .map((p) => Math.atan2(p.z, p.x));
    const pitch = (Math.PI * 2) / stripes;
    // Folded onto one stripe, a straight band would give two longitudes only.
    const folded = new Set(longitudes.map((l) => (((l + pitch / 2) % pitch) + pitch) % pitch).map((l) => l.toFixed(3)));
    expect(folded.size).toBeGreaterThan(6);
  });
});

describe('seed spots', () => {
  it('spreads the seeds over the disc without stacking them', () => {
    const count = 34;
    const radius = 0.5;
    const spots = seedSpots(count, radius);
    expect(spots).toHaveLength(count);
    for (const [i, a] of spots.entries()) {
      expect(Math.hypot(a.x, a.z)).toBeLessThanOrEqual(radius);
      for (const b of spots.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan((0.5 * radius) / Math.sqrt(count));
    }
  });

  it('lays the same seeds every time', () => {
    expect(seedSpots(12, 1)).toEqual(seedSpots(12, 1));
  });
});

describe('watermelon plates', () => {
  it('stand on the platform inside the space reserved for an offering', () => {
    const slot = piecesOf('offering')[0]!;
    const b = new SetBuilder();
    watermelonPlates(b, new Matrix4());
    const built = b.build();
    for (const surface of SURFACES) {
      const geometry = built[surface];
      if (!geometry) continue;
      for (const p of vertices(geometry)) {
        expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(slot.radius);
        expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeLessThanOrEqual(slot.height);
      }
    }
  });
});
