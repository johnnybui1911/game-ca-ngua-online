import { describe, expect, it } from 'vitest';
import { HEAD_HEIGHT, ROLL_COCKED, ROLL_THROUGH, WIND_UP_SHARE, baseFromHead, kickRoll } from './kick-swing';

describe('kickRoll', () => {
  it('starts upright, cocks with the head to the left, then whips the rear through to the other side', () => {
    expect(kickRoll(0)).toBeCloseTo(0, 9);
    expect(kickRoll(WIND_UP_SHARE)).toBeCloseTo(ROLL_COCKED, 9);
    expect(ROLL_COCKED).toBeLessThan(0);
    expect(kickRoll(1)).toBeCloseTo(ROLL_THROUGH, 9);
    expect(ROLL_THROUGH).toBeGreaterThan(0);
  });

  it('whips steadily, and faster towards contact', () => {
    let last = kickRoll(WIND_UP_SHARE);
    let lastStep = 0;
    for (let u = WIND_UP_SHARE + 0.05; u <= 1 + 1e-9; u += 0.05) {
      const roll = kickRoll(u);
      const step = roll - last;
      expect(step).toBeGreaterThan(0);
      expect(step).toBeGreaterThanOrEqual(lastStep - 1e-9);
      last = roll;
      lastStep = step;
    }
  });
});

describe('baseFromHead', () => {
  it('stands the base straight under the head when upright', () => {
    const out = baseFromHead([0, 0, 0], 2, 3, -1, 0.7, 0);
    expect(out[0]).toBeCloseTo(2, 9);
    expect(out[1]).toBeCloseTo(3 - HEAD_HEIGHT, 9);
    expect(out[2]).toBeCloseTo(-1, 9);
  });

  it('keeps the head where it is whatever the roll: the head point of the rolled horse is the pivot', () => {
    const yaw = 1.1;
    for (const roll of [ROLL_COCKED, -0.4, 0, 0.3, ROLL_THROUGH]) {
      const base = baseFromHead([0, 0, 0], 5, 4, 2, yaw, roll);
      // The head is HEAD_HEIGHT up the horse's own axis: (-sin roll) along its local x, cos roll up.
      const head = [base[0]! - Math.cos(yaw) * HEAD_HEIGHT * -Math.sin(roll) * -1, base[1]! + HEAD_HEIGHT * Math.cos(roll), base[2]! + Math.sin(yaw) * HEAD_HEIGHT * -Math.sin(roll) * -1];
      expect(head[0]).toBeCloseTo(5, 9);
      expect(head[1]).toBeCloseTo(4, 9);
      expect(head[2]).toBeCloseTo(2, 9);
    }
  });

  it('puts the base to the horse\'s right when the head is rolled to its left, so the head leads to the left', () => {
    // Facing +z (yaw 0), the horse's right is -x: a head rolled left (negative roll) leaves the base on the right.
    const base = baseFromHead([0, 0, 0], 0, 2, 0, 0, ROLL_COCKED);
    expect(base[0]).toBeLessThan(0);
  });
});
