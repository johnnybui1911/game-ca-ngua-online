import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CLOSE_UP_HEIGHT, closeUpFraming, defaultPolar, fitOrbitDistance, freeBand, freeBandX, homePose, posePosition } from '../scene/camera';
import type { HudInsets } from '../scene/camera';
import { TRACK } from '../scene/layout';

const FOV = 40;

/**
 * Screen position (CSS px) of the ground point a kick close-up looks at, for the home page's
 * orbiting camera `turn` radians round the board, framed for `insets` as the scene's rig does.
 */
function closeUpPoint(width: number, height: number, insets: HudInsets, turn: number, focus: { x: number; z: number }) {
  const aspect = width / height;
  const band = freeBand(insets, height);
  const bandX = freeBandX(insets, width);
  const polar = defaultPolar(aspect);
  const fit = fitOrbitDistance(aspect, FOV, polar, band.fraction, bandX.fraction);
  const pose = homePose(polar);
  const [px, py, pz] = posePosition({ ...pose, azimuth: pose.azimuth + turn }, fit);
  // A tall viewport leans in half as far.
  const weight = Math.min(1, Math.max(0.5, aspect));
  const shot = closeUpFraming([], px, py, pz, focus.x, focus.z, weight);
  const camera = new PerspectiveCamera(FOV, aspect, 3, 200);
  camera.position.set(shot[0]!, shot[1]!, shot[2]!);
  camera.lookAt(shot[3]!, shot[4]!, shot[5]!);
  camera.setViewOffset(width, height, bandX.shiftPx, band.shiftPx, width, height);
  camera.updateMatrixWorld();
  const p = new Vector3(focus.x, CLOSE_UP_HEIGHT, focus.z).project(camera);
  return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
}

describe('kick close-ups on the home page', () => {
  // Title above and call-to-action band below the board, as measured on the home page.
  const screens = [
    { name: 'desktop', width: 1440, height: 900, insets: { top: 0, bottom: 220 } },
    { name: 'phone', width: 390, height: 844, insets: { top: 130, bottom: 240 } },
  ];

  for (const { name, width, height, insets } of screens) {
    it(`keeps the kick clear of the title and the call-to-action band on a ${name}`, () => {
      // A margin of a horse's height on screen, so the horses themselves stay clear too.
      const margin = height * 0.04;
      for (let step = 0; step < 24; step++) {
        const turn = (step * Math.PI * 2) / 24;
        for (const cell of TRACK) {
          const p = closeUpPoint(width, height, insets, turn, cell);
          expect(p.y, `cell at ${cell.x},${cell.z}, turn ${step}`).toBeGreaterThan(insets.top + margin);
          expect(p.y).toBeLessThan(height - insets.bottom - margin);
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(width);
        }
      }
    });
  }
});
