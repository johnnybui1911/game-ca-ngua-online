/**
 * The kicker's body in the air for a kick. The head stays on its flight path and the rest of the horse swings
 * about it. It leaps with its rear thrown out to the far side, then the rear whips in and hits the victim's rear
 * with its base, at which the victim flies off. Pure numbers of the leap's progress `u` (0 take-off, 1 contact),
 * so the shape is unit-testable and nothing is allocated per frame.
 *
 * Everything is written for a victim on the kicker's right ("near side"); a victim whose rear is on the left
 * mirrors the roll and the reach.
 */
import { clamp01, lerp, smoothstep } from './curves';

/** Share of the leap spent getting into the cocked pose; the rest is the whip. */
export const WIND_UP_SHARE = 0.4;
/**
 * Roll about the horse's forward axis, radians; positive leans the head to its right, negative to its left.
 * Cocked: head to the left, rear thrown out to the right. Through: the head leans out to the right and the base is
 * under it, to the left, against the victim.
 */
export const ROLL_COCKED = -0.9;
export const ROLL_THROUGH = 0.5;
/** How high the head is above the horse's base, board units: the point the body swings about. */
export const HEAD_HEIGHT = 1.2;
/** Distance between the kicker's base and the victim's centre at contact: the two bases touch. */
export const BASE_GAP = 0.86;
/** How far the head ends up out to the near side of the victim's centre: base gap plus the lean of the body. */
export const CONTACT_REACH = BASE_GAP + HEAD_HEIGHT * Math.sin(ROLL_THROUGH);

/** Roll at `u`; the whip speeds up towards contact. */
export function kickRoll(u: number): number {
  const v = clamp01(u);
  if (v < WIND_UP_SHARE) return ROLL_COCKED * smoothstep(v / WIND_UP_SHARE);
  const s = (v - WIND_UP_SHARE) / (1 - WIND_UP_SHARE);
  return lerp(ROLL_COCKED, ROLL_THROUGH, s * s);
}

/**
 * Writes to `out[0..2]` where the base of a horse stands when its head is at (`headX`, `headY`, `headZ`), facing
 * `yaw` and rolled by `roll` about its forward axis: the head is the pivot, so it does not move as the roll changes.
 */
export function baseFromHead(out: number[], headX: number, headY: number, headZ: number, yaw: number, roll: number): number[] {
  const reach = HEAD_HEIGHT * Math.sin(roll);
  // The horse's own right is (-cos yaw, sin yaw) on the ground; a roll to the right moves the head that way.
  out[0] = headX + Math.cos(yaw) * reach;
  out[1] = headY - HEAD_HEIGHT * Math.cos(roll);
  out[2] = headZ - Math.sin(yaw) * reach;
  return out;
}
