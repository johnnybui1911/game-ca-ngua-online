/**
 * Collects the static parts of the set into one geometry per kind of surface, each part
 * carrying its colour on its vertices. Dozens of props then cost three draw calls.
 */
import { BufferAttribute, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Painted wood, paper and fruit; polished lacquer and glaze; gilding. */
export type Surface = 'matte' | 'gloss' | 'metal';

export const SURFACES: readonly Surface[] = ['matte', 'gloss', 'metal'];

/** Transform of a part inside its parent: position, optional Euler turn (XYZ) and scale. */
export function place(
  parent: Matrix4,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: number | readonly [number, number, number] = 1,
): Matrix4 {
  const s = typeof scale === 'number' ? ([scale, scale, scale] as const) : scale;
  const local = new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(...s),
  );
  return parent.clone().multiply(local);
}

export class SetBuilder {
  private readonly parts: Record<Surface, BufferGeometry[]> = { matte: [], gloss: [], metal: [] };

  /** Adds a part and takes the geometry over: it is moved into place and must not be used again. */
  add(surface: Surface, geometry: BufferGeometry, colour: string, matrix: Matrix4): void {
    geometry.applyMatrix4(matrix);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    const count = geometry.getAttribute('position').count;
    if (!geometry.index) geometry.setIndex(Array.from({ length: count }, (_, i) => i));
    const c = new Color(colour);
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colours[i * 3] = c.r;
      colours[i * 3 + 1] = c.g;
      colours[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new BufferAttribute(colours, 3));
    this.parts[surface].push(geometry);
  }

  /** One merged geometry per surface (null when nothing was added); the parts are released. */
  build(): Record<Surface, BufferGeometry | null> {
    const out: Record<Surface, BufferGeometry | null> = { matte: null, gloss: null, metal: null };
    for (const surface of SURFACES) {
      const parts = this.parts[surface];
      if (parts.length > 0) out[surface] = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      parts.length = 0;
    }
    return out;
  }
}
