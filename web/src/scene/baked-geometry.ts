/**
 * Geometry of a meshopt-compressed model, in board units. Such files store positions as normalised
 * integers under a node transform; this expands them to floats and bakes that transform in.
 */
import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three';
import type { Object3D } from 'three';

export interface BakedMesh {
  mesh: Mesh;
  geometry: BufferGeometry;
}

export function bakedGeometry(scene: Object3D, attributes: readonly string[]): BakedMesh {
  let mesh: Mesh | undefined;
  scene.traverse((o) => {
    if (!mesh && o instanceof Mesh) mesh = o;
  });
  if (!mesh) throw new Error('model has no mesh');
  mesh.updateWorldMatrix(true, false);
  const source = mesh.geometry;
  const geometry = new BufferGeometry();
  for (const name of attributes) {
    const a = source.getAttribute(name);
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      out[i * a.itemSize] = a.getX(i);
      out[i * a.itemSize + 1] = a.getY(i);
      if (a.itemSize > 2) out[i * a.itemSize + 2] = a.getZ(i);
    }
    geometry.setAttribute(name, new Float32BufferAttribute(out, a.itemSize));
  }
  geometry.setIndex(source.getIndex());
  geometry.applyMatrix4(mesh.matrixWorld);
  return { mesh, geometry };
}
