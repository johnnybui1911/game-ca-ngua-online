import { describe, expect, it } from 'vitest';
import { COLORS } from '../../../../shared/game/types';
import { defaultPolar, fitCameraDistance, seatCameraPosition } from '../camera';
import { SLAB_HALF } from '../layout';
import { LANTERN_CENTRES, SET_PIECES, TABLE_HALF, TABLE_TOP_Y, hidesBoard, pieceOutline, piecesOf } from './layout';
import { LANTERN_RADIUS, SCROLL_CENTRE_Y, SCROLL_HEIGHT } from './pieces';
import type { Point3 } from './layout';

const FOV = 40;
const VIEWPORTS: [string, number][] = [
  ['phone portrait', 390 / 844],
  ['tablet portrait', 3 / 4],
  ['square', 1],
  ['desktop', 1440 / 900],
  ['wide desktop', 16 / 9],
  ['ultrawide', 21 / 9],
];

/** NDC of a point for a camera at `eye` looking at the board centre. */
function project(eye: Point3, p: Point3, aspect: number): { x: number; y: number } {
  const len = Math.hypot(eye[0], eye[1], eye[2]);
  const f = [-eye[0] / len, -eye[1] / len, -eye[2] / len] as const;
  const rl = Math.hypot(f[2], f[0]);
  const r = [-f[2] / rl, 0, f[0] / rl] as const;
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] as const;
  const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]] as const;
  const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const tanV = Math.tan((FOV * Math.PI) / 360);
  return {
    x: (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (depth * tanV * aspect),
    y: (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (depth * tanV),
  };
}

describe('sight lines', () => {
  it('tells a point in front of the board from one beside or behind it', () => {
    const eye: Point3 = [0, 17, 24];
    expect(hidesBoard(eye, [0, 8, 14])).toBe(true);
    expect(hidesBoard(eye, [0, 2, 14])).toBe(false);
    expect(hidesBoard(eye, [0, 6, -14])).toBe(false);
    expect(hidesBoard(eye, [15, 6, 0])).toBe(false);
  });

  for (const [name, aspect] of VIEWPORTS) {
    it(`no set piece hides the board or a stable from any seat (${name})`, () => {
      const polar = defaultPolar(aspect);
      // The HUD can push the camera further out along the same line; cover that range too.
      for (const zoom of [1, 1.3, 1.7]) {
        const distance = fitCameraDistance(aspect, FOV, polar) * zoom;
        for (const seat of COLORS) {
          const eye = seatCameraPosition(seat, distance, polar);
          for (const piece of SET_PIECES) {
            for (const point of pieceOutline(piece)) {
              expect(hidesBoard(eye, point), `${piece.kind} of side ${piece.side} from seat ${seat} at zoom ${zoom}`).toBe(false);
            }
          }
        }
      }
    });
  }
});

describe('set placement', () => {
  it('stands on the platform, clear of the board slab', () => {
    for (const piece of SET_PIECES) {
      const reach = Math.max(Math.abs(piece.x), Math.abs(piece.z));
      expect(reach + piece.radius, piece.kind).toBeLessThanOrEqual(TABLE_HALF);
      expect(reach - piece.radius, piece.kind).toBeGreaterThan(SLAB_HALF);
    }
  });

  it('keeps pieces from standing inside each other', () => {
    const stands = SET_PIECES.filter((p) => p.kind !== 'lantern');
    for (const a of stands) {
      for (const b of stands) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.radius + b.radius);
      }
    }
  });

  it('is the same tableau turned a quarter for every seat', () => {
    for (const kind of ['offering', 'lantern', 'couplet', 'blossom'] as const) {
      const radii = piecesOf(kind).map((p) => Math.hypot(p.x, p.z).toFixed(3));
      expect(new Set(radii).size, kind).toBe(1);
      expect(piecesOf(kind).length % 4).toBe(0);
    }
  });

  for (const [name, aspect] of VIEWPORTS.filter(([, a]) => a < 2)) {
    it(`shows both lanterns, the couplets and the offering of the far side to every seat (${name})`, () => {
      const polar = defaultPolar(aspect);
      const distance = fitCameraDistance(aspect, FOV, polar);
      for (const seat of COLORS) {
        const eye = seatCameraPosition(seat, distance, polar);
        const lanterns = piecesOf('lantern')
          .map((p, i) => ({ p, at: LANTERN_CENTRES[i]! }))
          .filter(({ p }) => p.side === seat);
        expect(lanterns).toHaveLength(2);
        for (const { at } of lanterns) {
          // The whole paper body, up to its top.
          const ndc = project(eye, [at[0], at[1] + LANTERN_RADIUS, at[2]], aspect);
          expect(Math.abs(ndc.x)).toBeLessThan(1);
          expect(Math.abs(ndc.y)).toBeLessThan(1);
        }
        for (const piece of SET_PIECES.filter((p) => p.side === seat && (p.kind === 'couplet' || p.kind === 'offering'))) {
          // An offering up to its top, a scroll up to its first syllable.
          const top = piece.kind === 'couplet' ? SCROLL_CENTRE_Y + SCROLL_HEIGHT * 0.36 : piece.height;
          const ndc = project(eye, [piece.x, TABLE_TOP_Y + top, piece.z], aspect);
          expect(Math.abs(ndc.x), piece.kind).toBeLessThan(1);
          expect(Math.abs(ndc.y), piece.kind).toBeLessThan(1);
        }
      }
    });
  }

  it('gives each seat one yellow and one pink blossom on its far corners, and both couplet lines', () => {
    for (const seat of COLORS) {
      const next = ((seat + 1) % 4) as (typeof COLORS)[number];
      const blossoms = piecesOf('blossom').filter((p) => p.side === seat || p.side === next);
      expect(blossoms.map((p) => p.variant).sort()).toEqual([0, 1]);
      const couplets = piecesOf('couplet').filter((p) => p.side === seat);
      expect(couplets.map((p) => p.variant).sort()).toEqual([0, 1]);
    }
  });
});
