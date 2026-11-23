import { Matrix4, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { piecesOf } from './layout';
import { PLAQUE_FACE, PLAQUE_HEIGHT, PLAQUE_TILT, PLAQUE_WIDTH, STATUE_BASE, STATUE_HEIGHT, STATUE_RADIUS, goldenHorse } from './pieces';
import { SURFACES, SetBuilder } from './set-builder';

function vertices(geometry: BufferGeometry): Vector3[] {
  const position = geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i));
}

describe('golden horse', () => {
  const slot = piecesOf('offering')[0]!;
  const b = new SetBuilder();
  goldenHorse(b, new Matrix4());
  const built = b.build();
  const points = SURFACES.flatMap((surface) => (built[surface] ? vertices(built[surface]) : []));

  it('stands on the platform inside the space reserved for an offering', () => {
    for (const p of points) {
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(slot.radius);
      expect(p.y).toBeGreaterThanOrEqual(-1e-6);
      expect(p.y).toBeLessThanOrEqual(slot.height);
    }
  });

  it('leaves room for the horse on its base', () => {
    expect(STATUE_BASE + STATUE_HEIGHT).toBeLessThanOrEqual(slot.height);
    expect(STATUE_RADIUS).toBeLessThan(slot.radius);
  });

  it('keeps the lettered sheet in front of its plate and inside the slot', () => {
    const face = new Matrix4().makeRotationX(PLAQUE_TILT).setPosition(...PLAQUE_FACE);
    const outward = new Vector3(0, 0, 1).transformDirection(face);
    const metal = vertices(built.metal!);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const corner = new Vector3((sx * PLAQUE_WIDTH) / 2, (sy * PLAQUE_HEIGHT) / 2, 0).applyMatrix4(face);
        expect(corner.y).toBeGreaterThan(0);
        expect(Math.hypot(corner.x, corner.z)).toBeLessThan(slot.radius);
        // Nothing gilt lies over the sheet: the plate is behind it.
        for (const p of metal) {
          const off = p.clone().sub(corner);
          if (Math.abs(off.x) < 0.2 && off.length() < 0.2) expect(off.dot(outward)).toBeLessThan(0);
        }
      }
    }
  });
});
