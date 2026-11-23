import { describe, expect, it } from 'vitest';
import { CLOSE_UP_HOLD_SECONDS, KickCamera, PULLED_BACK_WEIGHT, SHAKE_SECONDS, TIGHT_WEIGHT } from './kick-camera';

const DT = 1 / 60;
function run(cam: KickCamera, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) cam.update(DT);
}

describe('KickCamera', () => {
  it('is idle until a kick is announced', () => {
    const cam = new KickCamera();
    run(cam, 1);
    expect(cam.active).toBe(false);
    expect(cam.weight).toBe(0);
    expect(cam.shakeTime).toBe(-1);
  });

  it('leans in before contact, holds, then returns to the player framing', () => {
    const cam = new KickCamera();
    cam.start(3, -4, 0.3);
    expect(cam.focusX).toBe(3);
    expect(cam.focusZ).toBe(-4);
    run(cam, 0.3);
    expect(cam.weight).toBeGreaterThan(0.95);
    cam.contact();
    run(cam, CLOSE_UP_HOLD_SECONDS - 2 * DT);
    expect(cam.weight).toBeGreaterThan(0.95);
    run(cam, 1.2);
    expect(cam.weight).toBe(0);
    expect(cam.active).toBe(false);
  });

  it('a slow-motion kick zooms in tighter than a plain one, then pulls back once the victim is flung', () => {
    const cam = new KickCamera();
    cam.start(3, -4, 0.5, 2.5);
    run(cam, 0.5);
    expect(cam.weight).toBeGreaterThan(1.3);
    cam.contact();
    run(cam, 0.3);
    expect(cam.weight).toBeLessThanOrEqual(TIGHT_WEIGHT + 1e-9);
    expect(cam.weight).toBeGreaterThan(1.3);
    // The victim lifts: the camera stays tight and follows it.
    cam.follow(3.5, -4.2, 1, false);
    run(cam, 0.3);
    expect(cam.weight).toBeGreaterThan(1.3);
    expect(cam.focusY).toBeGreaterThan(0.5);
    // Once it is flung the camera backs off, but stays on it until the close-up ends.
    cam.follow(5, -6, 3, true);
    run(cam, 1);
    expect(cam.weight).toBeLessThan(PULLED_BACK_WEIGHT + 0.1);
    expect(cam.weight).toBeGreaterThan(0);
    run(cam, 3);
    expect(cam.weight).toBe(0);
  });

  it('never overshoots: the weight stays between the framing and the full close-up', () => {
    const cam = new KickCamera();
    cam.start(1, 1, 0.05);
    for (let i = 0; i < 200; i++) {
      if (i === 9) cam.contact();
      cam.update(DT);
      expect(cam.weight).toBeGreaterThanOrEqual(0);
      expect(cam.weight).toBeLessThanOrEqual(1);
    }
  });

  it('shakes from contact for a short while, also without a close-up', () => {
    const cam = new KickCamera();
    cam.contact();
    expect(cam.active).toBe(true);
    expect(cam.weight).toBe(0);
    run(cam, SHAKE_SECONDS / 2);
    expect(cam.shakeTime).toBeGreaterThan(0);
    run(cam, SHAKE_SECONDS);
    expect(cam.shakeTime).toBe(-1);
    expect(cam.active).toBe(false);
  });

  it('does not start a close-up while the player is moving the camera', () => {
    const cam = new KickCamera();
    cam.setUserMoving(true);
    cam.start(3, 3, 0.2);
    run(cam, 0.2);
    expect(cam.weight).toBe(0);
    cam.setUserMoving(false);
    cam.start(3, 3, 0.2);
    run(cam, 0.2);
    expect(cam.weight).toBeGreaterThan(0.5);
  });

  it('lets go at once when the player grabs the camera during a close-up', () => {
    const cam = new KickCamera();
    cam.start(3, 3, 0.2);
    run(cam, 0.2);
    const before = cam.weight;
    cam.setUserMoving(true);
    cam.contact();
    run(cam, 0.1);
    expect(cam.weight).toBeLessThan(before);
    run(cam, 1.5);
    expect(cam.weight).toBe(0);
  });

  it('returns on its own when the announced contact never comes', () => {
    const cam = new KickCamera();
    cam.start(3, 3, 0.2);
    run(cam, 2);
    expect(cam.active).toBe(false);
    expect(cam.weight).toBe(0);
  });

  it('glides to a second kick instead of cutting to it', () => {
    const cam = new KickCamera();
    cam.start(4, 0, 0.2);
    run(cam, 0.2);
    cam.contact();
    cam.start(-4, 0, 0.2);
    cam.update(DT);
    expect(cam.focusX).toBeGreaterThan(0);
    expect(cam.focusX).toBeLessThan(4);
    run(cam, 0.5);
    expect(cam.focusX).toBeCloseTo(-4, 1);
  });

  it('keeps the framing and does not shake while the picture must stay calm', () => {
    const cam = new KickCamera(() => true);
    cam.start(3, -4, 0.2);
    run(cam, 0.2);
    cam.contact();
    run(cam, 0.1);
    expect(cam.active).toBe(false);
    expect(cam.weight).toBe(0);
  });

  it('lets go of a close-up when the picture turns calm', () => {
    let calm = false;
    const cam = new KickCamera(() => calm);
    cam.start(3, -4, 0.3);
    run(cam, 0.3);
    const leaned = cam.weight;
    expect(leaned).toBeGreaterThan(0.8);
    calm = true;
    run(cam, 0.1);
    expect(cam.weight).toBeLessThan(leaned);
    run(cam, 2);
    expect(cam.active).toBe(false);
  });
});
