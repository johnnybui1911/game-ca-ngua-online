/**
 * Every texture is painted here with the 2D canvas API: wood, felt, and the
 * decals on cells and stable slots. A `TextureKit` caches and owns them so a
 * scene can dispose everything it created in one call.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Color } from '../../../shared/game/types';
import { BOARD, HORSE_COLORS } from './palette';

/** Number of polygon sides per colour: the base shape that tells colours apart without hue. */
export const COLOR_SIDES: Record<Color, number> = { 0: 32, 1: 4, 2: 6, 3: 3 };

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Cheap deterministic hash noise in [0,1). */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const top = hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u;
  const bottom = hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u;
  return top * (1 - v) + bottom * v;
}

function polygonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number): void {
  ctx.beginPath();
  if (sides >= 16) {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    return;
  }
  // Squares stand on a side, triangles and hexagons point up.
  const start = sides === 4 ? Math.PI / 4 : -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const a = start + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export class TextureKit {
  private readonly cache = new Map<string, CanvasTexture>();

  private make(key: string, size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const [c, ctx] = canvas(size);
    paint(ctx, size);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    this.cache.set(key, tex);
    return tex;
  }

  wood(): CanvasTexture {
    const tex = this.make('wood', 1024, (ctx, size) => {
      const img = ctx.createImageData(size, size);
      const base = [138, 90, 53];
      const dark = [88, 52, 28];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const warp = smoothNoise(x * 0.004, y * 0.03) * 38 + smoothNoise(x * 0.012, y * 0.08) * 7;
          const ring = 0.5 + 0.5 * Math.sin((y + warp) * 0.19);
          const fine = smoothNoise(x * 0.5, y * 0.05);
          const t = Math.min(1, Math.max(0, ring * ring * 0.55 + fine * 0.22));
          const i = (y * size + x) * 4;
          img.data[i] = base[0]! * (1 - t) + dark[0]! * t;
          img.data[i + 1] = base[1]! * (1 - t) + dark[1]! * t;
          img.data[i + 2] = base[2]! * (1 - t) + dark[2]! * t;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    return tex;
  }

  /** Warm cream felt for the playing cross: soft speckle, no strong pattern. */
  felt(): CanvasTexture {
    const tex = this.make('felt', 512, (ctx, size) => {
      const img = ctx.createImageData(size, size);
      const base = [236, 221, 184];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n = (hash(x, y) - 0.5) * 14 + (smoothNoise(x * 0.03, y * 0.03) - 0.5) * 14;
          const i = (y * size + x) * 4;
          img.data[i] = base[0]! + n;
          img.data[i + 1] = base[1]! + n;
          img.data[i + 2] = base[2]! + n * 1.1;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    return tex;
  }

  /** Empty track cell: ivory disc with a painted rim. Transparent outside the disc. */
  plainCell(): CanvasTexture {
    return this.make('cell:plain', 128, (ctx, s) => {
      const g = ctx.createRadialGradient(s * 0.45, s * 0.4, 4, s / 2, s / 2, s / 2);
      g.addColorStop(0, '#fffaf0');
      g.addColorStop(1, BOARD.cell);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = BOARD.cellRim;
      ctx.stroke();
    });
  }

  /** Entry cell: solid colour with a white arrow pointing up (the travel direction). */
  entryCell(color: Color): CanvasTexture {
    return this.make(`cell:entry:${color}`, 128, (ctx, s) => {
      const hex = HORSE_COLORS[color];
      ctx.fillStyle = hex;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = mix(hex, '#000000', 0.35);
      ctx.stroke();
      ctx.fillStyle = '#fff8e8';
      ctx.beginPath();
      ctx.moveTo(s / 2, s * 0.22);
      ctx.lineTo(s * 0.72, s * 0.52);
      ctx.lineTo(s * 0.57, s * 0.52);
      ctx.lineTo(s * 0.57, s * 0.76);
      ctx.lineTo(s * 0.43, s * 0.76);
      ctx.lineTo(s * 0.43, s * 0.52);
      ctx.lineTo(s * 0.28, s * 0.52);
      ctx.closePath();
      ctx.fill();
    });
  }

  /** Gate cell: ivory disc inside a thick colour ring with the colour's base shape in the middle. */
  gateCell(color: Color): CanvasTexture {
    return this.make(`cell:gate:${color}`, 128, (ctx, s) => {
      const hex = HORSE_COLORS[color];
      ctx.fillStyle = BOARD.cell;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 14;
      ctx.strokeStyle = hex;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.39, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = hex;
      polygonPath(ctx, s / 2, s / 2, s * 0.2, COLOR_SIDES[color]);
      ctx.fill();
    });
  }

  /** Home column step: tinted disc with its number, upright for the owner (texture up = towards the centre). */
  homeCell(color: Color, step: number): CanvasTexture {
    return this.make(`cell:home:${color}:${step}`, 128, (ctx, s) => {
      const hex = HORSE_COLORS[color];
      ctx.fillStyle = mix(hex, '#fff6e0', 0.55);
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = hex;
      ctx.stroke();
      ctx.fillStyle = mix(hex, '#000000', 0.45);
      ctx.font = `800 ${s * 0.56}px "Be Vietnam Pro", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(step), s / 2, s * 0.54);
    });
  }

  /** Stable parking slot: a sunken ring holding the colour's base shape outline. */
  slot(color: Color): CanvasTexture {
    return this.make(`slot:${color}`, 128, (ctx, s) => {
      const hex = HORSE_COLORS[color];
      ctx.fillStyle = mix(hex, '#2a1608', 0.55);
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.47, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = mix(hex, '#ffffff', 0.35);
      polygonPath(ctx, s / 2, s / 2, s * 0.3, COLOR_SIDES[color]);
      ctx.stroke();
    });
  }

  dispose(): void {
    for (const t of this.cache.values()) t.dispose();
    this.cache.clear();
  }
}
