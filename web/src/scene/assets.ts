/**
 * Shared geometries, materials and textures of one scene instance. Everything
 * created through `own` is disposed together when the scene unmounts.
 */
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
} from 'three';
import type { Color } from '../../../shared/game/types';
import type { HorseModel } from './horse-model';
import { BOARD, HORSE_COLORS, HORSE_STAIN } from './palette';
import { TextureKit } from './textures';

interface Disposable {
  dispose(): void;
}

/** Height of the felt pad a horse stands on. */
export const HORSE_PAD = 0.04;

export class Assets {
  private readonly owned: Disposable[] = [];

  constructor(model: HorseModel) {
    this.horseGeometry = model.geometry;
    const padRadius = model.baseRadius + 0.07;
    this.horsePadGeometry = this.own(new CylinderGeometry(padRadius, padRadius, HORSE_PAD, 40).translate(0, HORSE_PAD / 2, 0));
    this.horseMat = this.perColor((c) => {
      // A polished finish over the stained grain.
      const wood = new MeshPhysicalMaterial({
        map: model.material.map,
        normalMap: model.material.normalMap,
        color: HORSE_STAIN[c],
        roughness: 0.42,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
      });
      return this.own(wood);
    });
    this.horsePadMat = this.perColor((c) => this.own(new MeshStandardMaterial({ color: HORSE_COLORS[c], roughness: 0.9 })));
  }

  /** Register something to dispose with the scene and return it. */
  own<T extends Disposable>(x: T): T {
    this.owned.push(x);
    return x;
  }

  readonly kit = this.own(new TextureKit());

  /** The piece geometry belongs to the model loader's cache, so it is shared and never disposed here. */
  readonly horseGeometry: BufferGeometry;
  /** Flat coloured felt under the turned base. */
  readonly horsePadGeometry: BufferGeometry;
  readonly horseMat: Record<Color, MeshPhysicalMaterial>;
  readonly horsePadMat: Record<Color, MeshStandardMaterial>;

  /** Glow under a horse that can be picked. */
  readonly haloGeometry = this.own(new RingGeometry(0.52, 0.82, 40));
  readonly haloMat = this.own(
    new MeshBasicMaterial({
      color: '#ffc21a',
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  /** Gold arrow floating over a horse that can be picked. */
  readonly arrowGeometry = this.own(new ConeGeometry(0.2, 0.4, 4).rotateX(Math.PI));
  readonly arrowMat = this.own(new MeshBasicMaterial({ color: '#ffc21a', toneMapped: false }));
  /** Invisible, generous tap target around a horse. */
  readonly hitGeometry = this.own(new CylinderGeometry(0.62, 0.62, 1.7, 12));
  readonly hitMat = this.own(new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));

  readonly cellBase = this.own(new CylinderGeometry(0.47, 0.5, 0.03, 32));
  readonly cellRimMat = this.own(new MeshStandardMaterial({ color: BOARD.cellRim, roughness: 0.6 }));
  readonly decalGeometry = this.own(new PlaneGeometry(0.96, 0.96));
  // Arms span 0.62..6.66 from the centre so neighbouring translucent lanes never overlap (coplanar overlap z-fights).
  readonly laneGeometry = this.own(new BoxGeometry(1.24, 0.016, 6.04));
  readonly laneMat = this.perColor((c) =>
    this.own(new MeshStandardMaterial({ color: HORSE_COLORS[c], roughness: 0.8, transparent: true, opacity: 0.4 })),
  );

  readonly confettiMat = this.own(new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));

  private perColor<T>(make: (c: Color) => T): Record<Color, T> {
    return { 0: make(0), 1: make(1), 2: make(2), 3: make(3) };
  }

  dispose(): void {
    for (const d of this.owned) d.dispose();
    this.owned.length = 0;
  }
}
