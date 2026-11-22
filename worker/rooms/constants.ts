import type { Env } from '../env';

export interface Timings {
  /**
   * True when the room's pace (its "Nhịp ván" setting) times the game: the server waits for the clients' animation
   * of each commit before the next automated action and before a person's clock starts. False in fast mode,
   * where nothing waits for an animation.
   */
  paced: boolean;
  /** Pause before a CPU (or a CPU standing in for a human) plays its next action in fast mode; a paced room only uses it as the shortest takeover delay. */
  cpuDelayMs: number;
  /** Milliseconds per second of the host's turn-time choice; shortened in fast mode so timeouts are testable. */
  turnUnitMs: number;
  /** After this long into an action the server rolls for a human whose room has auto-roll on. */
  autoRollMs: number;
  /** The fast-mode pause in a quick match, per animated segment (a roll or a move) of the last commit. */
  quickSegmentMs: number;
  /** How long a disconnected human may hold up a game before a CPU plays for them. */
  playingDisconnectMs: number;
  /** How long a disconnected human keeps a seat while the room is waiting or finished. */
  waitingDisconnectMs: number;
  /** A room with no connected human this long is closed. */
  idleCloseMs: number;
  /** How often the lobby checks that the rooms it lists still exist. */
  lobbySweepMs: number;
}

/** A connected human who lets this many actions in a row run out of time is played for until they come back. */
export const IDLE_AUTOPLAY_AFTER = 2;

const NORMAL: Timings = {
  paced: true,
  cpuDelayMs: 700,
  turnUnitMs: 1_000,
  autoRollMs: 1_500,
  quickSegmentMs: 400,
  playingDisconnectMs: 3_000,
  waitingDisconnectMs: 30_000,
  idleCloseMs: 10 * 60_000,
  lobbySweepMs: 3 * 60_000,
};

const FAST: Timings = {
  paced: false,
  cpuDelayMs: 25,
  turnUnitMs: 400,
  autoRollMs: 20,
  quickSegmentMs: 15,
  playingDisconnectMs: 400,
  waitingDisconnectMs: 8_000,
  idleCloseMs: 10 * 60_000,
  lobbySweepMs: 3_000,
};

/** Timings of one room: the base ones plus the time a connected human has per action, from the room's settings. */
export interface RoomTimings extends Timings {
  turnMs: number;
}

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
/** Internal header carrying the hash of the session the socket was opened under; never sent to a client. */
export const SESSION_HEADER = 'X-Ca-Session';
/** A socket's session is looked up again when it sends a message and its last lookup is at least this old. */
export const SESSION_RECHECK_MS = 30_000;
/** Rooms a user may host at once that have not finished. */
export const MAX_OPEN_ROOMS_PER_HOST = 3;
/** How long a creation counts toward the cap before its room's first listing arrives. */
export const CREATE_RESERVATION_MS = 20_000;
/** Public rooms the lobby broadcasts, newest first. */
export const MAX_LOBBY_LIST = 50;
/** State-changing host messages (add or remove a CPU, rematch): a burst, then a steady rate, per user across reconnects. */
export const HOST_ACTION_BURST = 4;
export const HOST_ACTION_REFILL_PER_SEC = 2;
/** Emotes are broadcast only: a burst, then one every 2 s, per user across sockets and reconnects. */
export const EMOTE_BURST = 3;
export const EMOTE_REFILL_PER_SEC = 0.5;
