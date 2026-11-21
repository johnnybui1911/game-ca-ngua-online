import { describe, expect, it } from 'vitest';
import { SPRAY_RADIUS, SPRAY_TOP, VASE_HEIGHT, growSpray } from './blossom';

describe('blossom spray', () => {
  it('grows the same spray from the same seed and a different one from another', () => {
    const a = growSpray(11, 60);
    const b = growSpray(11, 60);
    expect(a.flowers.map((f) => f.position.toArray())).toEqual(b.flowers.map((f) => f.position.toArray()));
    expect(growSpray(12, 60).flowers[0]!.position.toArray()).not.toEqual(a.flowers[0]!.position.toArray());
  });

  it('stays inside the space reserved for it above the vase', () => {
    for (const seed of [1, 2, 3, 4, 77]) {
      const spray = growSpray(seed, 120);
      for (const branch of spray.branches) {
        for (const p of branch.points) {
          expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(SPRAY_RADIUS + 1e-6);
          expect(p.y).toBeLessThanOrEqual(SPRAY_TOP);
        }
      }
      for (const flower of spray.flowers) {
        expect(Math.hypot(flower.position.x, flower.position.z)).toBeLessThan(SPRAY_RADIUS + 0.3);
        expect(flower.position.y).toBeGreaterThan(VASE_HEIGHT - 0.2);
      }
    }
  });

  it('keeps the branches when a weaker device asks for fewer flowers', () => {
    const full = growSpray(5, 96);
    const thin = growSpray(5, 36);
    expect(thin.branches.map((b) => b.points.map((p) => p.toArray()))).toEqual(full.branches.map((b) => b.points.map((p) => p.toArray())));
    expect(thin.flowers).toHaveLength(36);
    // A thin spray still reaches every branch.
    expect(thin.flowers.length).toBeGreaterThanOrEqual(thin.branches.length);
  });
});
