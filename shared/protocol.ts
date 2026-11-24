/**
 * Wire contract between the web client and the worker: HTTP JSON bodies and
 * WebSocket messages. Both sides import these types; neither redefines them.
 */
import type { EmoteId } from './emotes';
import type { CpuLevel } from './game/cpu-level';
import { DEFAULT_PACE, type PaceName } from './game/pace';
import { DICE_SHAPING } from './experiments';
import type { Color, GameEvent, GameState, HouseRules } from './game/types';

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
  /** Names of this colour's four horses; '' means the default name, its number (index + 1). */
  horseNames: string[];
  /** The seat's human has missed turns in a row and the server plays for them until they come back ("Tự động"). */
  auto: boolean;
}

/** Turn time choices the host has, in seconds per action. */
export const TURN_SECONDS_OPTIONS = [10, 15, 20, 30, 60] as const;
export type TurnSeconds = (typeof TURN_SECONDS_OPTIONS)[number];
/** Whole-game duration in minutes; 0 means unlimited. */
export const GAME_MINUTES_OPTIONS = [0, 20, 30, 60] as const;
export type GameMinutes = (typeof GAME_MINUTES_OPTIONS)[number];

/** Host-chosen settings of a room, changed only while it is waiting. */
export interface RoomSettings {
  /** Time a human has per action before the server plays for them. */
  turnSeconds: TurnSeconds;
  /**
   * Ván nhanh: quick rule variant (each colour starts with a horse out, a home column opens only after a kick,
   * the first horse home wins); forced single moves play themselves, and every pace has a shorter table for it.
   */
  quick: boolean;
  /** The server rolls for a human on turn after a short pause. */
  autoRoll: boolean;
  gameMinutes: GameMinutes;
  /** Nhịp ván: how long the board animates a roll and a move, and how long the server waits for it. */
  pace: PaceName;
  /** Luật: optional house rules the game starts with. */
  rules: HouseRules;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  turnSeconds: 30,
  quick: false,
  autoRoll: false,
  gameMinutes: 60,
  pace: DEFAULT_PACE,
  // On unless the host turns it off: without it 1s and 6s in a row hand one colour long runs of extra rolls.
  // Off while the dice experiment shapes those runs instead (see `shared/experiments.ts`).
  rules: { tripleBonusForfeit: !DICE_SHAPING },
};
/** Settings as a client sends them: newer fields may be missing from older tabs. */
export type SentRoomSettings = Omit<RoomSettings, 'pace' | 'rules' | 'gameMinutes'> & {
  pace?: PaceName;
  rules?: HouseRules;
  gameMinutes?: GameMinutes;
};
/** Time preselected when the host turns Ván nhanh on while the turn time is still the default. */
export const QUICK_TURN_SECONDS: TurnSeconds = 20;

/** Longest horse name, in characters, after cleaning. */
export const MAX_HORSE_NAME = 12;
/** Most words in a horse name (whitespace-separated). */
export const MAX_HORSE_NAME_WORDS = 6;

/** Whitespace-separated words in `name`. */
export function countWords(name: string): number {
  return name.split(/\s+/).filter(Boolean).length;
}

/** Label of horse `index` given the names its seat holds. */
export function horseLabel(names: readonly string[] | undefined, index: number): string {
  return names?.[index] || String(index + 1);
}

/** A person asking the host to let them take over the CPU playing `color` in a running game. */
export interface JoinRequest {
  user: PublicUser;
  color: Color;
  /** Epoch ms (server clock) at which the request lapses unless the host answered. */
  expiresAt: number;
}

/** How long a request to take over a CPU seat waits for the host. */
export const JOIN_REQUEST_SECONDS = 120;

export interface RoomSnapshot {
  code: string;
  name: string;
  visibility: RoomVisibility;
  hostId: string;
  status: RoomStatus;
  seats: Seat[];
  /** Null while status is 'waiting'. */
  game: GameState | null;
  /** Epoch ms at which the server plays for the current human seat; null when not applicable (or paused). */
  turnDeadline: number | null;
  /** Whole-game deadline in server epoch ms; null for unlimited or finished games. */
  gameDeadline: number | null;
  /** Frozen remaining milliseconds while the host has paused; otherwise null. */
  gamePausedRemaining: number | null;
  /** True while the host has paused the running game. */
  paused: boolean;
  /** CPU difficulty of the whole room; changed by the host while waiting. */
  cpuLevel: CpuLevel;
  /** Host-chosen settings (turn time, quick match, auto-roll). */
  settings: RoomSettings;
  /** Chosen at creation: people with no seat may ask to take over a CPU seat while a game runs. */
  allowTakeover: boolean;
  /** Pending requests to take over a CPU seat, oldest first; at most one per colour. Empty outside a running game. */
  joinRequests: JoinRequest[];
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
  /**
   * CPU seats a person can ask to take over right now: playing rooms that allow it, seats nobody has asked for yet.
   * Absent in entries listed before it existed: 0.
   */
  takeoverSeats?: number;
}

/** POST /api/rooms -> 201 CreateRoomResponse | 4xx ApiError. Requires a session. */
export interface CreateRoomRequest {
  name: string;
  visibility: RoomVisibility;
  seats: number;
  /** "Cho người vào thay máy giữa ván"; absent means off. */
  allowTakeover?: boolean;
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
  /** Host only, while waiting: how well every CPU of the room plays. */
  | { t: 'cpuLevel'; level: CpuLevel }
  /**
   * Host only, while waiting: every setting at once. Tabs loaded before a setting existed leave it out (see
   * `SentRoomSettings`); the room keeps its current value.
   */
  | { t: 'settings'; settings: SentRoomSettings }
  /** Host only: start when at least two seats are occupied. */
  | { t: 'start' }
  | { t: 'roll' }
  | { t: 'move'; horse: number }
  /** Host only, after a finished game: back to 'waiting' with the same seats. */
  | { t: 'rematch' }
  /** Give up the seat. During a game a CPU takes it over. A leaving host may name the seated person who becomes host. */
  | { t: 'leave'; newHost?: string }
  /** No seat, game running in a room that allows it: ask the host for the CPU seat of `color` (replaces an earlier ask). */
  | { t: 'requestSeat'; color: Color }
  /** Withdraw the sender's own request. */
  | { t: 'cancelRequest' }
  /** Host only: let the requester take over the CPU seat they asked for. */
  | { t: 'approveJoin'; userId: string }
  /** Host only: turn the request down; the requester waits a while before asking again. */
  | { t: 'rejectJoin'; userId: string }
  /** Any seated player, while waiting: move to another colour nobody (person or CPU) holds. */
  | { t: 'color'; color: Color }
  /** Name the four horses of the sender's own colour ('' resets one to its number). */
  | { t: 'horseNames'; names: string[] }
  /** Host only, while playing: stop the game (no rolls, moves, CPU turns or turn clock) until resumed. */
  | { t: 'pause' }
  /** Host only: continue a paused game; the player on turn keeps the time that was left. */
  | { t: 'resume' }
  /** Host only: close the room for everyone and cancel the game. */
  | { t: 'closeRoom' }
  /** The sender ends their own autopilot and plays again. */
  | { t: 'back' }
  /** Any seated player, any room status: show a preset emote to everyone in the room. Not stored. */
  | { t: 'emote'; id: EmoteId };

export type RoomServerMessage =
  /**
   * Sent on connect and after every change. `events` describe what led to this snapshot, in order.
   * `serverNow` is the server's clock (epoch ms) when it sent this; `room.turnDeadline` is on that
   * clock, so a client derives its offset from `serverNow` instead of trusting its own time.
   */
  | { t: 'state'; room: RoomSnapshot; events: GameEvent[]; serverNow: number }
  | { t: 'error'; code: string; message: string }
  /** Relayed emote; `seat` indexes `RoomSnapshot.seats`. Never part of a snapshot and never replayed on reconnect. */
  | { t: 'emote'; seat: number; id: EmoteId };

/** Error code for a roll or move that arrives after the match has finished; the client shows no toast for it. */
export const GAME_OVER_CODE = 'game_over';

// ------------------------------------------------------ session end

/** Close code, error code and text for a socket whose login session has ended (signed out, expired, or its user deleted). */
export const CLOSE_SIGNED_OUT = 4006;
export const SIGNED_OUT_CODE = 'signed_out';
export const SIGNED_OUT_MESSAGE = 'Phiên đăng nhập đã kết thúc.';

// ----------------------------------------------------------- lobby socket

export type LobbyClientMessage =
  /** Invite an online player to a room the sender is seated in. */
  { t: 'invite'; toUserId: string; code: string };

export type LobbyServerMessage =
  /** Sent on connect and whenever the public room list or the online list changes. */
  | { t: 'lobby'; rooms: RoomSummary[]; online: PublicUser[] }
  | { t: 'invited'; from: PublicUser; code: string; roomName: string }
  | { t: 'error'; code: string; message: string };
