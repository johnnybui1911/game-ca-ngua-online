import { describe, expect, it } from 'vitest';
import { AMBIENT_FPS, MOTION_FPS, createFrameGate, foldSignature, frameDrawn, frameDue } from './frame-gate';

/** Runs a 60 Hz frame loop for `seconds`, with `signatureAt` naming the picture of each frame; returns the times drawn. */
function run(seconds: number, signatureAt: (ms: number) => number): number[] {
  const gate = createFrameGate();
  const drawn: number[] = [];
  for (let frame = 0; frame <= seconds * 60; frame++) {
    const now = 5000 + (frame * 1000) / 60;
    const signature = signatureAt(now - 5000);
    if (!frameDue(gate, signature, now)) continue;
    frameDrawn(gate, signature, now);
    drawn.push(now - 5000);
  }
  return drawn;
}

describe('frame gate', () => {
  it('draws the first picture at once', () => {
    expect(frameDue(createFrameGate(), 7, 123)).toBe(true);
  });

  it('draws a still board at the ambient rate', () => {
    const drawn = run(10, () => 1);
    expect(drawn.length).toBeGreaterThanOrEqual(10 * AMBIENT_FPS - 1);
    expect(drawn.length).toBeLessThanOrEqual(10 * AMBIENT_FPS + 1);
  });

  it('draws a moving board at the motion rate, never faster', () => {
    const drawn = run(10, (ms) => ms);
    expect(drawn.length).toBeGreaterThanOrEqual(10 * MOTION_FPS - 1);
    expect(drawn.length).toBeLessThanOrEqual(10 * MOTION_FPS + 1);
  });

  it('draws the pose a movement ends on without waiting for the ambient slot', () => {
    // Moves for one second, then rests on signature -1.
    const drawn = run(3, (ms) => (ms < 1000 ? ms : -1));
    const rest = drawn.find((ms) => ms >= 1000);
    expect(rest).toBeDefined();
    expect(rest! - 1000).toBeLessThanOrEqual(1000 / MOTION_FPS + 1000 / 60);
  });
});

describe('foldSignature', () => {
  it('tells a moved value from an unmoved one', () => {
    const still = foldSignature(0, [1, 2, 3]);
    expect(foldSignature(0, [1, 2, 3])).toBe(still);
    expect(foldSignature(0, [1, 2.01, 3])).not.toBe(still);
  });

  it('depends on the order of the values', () => {
    expect(foldSignature(0, [1, 2])).not.toBe(foldSignature(0, [2, 1]));
  });

  it('reads only `count` values', () => {
    expect(foldSignature(0, [1, 2, 99], 2)).toBe(foldSignature(0, [1, 2]));
  });
});
