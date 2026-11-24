/**
 * Whole seconds left until a server-clock `deadline`. `offset` is `serverNow - localNow` measured
 * when the deadline arrived, so a wrong local clock changes neither the deadline nor the reading.
 */
export function secondsLeft(deadline: number, localNow: number, offset: number): number {
  return Math.max(0, Math.ceil((deadline - (localNow + offset)) / 1000));
}

export function formatGameTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const time = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${time}` : time;
}
