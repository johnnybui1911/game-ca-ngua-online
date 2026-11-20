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
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
} from 'three';
import type { Color } from '../../../shared/game/types';
import { createHorseBase, createHorseBody, createHorseDetails } from './horse-geometry';
import { BOARD, HORSE_COLORS } from './palette';
import { TextureKit } from './textures';

interface Disposable {
  dispose(): void;
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.min(255, Math.round(((n >> shift) & 255) * factor));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export class Assets {
  private readonly owned: Disposable[] = [];

  /** Register something to dispose with the scene and return it. */
  own<T extends Disposable>(x: T): T {
    this.owned.push(x);
    return x;
  }

  readonly kit = this.own(new TextureKit());

  readonly horseBody = this.own(createHorseBody());
  readonly horseDetails = this.own(createHorseDetails());
  readonly horseBase: Record<Color, BufferGeometry> = {
    0: this.own(createHorseBase(0)),
    1: this.own(createHorseBase(1)),
    2: this.own(createHorseBase(2)),
    3: this.own(createHorseBase(3)),
  };

  readonly horseBodyMat = this.perColor((c) =>
    this.own(new MeshStandardMaterial({ color: HORSE_COLORS[c], roughness: 0.36, metalness: 0.04 })),
  );
  readonly horseBaseMat = this.perColor((c) =>
    this.own(new MeshStandardMaterial({ color: shade(HORSE_COLORS[c], 0.78), roughness: 0.5, metalness: 0.05 })),
  );
  readonly horseDarkMat = this.own(new MeshStandardMaterial({ color: '#2a1a10', roughness: 0.55 }));

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
  readonly laneGeometry = this.own(new BoxGeometry(1.24, 0.016, 6.32));
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
