import { Matrix4, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { piecesOf } from './layout';
import { createArcSlab, seedSpots, watermelonPlates } from './pieces';
import { SURFACES, SetBuilder } from './set-builder';

function vertices(geometry: BufferGeometry): Vector3[] {
  const position = geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i));
}

describe('arc slab', () => {
  const inner = 0.8;
  const outer = 1.5;
  const angle = Math.PI / 3;
  const thickness = 0.3;

  it.each([
    ['ring', inner],
    ['wedge', 0],
  ])('keeps a %s slab between its radii, inside its angle and its thickness', (_, from) => {
    for (const p of vertices(createArcSlab(from, outer, angle, thickness, 4))) {
      const radius = Math.hypot(p.x, p.y);
      expect(radius).toBeGreaterThanOrEqual(from - 1e-6);
      expect(radius).toBeLessThanOrEqual(outer + 1e-6);
      if (radius > 1e-6) expect(Math.abs(Math.atan2(p.x, -p.y))).toBeLessThanOrEqual(angle / 2 + 1e-6);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(thickness / 2 + 1e-6);
    }
  });

  it.each([
    ['ring', inner],
    ['wedge', 0],
  ])('turns every face of a %s slab outwards', (_, from) => {
    const geometry = createArcSlab(from, outer, angle, thickness, 4);
    const points = vertices(geometry);
    const normal = geometry.getAttribute('normal');
    const inside = new Vector3(0, -(from + outer) / 2, 0);
    expect(points.length % 3).toBe(0);
    for (let i = 0; i < points.length; i += 3) {
      const [a, b, c] = [points[i]!, points[i + 1]!, points[i + 2]!];
      const winding = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const centre = a.clone().add(b).add(c).divideScalar(3);
      expect(winding.dot(centre.sub(inside))).toBeGreaterThan(0);
      for (let k = i; k < i + 3; k++) expect(new Vector3().fromBufferAttribute(normal, k).dot(winding)).toBeCloseTo(1, 5);
    }
  });

  it('closes a wedge with two faces, an outer edge and two cut ends', () => {
    const segments = 4;
    // Two triangles per segment on the faces, two on the edge, and two on each end.
    expect(createArcSlab(0, outer, angle, thickness, segments).getAttribute('position').count / 3).toBe(segments * 4 + 4);
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
