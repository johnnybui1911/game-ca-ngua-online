/**
 * Timeline of the camera's reaction to a kick: it leans in towards the cell where the kick lands, holds for a
 * moment after contact, then returns to the player's framing; contact also starts a short shake. Holds only
 * numbers (no three.js), so the rig reads them each frame and the rules are unit-testable.
 *
 * The close-up never fights the player: it does not start while they are moving the camera, and it lets go as
 * soon as they start.
 */

/** Seconds the close-up stays on the contact point after the hit. */
export const CLOSE_UP_HOLD_SECONDS = 0.22;
/** The lean-in takes at least this long, however soon the kick lands. */
const MIN_LEAN_IN_SECONDS = 0.14;
/** Contact that never comes (the batch was dropped) ends the close-up this long after it was due. */
const MISSED_CONTACT_SECONDS = 0.15;
/** Approach rate of the return, per second: about half a second to get back. */
const RETURN_RATE = 7;
const FOCUS_RATE = 14;
export const SHAKE_SECONDS = 0.26;

import { closeUpPolicy } from './close-up-policy';

type Phase = 'idle' | 'in' | 'hold' | 'out';

export class KickCamera {
  /** 0 = the player's framing, 1 = full close-up. */
  weight = 0;
  /** Ground point the close-up looks at. */
  focusX = 0;
  focusZ = 0;
  /** Seconds since the last contact, or -1 when no shake is playing. */
  shakeTime = -1;

  private phase: Phase = 'idle';
  private t = 0;
  private leanIn = MIN_LEAN_IN_SECONDS;
  private targetX = 0;
  private targetZ = 0;
  private userMoving = false;

  /** `isCalm` is asked at every kick and frame: while true the camera keeps its framing, and a running close-up lets go. */
  constructor(private readonly isCalm: () => boolean = closeUpPolicy.isCalm) {}

  /** True while the camera is away from the player's framing or shaking. */
  get active(): boolean {
    return this.phase !== 'idle' || this.shakeTime >= 0;
  }

  /** A kick will land at ground point (x, z) in `contactIn` seconds. */
  start(x: number, z: number, contactIn: number): void {
    if (this.userMoving || this.isCalm()) return;
    if (this.phase === 'idle') {
      this.focusX = x;
      this.focusZ = z;
    }
    this.targetX = x;
    this.targetZ = z;
    this.leanIn = Math.max(MIN_LEAN_IN_SECONDS, contactIn);
    this.phase = 'in';
    this.t = 0;
  }

  /** The kick landed: shake, and hold the close-up if one is running. */
  contact(): void {
    if (this.isCalm()) return;
    this.shakeTime = 0;
    if (this.phase === 'in') {
      this.phase = 'hold';
      this.t = 0;
    }
  }

  /** The player started or stopped moving the camera themselves. */
  setUserMoving(moving: boolean): void {
    this.userMoving = moving;
    if (moving && this.phase !== 'idle') this.phase = 'out';
  }

  update(dt: number): void {
    if (this.shakeTime >= 0) {
      this.shakeTime += dt;
      if (this.shakeTime >= SHAKE_SECONDS) this.shakeTime = -1;
    }
    if (this.phase === 'idle') return;
    this.t += dt;
    if (this.isCalm()) this.phase = 'out';
    if (this.phase === 'in' && this.t > this.leanIn + MISSED_CONTACT_SECONDS) this.phase = 'out';
    else if (this.phase === 'hold' && this.t > CLOSE_UP_HOLD_SECONDS) this.phase = 'out';

    const goal = this.phase === 'out' ? 0 : 1;
    // Exponential approach: the lean-in is all but complete when the kick lands.
    const rate = this.phase === 'out' ? RETURN_RATE : 4.5 / this.leanIn;
    this.weight += (goal - this.weight) * (1 - Math.exp(-dt * rate));
    const k = 1 - Math.exp(-dt * FOCUS_RATE);
    this.focusX += (this.targetX - this.focusX) * k;
    this.focusZ += (this.targetZ - this.focusZ) * k;
    if (this.phase === 'out' && this.weight < 0.002) {
      this.weight = 0;
      this.phase = 'idle';
    }
  }
}
