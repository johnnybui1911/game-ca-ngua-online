/**
 * Whole seconds left until a server-clock `deadline`. `offset` is `serverNow - localNow` measured
 * when the deadline arrived, so a wrong local clock changes neither the deadline nor the reading.
 */
export function secondsLeft(deadline: number, localNow: number, offset: number): number {
  return Math.max(0, Math.ceil((deadline - (localNow + offset)) / 1000));
}
