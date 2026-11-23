/**
 * The playing piece: a turned wood knight (public/models/horse.glb, see public/models/LICENSES.md).
 * Local frame: +y up, faces +z, stands on y = 0. The material carries a grey grain map that each
 * colour tints with its own stain.
 */
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import type { BufferGeometry } from 'three';
import { bakedGeometry } from './baked-geometry';

export const HORSE_MODEL_URL = '/models/horse.glb';

export interface HorseModel {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  /** Radius of the turned base, in board units. */
  baseRadius: number;
}

/** Fetched once per page; the geometry and its textures stay in the loader cache. */
export function useHorseModel(): HorseModel {
  const { scene } = useGLTF(HORSE_MODEL_URL, false, true);
  return useMemo(() => {
    const { mesh, geometry } = bakedGeometry(scene, ['position', 'normal', 'uv']);
    if (!(mesh.material instanceof MeshStandardMaterial)) throw new Error('horse.glb has no wood material');
    // The base is the widest part of the foot: measure the vertices in its first 4% of height.
    const pos = geometry.getAttribute('position');
    geometry.computeBoundingBox();
    const foot = geometry.boundingBox!.min.y + (geometry.boundingBox!.max.y - geometry.boundingBox!.min.y) * 0.04;
    let baseRadius = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) <= foot) baseRadius = Math.max(baseRadius, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    return { geometry, material: mesh.material, baseRadius };
  }, [scene]);
}

useGLTF.preload(HORSE_MODEL_URL, false, true);
