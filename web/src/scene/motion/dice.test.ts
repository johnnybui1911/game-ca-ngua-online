import { describe, expect, it } from 'vitest';
import { DIE_HEIGHTS, DIE_LANDINGS, DIE_ROCK, createDieTumble, dieTumble, tiltedRise } from './dice';

const at = (u: number) => ({ ...dieTumble(u, createDieTumble()) });

describe('die tumble', () => {
  it('starts thrown and ends at rest', () => {
    expect(at(0)).toEqual({ travel: 1, lift: DIE_HEIGHTS[0], spin: 1, rock: 0 });
    expect(at(1)).toEqual({ travel: 0, lift: 0, spin: 0, rock: 0 });
    expect(at(2)).toEqual(at(1));
  });

  it('touches down at each landing and bounces lower each time', () => {
    for (const t of DIE_LANDINGS) expect(at(t).lift).toBeCloseTo(0, 9);
    const top = (from: number, to: number) => {
      let best = 0;
      for (let u = from; u <= to; u += 0.001) best = Math.max(best, at(u).lift);
      return best;
    };
    const first = top(DIE_LANDINGS[0], DIE_LANDINGS[1]);
    const second = top(DIE_LANDINGS[1], DIE_LANDINGS[2]);
    expect(first).toBeCloseTo(DIE_HEIGHTS[1], 3);
    expect(second).toBeCloseTo(DIE_HEIGHTS[2], 3);
    expect(DIE_HEIGHTS[0]).toBeGreaterThan(first);
    expect(first).toBeGreaterThan(second * 2);
    // Each bounce is shorter than the one before, as a lower bounce must be.
    expect(DIE_LANDINGS[2] - DIE_LANDINGS[1]).toBeLessThan(DIE_LANDINGS[1] - DIE_LANDINGS[0]);
  });

  it('stops travelling and tumbling at the last landing, losing speed all the way', () => {
    let last = at(0);
    for (let u = 0.01; u <= 1; u += 0.01) {
      const now = at(u);
      expect(now.travel).toBeLessThanOrEqual(last.travel);
      expect(now.spin).toBeLessThanOrEqual(last.spin);
      last = now;
    }
    expect(at(DIE_LANDINGS[2]).travel).toBe(0);
    expect(at(DIE_LANDINGS[2]).spin).toBe(0);
    // Slowing down: more ground covered in the first tenth than in the tenth before the last landing.
    expect(at(0).travel - at(0.1).travel).toBeGreaterThan(at(DIE_LANDINGS[2] - 0.1).travel);
  });

  it('settles by rocking on the ground, both ways, less each time', () => {
    const settle: number[] = [];
    for (let u = DIE_LANDINGS[2]; u <= 1; u += 0.002) {
      const m = at(u);
      expect(m.lift).toBe(0);
      expect(Math.abs(m.rock)).toBeLessThanOrEqual(DIE_ROCK);
      settle.push(m.rock);
    }
    expect(Math.max(...settle)).toBeGreaterThan(0.05);
    expect(Math.min(...settle)).toBeLessThan(-0.01);
    const tail = settle.slice(Math.floor(settle.length * 0.75)).map(Math.abs);
    expect(Math.max(...tail)).toBeLessThan(0.01);
    for (let u = 0; u < DIE_LANDINGS[2]; u += 0.01) expect(at(u).rock).toBe(0);
  });

  it('writes into the object it is given', () => {
    const out = createDieTumble();
    expect(dieTumble(0.5, out)).toBe(out);
  });

  it('lifts a tilted cube so its lower edge stays on the ground', () => {
    expect(tiltedRise(0.32, 0)).toBe(0);
    expect(tiltedRise(0.32, 0.2)).toBeCloseTo(tiltedRise(0.32, -0.2), 12);
    // On its edge (45°) the centre is half a face diagonal up.
    expect(0.32 + tiltedRise(0.32, Math.PI / 4)).toBeCloseTo(0.32 * Math.SQRT2, 12);
  });
});
