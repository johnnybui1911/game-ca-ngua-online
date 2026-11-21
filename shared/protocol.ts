/**
 * Wire contract between the web client and the worker: HTTP JSON bodies and
 * WebSocket messages. Both sides import these types; neither redefines them.
 */
import type { Color, GameEvent, GameState } from './game/types';

// ---------------------------------------------------------------- accounts

export type OAuthProvider = 'google' | 'facebook' | 'x';
export const OAUTH_PROVIDERS: OAuthProvider[] = ['google', 'facebook', 'x'];

export interface PublicUser {
  id: string;
  displayName: string;
}

/** The signed-in user as the account endpoints report it. */
export interface MeUser extends PublicUser {
  /** True for a guest: a name and a session, no email, password or provider. */
  guest: boolean;
}

export interface ApiError {
  error: { code: string; message: string };
}

/** POST /api/auth/signup -> 200 MeResponse (session cookie set) | 4xx ApiError */
export interface SignUpRequest {
  email: string;
  password: string;
  displayName: string;
}

/** POST /api/auth/signin -> 200 MeResponse (session cookie set) | 401 ApiError */
export interface SignInRequest {
  email: string;
  password: string;
}

/**
 * GET /api/auth/me -> 200 always.
 * `providers[p]` is true when the deployment holds credentials for provider p;
 * the UI renders no button for the others.
 */
export interface MeResponse {
  user: MeUser | null;
  providers: Record<OAuthProvider, boolean>;
}

/** POST /api/auth/guest -> 200 MeResponse (session cookie set) | 409 already_signed_in | 429 too_many_guests */
export interface GuestRequest {
  displayName: string;
}

// POST /api/auth/signup while the session is a guest's upgrades that user in place (same id and session).
// POST /api/auth/signout -> 204
// GET  /api/auth/oauth/:provider/start?returnTo=/r/ABC123 -> 302 to the provider
// GET  /api/auth/oauth/:provider/callback                 -> 302 to returnTo (same-origin path only)

// ------------------------------------------------------------------- rooms

export const ROOM_CODE_LENGTH = 6;
/** Unambiguous alphabet: no 0/O, 1/I/L. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;
/** Seat index -> colour, by seat count. Two players sit opposite each other. */
export const SEAT_COLORS: Record<number, Color[]> = {
  2: [0, 2],
  3: [0, 1, 2],
  4: [0, 1, 2, 3],
};

export type RoomVisibility = 'public' | 'private';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export type SeatOccupant =
  | { kind: 'human'; user: PublicUser; connected: boolean }
  | { kind: 'cpu'; name: string };

export interface Seat {
  color: Color;
  occupant: SeatOccupant | null;
}

export interface RoomSnapshot {
  code: string;
  name: string;
  visibility: RoomVisibility;
  hostId: string;
  status: RoomStatus;
  seats: Seat[];
  /** Null while status is 'waiting'. */
  game: GameState | null;
  /** Epoch ms at which the server plays for the current human seat; null when not applicable. */
  turnDeadline: number | null;
  /** Increases by one with every snapshot the room broadcasts. */
  seq: number;
}

/** Public lobby entry. */
export interface RoomSummary {
  code: string;
  name: string;
  hostName: string;
  status: RoomStatus;
  seatsTaken: number;
  seatsTotal: number;
}

/** POST /api/rooms -> 201 CreateRoomResponse | 4xx ApiError. Requires a session. */
export interface CreateRoomRequest {
  name: string;
  visibility: RoomVisibility;
  seats: number;
}
export interface CreateRoomResponse {
  code: string;
}

// GET /api/rooms/:code -> 200 RoomSummary | 404 ApiError. Public: the entry screen names the room before a session exists.
// GET /api/rooms/:code/ws  (WebSocket upgrade, requires a session) -> room socket
// GET /api/lobby/ws        (WebSocket upgrade, requires a session) -> lobby socket

// ------------------------------------------------------------ room socket

export type RoomClientMessage =
  /** Host only, while waiting: put a CPU on an empty seat. */
  | { t: 'addCpu'; seat: number }
  /** Host only, while waiting: remove the CPU from a seat. */
  | { t: 'removeCpu'; seat: number }
  /** Host only: start when at least two seats are occupied. */
  | { t: 'start' }
  | { t: 'roll' }
  | { t: 'move'; horse: number }
  /** Host only, after a finished game: back to 'waiting' with the same seats. */
  | { t: 'rematch' }
  /** Give up the seat. During a game a CPU takes it over. */
  | { t: 'leave' };

export type RoomServerMessage =
  /**
   * Sent on connect and after every change. `events` describe what led to this snapshot, in order.
   * `serverNow` is the server's clock (epoch ms) when it sent this; `room.turnDeadline` is on that
   * clock, so a client derives its offset from `serverNow` instead of trusting its own time.
   */
  | { t: 'state'; room: RoomSnapshot; events: GameEvent[]; serverNow: number }
  | { t: 'error'; code: string; message: string };

// ----------------------------------------------------------- lobby socket

export type LobbyClientMessage =
  /** Invite an online player to a room the sender is seated in. */
  { t: 'invite'; toUserId: string; code: string };

export type LobbyServerMessage =
  /** Sent on connect and whenever the public room list or the online list changes. */
  | { t: 'lobby'; rooms: RoomSummary[]; online: PublicUser[] }
  | { t: 'invited'; from: PublicUser; code: string; roomName: string }
  | { t: 'error'; code: string; message: string };
