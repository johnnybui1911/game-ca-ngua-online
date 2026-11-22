/**
 * Textures of the living-room set, painted with the 2D canvas API: lacquer inlay, cement
 * floor tiles, couplet scrolls, the nameplate of the golden horse and the soft discs behind
 * glows and shadows. No image files.
 */
import { CanvasTexture, LinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

const GOLD = '#d9b35c';
const GOLD_DIM = '#8f7136';

function canvas(width: number, height = width): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function colourTexture(c: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Deterministic hash noise in [0,1). */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Square spiral of the "hồi văn" key pattern, drawn inside a cell of side `s` at (x, y). */
function keyCell(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const u = s / 6;
  ctx.beginPath();
  ctx.moveTo(x, y + s - u);
  ctx.lineTo(x, y + u);
  ctx.lineTo(x + s - u, y + u);
  ctx.lineTo(x + s - u, y + s - u);
  ctx.lineTo(x + 2 * u, y + s - u);
  ctx.lineTo(x + 2 * u, y + 3 * u);
  ctx.lineTo(x + s - 3 * u, y + 3 * u);
  ctx.stroke();
}

/**
 * Top of the platform: near-black red lacquer with gold line inlay, a key-pattern frame around
 * the place of the board and a double border along the edge. `boardShare` is the board's side
 * as a share of the platform's.
 */
export function lacquerTop(boardShare: number): CanvasTexture {
  const size = 1024;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#2b0d09';
  ctx.fillRect(0, 0, size, size);
  // Brushed lacquer: faint long streaks.
  for (let i = 0; i < 2600; i++) {
    const x = hash(i, 1) * size;
    const y = hash(i, 2) * size;
    const len = 30 + hash(i, 3) * 160;
    ctx.strokeStyle = hash(i, 4) > 0.5 ? 'rgb(120 40 24 / 5%)' : 'rgb(0 0 0 / 8%)';
    ctx.lineWidth = 1 + hash(i, 5) * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (hash(i, 6) - 0.5) * 6);
    ctx.stroke();
  }

  const frame = (inset: number, width: number, colour: string) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.strokeRect(inset, inset, size - 2 * inset, size - 2 * inset);
  };
  frame(18, 5, GOLD);
  frame(32, 2, GOLD_DIM);

  // Key-pattern band around the board.
  const boardHalf = (size * boardShare) / 2;
  const inner = size / 2 - boardHalf - 26;
  const cell = 26;
  const span = size - 2 * inner;
  const count = Math.round(span / cell);
  const step = span / count;
  ctx.strokeStyle = 'rgb(200 160 84 / 50%)';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < count; i++) {
    keyCell(ctx, inner + i * step, inner - step, step);
    keyCell(ctx, inner + i * step, size - inner, step);
  }
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 2);
  ctx.translate(-size / 2, -size / 2);
  for (let i = 0; i < count; i++) {
    keyCell(ctx, inner + i * step, inner - step, step);
    keyCell(ctx, inner + i * step, size - inner, step);
  }
  ctx.restore();
  frame(inner - step - 8, 2, GOLD_DIM);
  frame(inner + 4, 2, GOLD_DIM);

  // Fan of gold arcs in each corner, between the band and the border.
  for (const [cx, cy] of [
    [46, 46],
    [size - 46, 46],
    [46, size - 46],
    [size - 46, size - 46],
  ] as const) {
    for (let r = 24; r <= 120; r += 24) {
      ctx.strokeStyle = r % 48 === 0 ? GOLD : GOLD_DIM;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const start = Math.atan2(size / 2 - cy, size / 2 - cx) - Math.PI / 4;
      ctx.arc(cx, cy, r, start, start + Math.PI / 2);
      ctx.stroke();
    }
  }
  return colourTexture(c);
}

/** One cement floor tile ("gạch bông"): quarter discs in the corners that join into rounds, a star in the middle. */
export function floorTile(): CanvasTexture {
  const s = 256;
  const [c, ctx] = canvas(s);
  const cream = '#b9a888';
  const brick = '#7a2f22';
  const teal = '#23403f';
  const ink = '#2a1a14';
  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, s, s);
  for (const [x, y] of [
    [0, 0],
    [s, 0],
    [0, s],
    [s, s],
  ] as const) {
    ctx.fillStyle = brick;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = teal;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  // Eight-point star: two squares turned against each other.
  ctx.translate(s / 2, s / 2);
  for (const [turn, colour, r] of [
    [0, teal, 0.27],
    [Math.PI / 4, teal, 0.27],
    [0, brick, 0.15],
    [Math.PI / 4, cream, 0.075],
  ] as const) {
    ctx.save();
    ctx.rotate(turn);
    ctx.fillStyle = colour;
    ctx.fillRect(-s * r, -s * r, s * r * 2, s * r * 2);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Wear and grout.
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = hash(i, 9) > 0.5 ? 'rgb(255 240 220 / 4%)' : 'rgb(0 0 0 / 7%)';
    ctx.fillRect(hash(i, 7) * s, hash(i, 8) * s, 2 + hash(i, 10) * 5, 2 + hash(i, 11) * 5);
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, s, s);
  const texture = colourTexture(c);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** White disc fading to black: opacity of the floor, full under the platform and gone before the far plane. */
export function floorFade(solidShare: number): CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#fff');
  g.addColorStop(solidShare, '#fff');
  g.addColorStop(solidShare + (1 - solidShare) * 0.5, '#555');
  g.addColorStop(0.98, '#000');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(c);
  texture.minFilter = LinearFilter;
  return texture;
}

/** Soft dark square: the shadow the platform throws on the floor under it. */
export function platformShadow(): CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.shadowColor = 'rgb(0 0 0 / 60%)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = 'rgb(0 0 0 / 60%)';
  ctx.fillRect(52, 52, size - 104, size - 104);
  ctx.fillRect(52, 52, size - 104, size - 104);
  return new CanvasTexture(c);
}

/** Lines of the couplet, a folk Tết verse: the right-hand scroll first. */
export const COUPLET_LINES: readonly (readonly string[])[] = [
  ['Thịt', 'mỡ', 'dưa', 'hành', 'câu', 'đối', 'đỏ'],
  ['Cây', 'nêu', 'tràng', 'pháo', 'bánh', 'chưng', 'xanh'],
];

const COUPLET_FONT = '"Playfair Display", "Noto Serif", Georgia, "Times New Roman", serif';

function paintCouplet(ctx: CanvasRenderingContext2D, w: number, h: number, words: readonly string[], seed: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const paper = ctx.createLinearGradient(0, 0, w, 0);
  paper.addColorStop(0, '#a3160f');
  paper.addColorStop(0.5, '#c2231a');
  paper.addColorStop(1, '#a3160f');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  // Gold flecks pressed into the paper.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgb(236 196 110 / ${10 + hash(i, seed) * 22}%)`;
    ctx.beginPath();
    ctx.arc(hash(i, seed + 1) * w, hash(i, seed + 2) * h, 0.6 + hash(i, seed + 3) * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(22, 22, w - 44, h - 44);

  // A gold coin-shaped seal at the head and the foot.
  const seal = (y: number) => {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w / 2, y, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(w / 2 - 8, y - 8, 16, 16);
  };
  seal(64);
  seal(h - 64);

  const top = 104;
  const row = (h - 2 * top) / words.length;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  words.forEach((word, i) => {
    // Brush lettering: every syllable sits a little off line and off level.
    let size = 82;
    ctx.font = `italic 700 ${size}px ${COUPLET_FONT}`;
    const limit = w - 58;
    const measured = ctx.measureText(word).width;
    if (measured > limit) size = Math.floor((size * limit) / measured);
    ctx.font = `italic 700 ${size}px ${COUPLET_FONT}`;
    ctx.save();
    ctx.translate(w / 2 + (hash(i, seed + 4) - 0.5) * 8, top + row * (i + 0.5));
    ctx.rotate((hash(i, seed + 5) - 0.5) * 0.12);
    ctx.fillStyle = 'rgb(70 8 4 / 55%)';
    ctx.fillText(word, 2.5, 3);
    ctx.fillStyle = '#f2cf7a';
    ctx.fillText(word, 0, 0);
    ctx.restore();
  });
}

/**
 * A texture lettered in the title face: painted at once with whatever serif is available and
 * again when the face has loaded.
 */
function lettered(c: HTMLCanvasElement, face: string, text: string, paint: () => void): CanvasTexture {
  paint();
  const texture = colourTexture(c);
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (fonts && !fonts.check(face)) {
    let alive = true;
    texture.addEventListener('dispose', () => {
      alive = false;
    });
    void fonts
      .load(face, text)
      .then((loaded) => {
        if (!alive || loaded.length === 0) return;
        paint();
        texture.needsUpdate = true;
      })
      .catch(() => undefined);
  }
  return texture;
}

/** Face of a couplet scroll: red paper, gold border and gold lettering, one syllable per line. */
export function coupletScroll(line: number): CanvasTexture {
  const w = 256;
  const h = 832;
  const [c, ctx] = canvas(w, h);
  const words = COUPLET_LINES[line] ?? COUPLET_LINES[0]!;
  return lettered(c, 'italic 700 82px "Playfair Display"', words.join(''), () => paintCouplet(ctx, w, h, words, 20 + line * 40));
}

/** The wish on the nameplate of the golden horse: success arrives as the horse does. */
export const PLAQUE_WISH = 'Mã đáo thành công';

/** Face of the nameplate: red lacquer, a gold line border and the wish in gold on one line. */
export function plaqueFace(): CanvasTexture {
  const w = 1152;
  const h = 192;
  const [c, ctx] = canvas(w, h);
  const size = 118;
  const paint = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const lacquer = ctx.createLinearGradient(0, 0, 0, h);
    lacquer.addColorStop(0, '#b61d15');
    lacquer.addColorStop(1, '#8e130d');
    ctx.fillStyle = lacquer;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    ctx.strokeRect(11, 11, w - 22, h - 22);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 700 ${size}px ${COUPLET_FONT}`;
    const limit = w - 84;
    const measured = ctx.measureText(PLAQUE_WISH).width;
    if (measured > limit) ctx.font = `italic 700 ${Math.floor((size * limit) / measured)}px ${COUPLET_FONT}`;
    ctx.fillStyle = 'rgb(70 8 4 / 55%)';
    ctx.fillText(PLAQUE_WISH, w / 2 + 3.5, h / 2 + 7);
    ctx.fillStyle = '#f2cf7a';
    ctx.fillText(PLAQUE_WISH, w / 2, h / 2 + 3);
  };
  return lettered(c, `italic 700 ${size}px "Playfair Display"`, PLAQUE_WISH, paint);
}
