/**
 * Materials and textures of the set, and its entrance: everything made here starts dark and
 * comes up over a moment, like stage lights, so the set never pops in over a board that is
 * already on screen. Whatever is created through the kit is disposed with it.
 */
import { Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { Material } from 'three';
import { fadeLevel } from './motion';
import type { Surface } from './set-builder';
import { coupletScroll, floorFade, floorTile, lacquerTop, platformShadow } from './set-textures';

/** Seconds the set takes to come up. */
export const FADE_SECONDS = 1.6;

interface Disposable {
  dispose(): void;
}

interface Entrance {
  born: number;
  apply(level: number): void;
}

export class SetKit {
  private readonly owned: Disposable[] = [];
  private readonly entering: Entrance[] = [];
  private clock = 0;

  /** Register something to dispose with the set and return it. */
  own<T extends Disposable>(x: T): T {
    this.owned.push(x);
    return x;
  }

  /** A lit material that comes up from black: its colour, glow and reflections scale together. */
  lit<T extends MeshStandardMaterial>(material: T): T {
    const colour = material.color.clone();
    const emissive = material.emissiveIntensity;
    const reflections = material.envMapIntensity;
    return this.enter(material, (level) => {
      material.color.copy(colour).multiplyScalar(level);
      material.emissiveIntensity = emissive * level;
      material.envMapIntensity = reflections * level;
    });
  }

  /** A see-through material that comes up from nothing. */
  sheer<T extends Material>(material: T): T {
    const opacity = material.opacity;
    return this.enter(material, (level) => {
      material.opacity = opacity * level;
    });
  }

  private enter<T extends Material>(material: T, apply: (level: number) => void): T {
    apply(0);
    this.entering.push({ born: this.clock, apply });
    return this.own(material);
  }

  /** Brightness of the lights and glows that were there from the start, 0..1. */
  get level(): number {
    return fadeLevel(this.clock, FADE_SECONDS);
  }

  /** Nothing is fading any more: `tick` has no work left. */
  get settled(): boolean {
    return this.entering.length === 0 && this.clock >= FADE_SECONDS;
  }

  tick(dt: number): void {
    if (this.settled) return;
    this.clock += dt;
    for (let i = this.entering.length - 1; i >= 0; i--) {
      const entry = this.entering[i]!;
      const level = fadeLevel(this.clock - entry.born, FADE_SECONDS);
      entry.apply(level);
      if (level >= 1) this.entering.splice(i, 1);
    }
  }

  readonly surfaces: Record<Surface, MeshStandardMaterial> = {
    matte: this.lit(new MeshStandardMaterial({ vertexColors: true, roughness: 0.72 })),
    gloss: this.lit(new MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.05 })),
    metal: this.lit(new MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.6 })),
  };

  /** `boardShare`: the board's side as a share of the platform's. */
  platformTop(boardShare: number): MeshStandardMaterial {
    return this.lit(new MeshStandardMaterial({ map: this.own(lacquerTop(boardShare)), roughness: 0.44, metalness: 0.05, envMapIntensity: 0.7 }));
  }

  /** Tiled floor: `tiles` across the disc, opaque up to `solidShare` of its radius and gone at the rim. */
  floor(tiles: number, solidShare: number): MeshStandardMaterial {
    const map = this.own(floorTile());
    map.repeat.set(tiles, tiles);
    return this.sheer(
      new MeshStandardMaterial({ map, alphaMap: this.own(floorFade(solidShare)), color: '#8d8274', roughness: 0.58, transparent: true, depthWrite: false }),
    );
  }

  platformShadow(): MeshBasicMaterial {
    return this.sheer(new MeshBasicMaterial({ map: this.own(platformShadow()), transparent: true, depthWrite: false, toneMapped: false }));
  }

  /** Lettered face of a couplet scroll; the paper carries a little light of its own so the gold reads in the dark. */
  scroll(line: number): MeshStandardMaterial {
    const map = this.own(coupletScroll(line));
    return this.lit(new MeshStandardMaterial({ map, roughness: 0.8, emissive: new Color('#ffffff'), emissiveMap: map, emissiveIntensity: 0.2 }));
  }

  readonly petals = this.lit(
    new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.65, emissive: new Color('#55301c'), emissiveIntensity: 0.6 }),
  );

  /**
   * Frees the GPU side of everything owned. The kit stays usable: three.js uploads again
   * whatever is drawn afterwards (React remounts a development tree once), and a later
   * call frees that too.
   */
  dispose(): void {
    for (const d of this.owned) d.dispose();
  }
}
