import type { Color, DiceValue } from '../../shared/game/types';
import type {
  PublicUser,
  RoomSnapshot,
  RoomStatus,
  RoomSummary,
  RoomVisibility,
  Seat,
  SeatOccupant,
} from '../../shared/protocol';
import type { GameState } from '../../shared/game/types';
import type { Timings } from './constants';

/** Occupant as persisted: connection state is derived from open sockets, never stored. */
export type StoredOccupant = { kind: 'human'; user: PublicUser } | { kind: 'cpu'; name: string };
export interface StoredSeat {
  color: Color;
  occupant: StoredOccupant | null;
}

/** Everything a room needs to survive eviction. Deadlines are absolute epoch ms. */
export interface RoomState {
  code: string;
  name: string;
  visibility: RoomVisibility;
  hostId: string;
  status: RoomStatus;
  seats: StoredSeat[];
  game: GameState | null;
  seq: number;
  /** Next moment the server plays an action itself (CPU, auto-play for a human); null when none is pending. */
  dueAt: number | null;
  /** userId -> when their last socket closed (or the seat was created without one). */
  disconnectedSince: Record<string, number>;
  /** Since when no seated human has an open socket; null while at least one has. */
  noHumanConnectedSince: number | null;
}

export function seatIndexOfUser(state: RoomState, userId: string): number {
  return state.seats.findIndex((s) => s.occupant?.kind === 'human' && s.occupant.user.id === userId);
}

export function firstEmptySeat(state: RoomState): number {
  return state.seats.findIndex((s) => s.occupant === null);
}

export function humanUsers(state: RoomState): PublicUser[] {
  const out: PublicUser[] = [];
  for (const s of state.seats) if (s.occupant?.kind === 'human') out.push(s.occupant.user);
  return out;
}

export function occupiedCount(state: RoomState): number {
  return state.seats.filter((s) => s.occupant !== null).length;
}

/** Smallest "Máy n" not used by another CPU seat. */
export function nextCpuName(state: RoomState): string {
  const used = new Set<string>();
  for (const s of state.seats) if (s.occupant?.kind === 'cpu') used.add(s.occupant.name);
  for (let n = 1; ; n++) if (!used.has(`Máy ${n}`)) return `Máy ${n}`;
}

/** The earliest-seated human, who inherits the host role; null when no human is seated. */
export function pickHost(state: RoomState): string | null {
  return humanUsers(state)[0]?.id ?? null;
}

/** Seat whose colour has the turn while a game runs. */
export function currentSeatIndex(state: RoomState): number {
  if (state.status !== 'playing' || state.game === null) return -1;
  return state.seats.findIndex((s) => s.color === state.game?.turn);
}

export function isConnected(connected: ReadonlySet<string>, occupant: StoredOccupant | null): boolean {
  return occupant?.kind === 'human' && connected.has(occupant.user.id);
}

/** When the server should next play for the colour on turn, given who is connected. */
export function dueDelay(state: RoomState, connected: ReadonlySet<string>, timings: Timings): number | null {
  const i = currentSeatIndex(state);
  const occupant = state.seats[i]?.occupant ?? null;
  if (occupant === null) return null;
  if (occupant.kind === 'cpu') return timings.cpuDelayMs;
  return connected.has(occupant.user.id)
    ? timings.turnMs
    : Math.max(timings.cpuDelayMs, timings.playingDisconnectMs);
}

/** The one alarm time: the earliest of every pending deadline, derived purely from persisted state. */
export function nextWake(state: RoomState, timings: Timings): number | null {
  const times: number[] = [];
  if (state.status === 'playing' && state.dueAt !== null) times.push(state.dueAt);
  if (state.status === 'waiting') {
    for (const since of Object.values(state.disconnectedSince)) times.push(since + timings.waitingDisconnectMs);
  }
  if (state.noHumanConnectedSince !== null) times.push(state.noHumanConnectedSince + timings.idleCloseMs);
  return times.length === 0 ? null : Math.min(...times);
}

function publicOccupant(
  occupant: StoredOccupant | null,
  connected: ReadonlySet<string>,
): SeatOccupant | null {
  if (occupant === null) return null;
  if (occupant.kind === 'cpu') return occupant;
  return { kind: 'human', user: occupant.user, connected: connected.has(occupant.user.id) };
}

export function toSnapshot(state: RoomState, connected: ReadonlySet<string>): RoomSnapshot {
  const seats: Seat[] = state.seats.map((s) => ({ color: s.color, occupant: publicOccupant(s.occupant, connected) }));
  const turnSeat = state.seats[currentSeatIndex(state)]?.occupant ?? null;
  const turnDeadline =
    state.status === 'playing' && state.dueAt !== null && turnSeat?.kind === 'human' && connected.has(turnSeat.user.id)
      ? state.dueAt
      : null;
  return {
    code: state.code,
    name: state.name,
    visibility: state.visibility,
    hostId: state.hostId,
    status: state.status,
    seats,
    game: state.game,
    turnDeadline,
    seq: state.seq,
  };
}

export function toSummary(state: RoomState): RoomSummary {
  const host = humanUsers(state).find((u) => u.id === state.hostId);
  return {
    code: state.code,
    name: state.name,
    hostName: host?.displayName ?? '',
    status: state.status,
    seatsTaken: occupiedCount(state),
    seatsTotal: state.seats.length,
  };
}

/** Uniform die value from a byte source: bytes 252..255 are rejected so 1..6 stay equally likely. */
export function drawDie(fill: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): DiceValue {
  const buf = new Uint8Array(1);
  for (;;) {
    fill(buf);
    const b = buf[0] ?? 255;
    if (b < 252) return ((b % 6) + 1) as DiceValue;
  }
}
