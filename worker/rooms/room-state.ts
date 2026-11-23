import { HORSES_PER_COLOR, type Color, type DiceValue, type HouseRules } from '../../shared/game/types';
import {
  DEFAULT_ROOM_SETTINGS,
  MAX_HORSE_NAME,
  TURN_SECONDS_OPTIONS,
  type RoomSettings,
  type PublicUser,
  type RoomSnapshot,
  type RoomStatus,
  type RoomSummary,
  type RoomVisibility,
  type Seat,
  type SeatOccupant,
  type SentRoomSettings,
} from '../../shared/protocol';
import type { GameEvent, GameState, StepResult } from '../../shared/game/types';
import { applyMove, rollAndSettle, segmentsOf } from '../../shared/game/engine';
import { DICE_SHAPING } from '../../shared/experiments';
import { DEFAULT_PACE, animationSeconds, isPaceName, paceTimings, pauseSeconds } from '../../shared/game/pace';
import { chooseCpuMove } from '../../shared/game/cpu';
import { DEFAULT_CPU_LEVEL, isCpuLevel, type CpuLevel } from '../../shared/game/cpu-level';
import { IDLE_AUTOPLAY_AFTER, type RoomTimings, type Timings } from './constants';
import { drawFrom, facesFor, rememberRoll, type DiceMemory } from './dice-shaping';
import { sanitizeText } from '../auth/validate';

/** Occupant as persisted: connection state is derived from open sockets, never stored. */
export type StoredOccupant = { kind: 'human'; user: PublicUser } | { kind: 'cpu'; name: string };
export interface StoredSeat {
  color: Color;
  occupant: StoredOccupant | null;
  /** Set by the occupant; absent means every horse has its default name. */
  horseNames?: string[];
  /** Turns in a row this seat's connected human let run out; absent means 0. Reaching `IDLE_AUTOPLAY_AFTER` puts the seat on autopilot. */
  misses?: number;
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
  /**
   * When the human on turn runs out of time for the current action; fixed when that action
   * begins and never moved later, so reconnecting cannot buy more time. Null while a CPU is on turn.
   */
  actionDueAt: number | null;
  /** userId -> when their last socket closed (or the seat was created without one). */
  disconnectedSince: Record<string, number>;
  /** Since when no seated human has an open socket; null while at least one has. */
  noHumanConnectedSince: number | null;
  /** When the host paused the running game; null or absent while it runs. */
  pausedAt?: number | null;
  /** Absent in rooms stored before the setting existed: Thường. */
  cpuLevel?: CpuLevel;
  /**
   * Absent in rooms stored before the settings existed, and in rooms whose host never changed them: the defaults.
   * `pace` and `rules` are absent in settings stored before they existed: Vừa, and no house rule.
   */
  settings?: SentRoomSettings;
  /** The dice experiment's memory of the current game (see `dice-shaping.ts`); absent before its first roll. */
  diceMemory?: DiceMemory;
}

/** Seats a new occupant (or empties the seat); horse names belong to the previous occupant and are dropped. */
export function setOccupant(seat: StoredSeat, occupant: StoredOccupant | null): void {
  seat.occupant = occupant;
  delete seat.horseNames;
  delete seat.misses;
}

/**
 * The room's settings; an absent stored value reads as the defaults, as does an absent pace or set of rules.
 * While the dice experiment is on, the house rules are the defaults (off) whatever is stored.
 */
export function settingsOf(state: RoomState): RoomSettings {
  const stored = state.settings;
  if (!stored) return DEFAULT_ROOM_SETTINGS;
  const rules = DICE_SHAPING ? DEFAULT_ROOM_SETTINGS.rules : (stored.rules ?? DEFAULT_ROOM_SETTINGS.rules);
  return { ...stored, pace: isPaceName(stored.pace) ? stored.pace : DEFAULT_PACE, rules };
}

/** House rules from a client message, or null unless exactly `{tripleBonusForfeit}` with a boolean. */
function parseHouseRules(raw: unknown): HouseRules | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).length !== 1 || typeof o.tripleBonusForfeit !== 'boolean') return null;
  return { tripleBonusForfeit: o.tripleBonusForfeit };
}

const SETTINGS_KEYS: readonly string[] = ['turnSeconds', 'quick', 'autoRoll', 'pace', 'rules'];

/**
 * Settings from a client message, or null unless it is exactly `{turnSeconds, quick, autoRoll, pace, rules}` with
 * allowed values. `pace` and `rules` may be missing (a tab loaded before the setting existed): the room then keeps its own.
 */
export function parseRoomSettings(raw: unknown): SentRoomSettings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((key) => !SETTINGS_KEYS.includes(key))) return null;
  const { turnSeconds, quick, autoRoll, pace } = o;
  const turn = TURN_SECONDS_OPTIONS.find((n) => n === turnSeconds);
  if (turn === undefined || typeof quick !== 'boolean' || typeof autoRoll !== 'boolean') return null;
  const out: SentRoomSettings = { turnSeconds: turn, quick, autoRoll };
  if ('pace' in o) {
    if (!isPaceName(pace)) return null;
    out.pace = pace;
  }
  if ('rules' in o) {
    const rules = parseHouseRules(o.rules);
    if (!rules) return null;
    out.rules = rules;
  }
  return out;
}

/** The base timings with this room's turn time: `turnSeconds` of `turnUnitMs` each. */
export function timingsOf(state: RoomState, base: Timings): RoomTimings {
  return { ...base, turnMs: settingsOf(state).turnSeconds * base.turnUnitMs };
}

/**
 * Pause before the server plays for a CPU, autopilot or takeover, after a commit that carried `events`:
 * as long as the clients animate them at the room's pace, plus a beat. Fast mode pauses a fixed time per animated segment.
 */
export function paceMs(state: RoomState, timings: Timings, events: readonly GameEvent[] = []): number {
  const { quick, pace } = settingsOf(state);
  if (timings.paced) return Math.round(pauseSeconds(events, paceTimings(pace, quick)) * 1_000);
  return (quick ? timings.quickSegmentMs : timings.cpuDelayMs) * Math.max(1, segmentsOf(events));
}

/** How long the clients animate `events` at the room's pace, in ms: a person's clock starts after it. 0 in fast mode. */
export function animationMs(state: RoomState, timings: Timings, events: readonly GameEvent[] = []): number {
  if (!timings.paced) return 0;
  const { quick, pace } = settingsOf(state);
  return Math.round(animationSeconds(events, paceTimings(pace, quick)) * 1_000);
}

/** A seated human who has let `IDLE_AUTOPLAY_AFTER` turns in a row run out; the server plays for them. */
export function isAutopilot(seat: StoredSeat | undefined): boolean {
  return seat?.occupant?.kind === 'human' && (seat.misses ?? 0) >= IDLE_AUTOPLAY_AFTER;
}

/** Forgets every seat's missed turns (a new game starts clean). */
export function clearMisses(state: RoomState): void {
  for (const seat of state.seats) delete seat.misses;
}

/**
 * Four cleaned horse names from a client message, or null when the shape is wrong or a name is too
 * long. Names are cleaned like display names; '' keeps the default name.
 */
export function cleanHorseNames(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length !== HORSES_PER_COLOR) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return null;
    const name = sanitizeText(item);
    if ([...name].length > MAX_HORSE_NAME) return null;
    out.push(name);
  }
  return out;
}

/** The room's CPU level; an absent or unrecognised stored value reads as the default. */
export function levelOf(state: RoomState): CpuLevel {
  return isCpuLevel(state.cpuLevel) ? state.cpuLevel : DEFAULT_CPU_LEVEL;
}

/** Level the server plays a seat at: a CPU seat uses the room level; a seated human auto-played to avoid a stall uses the default. */
export function levelForOccupant(state: RoomState, occupant: StoredOccupant | null): CpuLevel {
  return occupant?.kind === 'cpu' ? levelOf(state) : DEFAULT_CPU_LEVEL;
}

/** A level from a client message, or null when it is not one of the known levels. */
export function parseCpuLevel(raw: unknown): CpuLevel | null {
  return isCpuLevel(raw) ? raw : null;
}

export function isPaused(state: RoomState): boolean {
  return state.status === 'playing' && state.pausedAt != null;
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

/**
 * When the server should next play for the colour on turn, given who is connected, counted from the commit
 * that carried `events`. A connected person's time starts once the board has shown those events.
 */
export function dueDelay(
  state: RoomState,
  connected: ReadonlySet<string>,
  timings: RoomTimings,
  events: readonly GameEvent[] = [],
): number | null {
  const seat = state.seats[currentSeatIndex(state)];
  const occupant = seat?.occupant ?? null;
  if (occupant === null) return null;
  const pace = paceMs(state, timings, events);
  if (occupant.kind === 'cpu') return pace;
  if (!connected.has(occupant.user.id)) return Math.max(pace, timings.playingDisconnectMs);
  if (isAutopilot(seat)) return pace;
  const own = settingsOf(state).autoRoll && state.game?.phase === 'roll' ? Math.min(timings.turnMs, timings.autoRollMs) : timings.turnMs;
  return animationMs(state, timings, events) + own;
}

/**
 * Starts the clock for the action now beginning: sets `dueAt` and the fixed `actionDueAt`.
 * `events` are those of the commit that led here; the clients animate them first, so a person's
 * `turnMs` runs from the end of that animation.
 */
export function planTurn(
  state: RoomState,
  connected: ReadonlySet<string>,
  now: number,
  timings: RoomTimings,
  events: readonly GameEvent[] = [],
): void {
  const delay = dueDelay(state, connected, timings, events);
  const seat = state.seats[currentSeatIndex(state)];
  state.dueAt = delay === null ? null : now + delay;
  state.actionDueAt = seat?.occupant?.kind === 'human' && !isAutopilot(seat) ? now + animationMs(state, timings, events) + timings.turnMs : null;
}

/**
 * When the server plays for a connected human who is on turn, re-derived from the fixed action deadline:
 * the deadline itself, or the auto-roll moment of an action that began `turnMs` before it.
 */
function humanDue(state: RoomState, timings: RoomTimings): number | null {
  const end = state.actionDueAt;
  if (end == null) return state.dueAt;
  if (settingsOf(state).autoRoll && state.game?.phase === 'roll') return Math.min(end, end - timings.turnMs + timings.autoRollMs);
  return end;
}

/** True when the server plays for the colour on turn: a CPU seat, a human on autopilot, or a human with no open socket. */
export function isAutomatedActor(state: RoomState, connected: ReadonlySet<string>): boolean {
  const seat = state.seats[currentSeatIndex(state)];
  const occupant = seat?.occupant ?? null;
  return occupant !== null && (occupant.kind === 'cpu' || !isConnected(connected, occupant) || isAutopilot(seat));
}

/**
 * Plays the action that is due and re-plans the clock. An automated actor in the roll phase
 * rolls and moves in one step (one commit, one alarm); the clients animate both from one batch,
 * and the next automated action waits for that whole animation (`paceMs`). A connected human whose clock ran out is only rolled for and keeps their own turn
 * clock for the move; in a quick match a roll with a single legal horse plays that move too.
 * A connected human whose own deadline had passed misses the turn; an auto-roll, an autopilot
 * action, a takeover for a disconnected human and a CPU action never count as one.
 * Returns null when no action applies.
 */
export function playDueAction(
  state: RoomState,
  connected: ReadonlySet<string>,
  now: number,
  timings: RoomTimings,
  draw: (faces: readonly DiceValue[]) => DiceValue = drawFrom,
): { events: GameEvent[]; finished: boolean } | null {
  const game = state.game;
  if (!game) return null;
  const seat = state.seats[currentSeatIndex(state)];
  const occupant = seat?.occupant ?? null;
  // The colour on turn does not change between the roll and its move.
  const level = levelForOccupant(state, occupant);
  const quick = settingsOf(state).quick;
  const missed =
    occupant?.kind === 'human' && isConnected(connected, occupant) && !isAutopilot(seat) && state.actionDueAt != null && now >= state.actionDueAt;
  let result;
  if (game.phase === 'roll') {
    const automated = isAutomatedActor(state, connected);
    result = rollFor(state, game, quick, draw);
    if (automated && result.state.phase === 'move' && result.state.turn === game.turn) {
      const moved = applyMove(result.state, chooseCpuMove(result.state, level));
      result = { state: moved.state, events: [...result.events, ...moved.events] };
    }
  } else if (game.phase === 'move') {
    result = applyMove(game, chooseCpuMove(game, level));
  } else {
    return null;
  }
  if (missed && seat) seat.misses = (seat.misses ?? 0) + 1;
  state.game = result.state;
  if (result.state.phase === 'finished') {
    state.status = 'finished';
    state.dueAt = null;
    state.actionDueAt = null;
    return { events: result.events, finished: true };
  }
  planTurn(state, connected, now, timings, result.events);
  return { events: result.events, finished: false };
}

/**
 * Brings disconnect timers, the turn clock and the host in line with who has an open
 * socket right now. Mutates `state`; calling it again with the same inputs changes nothing.
 */
export function reconcileConnections(
  state: RoomState,
  connected: ReadonlySet<string>,
  now: number,
  timings: RoomTimings,
): void {
  const was = new Set(Object.keys(state.disconnectedSince));
  for (const user of humanUsers(state)) {
    if (connected.has(user.id)) delete state.disconnectedSince[user.id];
    else state.disconnectedSince[user.id] ??= now;
  }
  for (const id of Object.keys(state.disconnectedSince)) {
    if (seatIndexOfUser(state, id) < 0) delete state.disconnectedSince[id];
  }
  const anyConnected = humanUsers(state).some((u) => connected.has(u.id));
  const pausedSince = state.noHumanConnectedSince;
  const hostPaused = isPaused(state);
  if (anyConnected && pausedSince !== null && state.status === 'playing' && !hostPaused) {
    // The game stood still while nobody was connected, so its clocks did too:
    // whoever returns finds the time their action had left when the pause began.
    const paused = now - pausedSince;
    if (state.dueAt !== null) state.dueAt += paused;
    if (state.actionDueAt != null) state.actionDueAt += paused;
  }
  state.noHumanConnectedSince = anyConnected ? null : (pausedSince ?? now);

  // While the host has paused the game its clocks stand at `pausedAt`; `resumeGame` settles them.
  const turnSeat = state.seats[currentSeatIndex(state)]?.occupant;
  if (state.status === 'playing' && turnSeat?.kind === 'human' && !hostPaused) {
    const id = turnSeat.user.id;
    if (connected.has(id) && was.has(id)) {
      // Back before the clock ran out: the action keeps the deadline it started with.
      state.dueAt = humanDue(state, timings);
    } else if (!connected.has(id) && !was.has(id)) {
      const grace = now + Math.max(timings.cpuDelayMs, timings.playingDisconnectMs);
      state.dueAt = Math.min(state.dueAt ?? Infinity, grace);
    }
  }

  const host = humanUsers(state).find((u) => u.id === state.hostId);
  if (!host) {
    const next = pickHost(state);
    if (next !== null) state.hostId = next;
  } else if ((state.status !== 'playing' || hostPaused) && !connected.has(host.id)) {
    // Outside a running game (or in one only the host can resume) nobody else can move it on;
    // a host gone past the grace hands the role over.
    const since = state.disconnectedSince[host.id];
    const successor = humanUsers(state).find((u) => connected.has(u.id));
    if (since !== undefined && successor && now >= since + timings.waitingDisconnectMs) state.hostId = successor.id;
  }
}

/**
 * Continues a paused game. Its clocks stood still since `pausedAt`, so they move on by the pause
 * length: the player on turn finds the time their action had left. A human on turn who is not
 * connected gets the short takeover delay, as on any disconnect.
 */
export function resumeGame(state: RoomState, connected: ReadonlySet<string>, now: number, timings: RoomTimings): void {
  const since = state.pausedAt;
  if (since == null) return;
  state.pausedAt = null;
  const paused = Math.max(0, now - since);
  if (state.dueAt !== null) state.dueAt += paused;
  if (state.actionDueAt != null) state.actionDueAt += paused;
  const turnSeat = state.seats[currentSeatIndex(state)]?.occupant;
  if (turnSeat?.kind !== 'human') return;
  if (connected.has(turnSeat.user.id)) {
    state.dueAt = humanDue(state, timings);
  } else {
    const grace = now + Math.max(timings.cpuDelayMs, timings.playingDisconnectMs);
    state.dueAt = Math.min(state.dueAt ?? Infinity, grace);
  }
}

/**
 * The one alarm time: the earliest of every pending deadline, derived purely from persisted state.
 * While no human is connected, or the host has paused it, a game is frozen: automatic play is not pending.
 */
export function nextWake(state: RoomState, timings: Timings): number | null {
  const times: number[] = [];
  const attended = state.noHumanConnectedSince === null;
  const paused = isPaused(state);
  if (state.status === 'playing' && state.dueAt !== null && attended && !paused) times.push(state.dueAt);
  if (state.status === 'waiting') {
    for (const since of Object.values(state.disconnectedSince)) times.push(since + timings.waitingDisconnectMs);
  }
  if ((state.status === 'finished' || paused) && attended) {
    const since = state.disconnectedSince[state.hostId];
    if (since !== undefined) times.push(since + timings.waitingDisconnectMs);
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
  const seats: Seat[] = state.seats.map((s) => ({
    color: s.color,
    occupant: publicOccupant(s.occupant, connected),
    horseNames: s.horseNames ?? Array.from({ length: HORSES_PER_COLOR }, () => ''),
    auto: isAutopilot(s),
  }));
  const paused = isPaused(state);
  const turnSeat = state.seats[currentSeatIndex(state)]?.occupant ?? null;
  const turnDeadline =
    state.status === 'playing' && !paused && state.actionDueAt != null && turnSeat?.kind === 'human' && connected.has(turnSeat.user.id)
      ? state.actionDueAt
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
    paused,
    cpuLevel: levelOf(state),
    settings: settingsOf(state),
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

/**
 * Rolls for the colour on turn of `game` (the room's game) with the faces the dice experiment allows, settles a
 * forced move in a quick match, and keeps the experiment's memory in step.
 */
export function rollFor(
  state: RoomState,
  game: GameState,
  quick: boolean,
  draw: (faces: readonly DiceValue[]) => DiceValue = drawFrom,
): StepResult {
  const dice = draw(facesFor(state, game));
  const result = rollAndSettle(game, dice, quick);
  rememberRoll(state, game, dice, result.state);
  return result;
}

export type AlarmAction = 'set' | 'delete' | 'none';

/**
 * Remembers the alarm time this instance armed, so storage is touched only when it changes.
 * Unknown after construction (a fresh instance may find any alarm armed), none after the alarm fires.
 */
export class AlarmTracker {
  private known: number | null | undefined = undefined;

  /** The runtime consumes an alarm when it fires. */
  fired(): void {
    this.known = null;
  }

  /** The storage call that arms `wake`; record it with `armed` once that call succeeded. */
  plan(wake: number | null): AlarmAction {
    if (this.known === wake) return 'none';
    return wake === null ? 'delete' : 'set';
  }

  armed(wake: number | null): void {
    this.known = wake;
  }
}
