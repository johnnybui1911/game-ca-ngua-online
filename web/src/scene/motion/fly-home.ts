/**
 * The flight of horses going back to their stables all at once: when a game on the board ends
 * without being played out (the home page's demo gives the board to a real match). Each horse
 * takes off a little after the one before and flies one arc home. Pure numbers, no allocation
 * per frame.
 */
import { arc, clamp01, dampedSpring, lerp, lerpAngle, smoothstep } from './curves';

/** Seconds one horse is in the air, including its crouch and landing. */
export const FLY_HOME_FLIGHT_SECONDS = 0.6;
/** Seconds between the first and the last take-off. */
export const FLY_HOME_STAGGER_SECONDS = 0.4;
/** Reduced motion: every horse slides straight home together. */
export const FLY_HOME_SLIDE_SECONDS = 0.25;

/** Share of a flight spent crouching before take-off, and springing back after landing. */
const CROUCH_SHARE = 0.14;
const LANDING_SHARE = 0.2;
/** Apex of the arc: a base height plus a share of the distance, so a far horse flies a higher arc. */
const BASE_LIFT = 1.5;
const LIFT_PER_UNIT = 0.14;
const MAX_LIFT = 3.2;
/** Nose up on the way up, down on the way down, radians at the steepest. */
const FLIGHT_PITCH = 0.3;

export interface HomeFlight {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  yawFrom: number;
  yawTo: number;
  /** Seconds after the start at which this horse takes off. */
  delay: number;
}

/** Take-off time of flight `index` of `count`: evenly spread, the first at once. */
export function flyHomeDelay(index: number, count: number): number {
  return count <= 1 ? 0 : (FLY_HOME_STAGGER_SECONDS * index) / (count - 1);
}

/** Seconds until the last of `count` horses has landed. */
export function flyHomeSeconds(count: number, reduced = false): number {
  if (count <= 0) return 0;
  if (reduced) return FLY_HOME_SLIDE_SECONDS;
  return FLY_HOME_FLIGHT_SECONDS + (count > 1 ? FLY_HOME_STAGGER_SECONDS : 0);
}

/**
 * Pose of a horse `t` seconds after the start: writes x, height above its resting height, z, yaw,
 * pitch and stretch to `out[0..5]`. Before its take-off the horse stands where it was; after its
 * landing it stands in its stable.
 */
export function flyHomePose(out: number[], flight: HomeFlight, t: number, reduced = false): number[] {
  if (reduced) {
    const u = smoothstep(t / FLY_HOME_SLIDE_SECONDS);
    out[0] = lerp(flight.fromX, flight.toX, u);
    out[1] = 0;
    out[2] = lerp(flight.fromZ, flight.toZ, u);
    out[3] = flight.yawTo;
    out[4] = 0;
    out[5] = 1;
    return out;
  }
  const u = clamp01((t - flight.delay) / FLY_HOME_FLIGHT_SECONDS);
  const airEnd = 1 - LANDING_SHARE;
  if (u < CROUCH_SHARE) {
    // Gathers itself, turning towards home.
    const c = u / CROUCH_SHARE;
    out[0] = flight.fromX;
    out[1] = 0;
    out[2] = flight.fromZ;
    out[3] = flight.yawFrom;
    out[4] = 0;
    out[5] = 1 - 0.22 * smoothstep(c);
    return out;
  }
  if (u >= airEnd) {
    out[0] = flight.toX;
    out[1] = 0;
    out[2] = flight.toZ;
    out[3] = flight.yawTo;
    out[4] = 0;
    out[5] = 1 - 0.28 * dampedSpring((u - airEnd) / LANDING_SHARE, 1, 3);
    return out;
  }
  const f = (u - CROUCH_SHARE) / (airEnd - CROUCH_SHARE);
  const along = smoothstep(f);
  const lift = Math.min(MAX_LIFT, BASE_LIFT + LIFT_PER_UNIT * Math.hypot(flight.toX - flight.fromX, flight.toZ - flight.fromZ));
  out[0] = lerp(flight.fromX, flight.toX, along);
  out[1] = lift * arc(f);
  out[2] = lerp(flight.fromZ, flight.toZ, along);
  out[3] = lerpAngle(flight.yawFrom, flight.yawTo, along);
  out[4] = -FLIGHT_PITCH * Math.sin(Math.PI * 2 * f);
  out[5] = 1 + 0.12 * arc(f);
  return out;
}
