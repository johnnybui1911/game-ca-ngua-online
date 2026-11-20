import type { Env } from '../env';

export interface Timings {
  /** Pause before a CPU (or a CPU standing in for a human) plays its next action. */
  cpuDelayMs: number;
  /** Time a connected human has per action before the server plays for them. */
  turnMs: number;
  /** How long a disconnected human may hold up a game before a CPU plays for them. */
  playingDisconnectMs: number;
  /** How long a disconnected human keeps a seat while the room is waiting or finished. */
  waitingDisconnectMs: number;
  /** A room with no connected human this long is closed. */
  idleCloseMs: number;
  /** How often the lobby checks that the rooms it lists still exist. */
  lobbySweepMs: number;
}

const NORMAL: Timings = {
  cpuDelayMs: 700,
  turnMs: 30_000,
  playingDisconnectMs: 3_000,
  waitingDisconnectMs: 30_000,
  idleCloseMs: 10 * 60_000,
  lobbySweepMs: 3 * 60_000,
};

const FAST: Timings = {
  cpuDelayMs: 25,
  turnMs: 20_000,
  playingDisconnectMs: 400,
  waitingDisconnectMs: 8_000,
  idleCloseMs: 10 * 60_000,
  lobbySweepMs: 3_000,
};

/** `ROOM_FAST_TIMERS` comes only from a local `.dev.vars.<env>` file; no request can set it. */
export function timingsFor(env: Env): Timings {
  return env.ROOM_FAST_TIMERS === '1' ? FAST : NORMAL;
}

export const MAX_MESSAGE_BYTES = 1024;
export const MAX_CREATES_PER_MINUTE = 5;
export const INVITE_COOLDOWN_MS = 10_000;
export const LOBBY_BROADCAST_DELAY_MS = 80;
export const MAX_ROOM_NAME = 40;
/** Sockets one user may hold open on one room; the oldest are closed beyond it. */
export const MAX_SOCKETS_PER_USER = 4;
/** Every open page of the site holds one lobby socket, so the lobby allows more per user. */
export const MAX_LOBBY_SOCKETS_PER_USER = 12;
/** Per-socket message budget: a burst of this many, refilled at the rate below. Normal play sends a few a second. */
export const SOCKET_BURST = 100;
export const SOCKET_REFILL_PER_SEC = 50;

/** Internal header carrying the authenticated user from the worker to a Durable Object. */
export const USER_HEADER = 'X-Ca-User';
