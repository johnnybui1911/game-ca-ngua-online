import { HORSES_PER_COLOR, POS_GATE, type Color, type DiceValue, type HouseRules } from '../../shared/game/types';
import {
  DEFAULT_ROOM_SETTINGS,
  GAME_OVER_CODE,
  MAX_HORSE_NAME,
  MAX_HORSE_NAME_WORDS,
  countWords,
  GAME_MINUTES_OPTIONS,
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
  /** During a game, the user whose `leave` turned this seat into a CPU; they get it back first if they return. */
  leftBy?: string;
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
  /** Whole-game deadline; absent in games started before this setting existed. */
  gameDeadline?: number | null;
  /** Test-only override, used only while ROOM_FAST_TIMERS is enabled. */
  testGameDurationMs?: number;
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
   * Fields absent in older settings retain their legacy behavior, including unlimited game time.
   */
  settings?: SentRoomSettings;
  /** The dice experiment's memory of the current game (see `dice-shaping.ts`); absent before its first roll. */
  diceMemory?: DiceMemory;
  /** "Cho người vào thay máy giữa ván", set at creation; absent (rooms created before it existed, or off) means off. */
  allowTakeover?: boolean;
  /** Pending requests to take over a CPU seat while the game runs, oldest first, at most one per colour; absent when none. */
  joinRequests?: StoredJoinRequest[];
}

/** A request as stored: the requester, the colour asked for and when it lapses (epoch ms). */
export interface StoredJoinRequest {
  user: PublicUser;
  color: Color;
  expiresAt: number;
}

/** Seats a new occupant (or empties the seat); horse names belong to the previous occupant and are dropped. */
export function setOccupant(seat: StoredSeat, occupant: StoredOccupant | null): void {
  seat.occupant = occupant;
  delete seat.horseNames;
  delete seat.misses;
  delete seat.leftBy;
}

/**
 * The room's settings; an absent duration is unlimited, while absent older fields use their defaults.
 * While the dice experiment is on, the house rules are the defaults (off) whatever is stored.
 */
export function settingsOf(state: RoomState): RoomSettings {
  const stored = state.settings;
  if (!stored) return { ...DEFAULT_ROOM_SETTINGS, gameMinutes: 0 };
  const rules = DICE_SHAPING ? DEFAULT_ROOM_SETTINGS.rules : (stored.rules ?? DEFAULT_ROOM_SETTINGS.rules);
  return { ...stored, gameMinutes: stored.gameMinutes ?? 0, pace: isPaceName(stored.pace) ? stored.pace : DEFAULT_PACE, rules };
}

/** House rules from a client message, or null unless exactly `{tripleBonusForfeit}` with a boolean. */
function parseHouseRules(raw: unknown): HouseRules | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).length !== 1 || typeof o.tripleBonusForfeit !== 'boolean') return null;
  return { tripleBonusForfeit: o.tripleBonusForfeit };
}

const SETTINGS_KEYS: readonly string[] = ['turnSeconds', 'quick', 'autoRoll', 'pace', 'rules', 'gameMinutes'];

/**
 * Settings from a client message with allowed values. Newer fields may be missing from older tabs;
 * the room then keeps its own values.
 */
export function parseRoomSettings(raw: unknown): SentRoomSettings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((key) => !SETTINGS_KEYS.includes(key))) return null;
  const { turnSeconds, quick, autoRoll, pace } = o;
  const turn = TURN_SECONDS_OPTIONS.find((n) => n === turnSeconds);
  if (turn === undefined || typeof quick !== 'boolean' || typeof autoRoll !== 'boolean') return null;
  const out: SentRoomSettings = { turnSeconds: turn, quick, autoRoll };
  if ('gameMinutes' in o) {
    const minutes = GAME_MINUTES_OPTIONS.find((n) => n === o.gameMinutes);
    if (minutes === undefined) return null;
    out.gameMinutes = minutes;
  }
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

/** Forgets every seat's missed turns and who left it (a new game starts clean). */
export function clearMisses(state: RoomState): void {
  for (const seat of state.seats) {
    delete seat.misses;
    delete seat.leftBy;
  }
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
    if ([...name].length > MAX_HORSE_NAME || countWords(name) > MAX_HORSE_NAME_WORDS) return null;
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

/** The error for a roll or move while no match is running: a finished match is distinct from one not yet started. */
export function notPlayingError(state: RoomState | null | undefined): { code: string; message: string } {
  if (state?.status === 'finished') return { code: GAME_OVER_CODE, message: 'Ván đấu đã kết thúc.' };
  return { code: 'bad_state', message: 'Ván đấu chưa bắt đầu.' };
}

export function isPaused(state: RoomState): boolean {
  return state.status === 'playing' && state.pausedAt != null;
}

export function startGameClock(state: RoomState, now: number, testDurationMs?: number): void {
  const minutes = settingsOf(state).gameMinutes;
  state.gameDeadline = minutes === 0 ? null : now + (testDurationMs ?? minutes * 60_000);
}

/** Finish a running game if its whole-game clock is due; no action may beat an already expired clock. */
export function finishExpiredGame(
  state: RoomState,
  now: number,
  draw: (colors: readonly Color[]) => Color = drawFrom,
): GameEvent[] | null {
  const game = state.game;
  if (state.status !== 'playing' || !game || game.phase === 'finished' || isPaused(state) ||
      state.noHumanConnectedSince !== null || state.gameDeadline == null || now < state.gameDeadline) return null;

  let candidates = game.colors.slice();
  let reason: NonNullable<GameState['timeWinReason']> = 'random';
  const criteria: Array<[NonNullable<GameState['timeWinReason']>, (color: Color) => number]> = [
    ['home-count', (color) => (game.horses[color] ?? []).filter((pos) => pos > POS_GATE).length],
    ['home-steps', (color) => (game.horses[color] ?? []).reduce((sum, pos) => sum + Math.max(0, pos - POS_GATE), 0)],
    ['kicks', (color) => game.kicks?.[color] ?? 0],
  ];
  for (const [criterion, score] of criteria) {
    const best = Math.max(...candidates.map(score));
    candidates = candidates.filter((color) => score(color) === best);
    if (candidates.length === 1) {
      reason = criterion;
      break;
    }
  }
  const winner = candidates.length === 1 ? candidates[0]! : draw(candidates);
  state.game = { ...game, phase: 'finished', dice: null, legalHorses: [], winner, timeWinReason: reason };
  state.status = 'finished';
  state.dueAt = null;
  state.actionDueAt = null;
  state.gameDeadline = null;
  return [{ type: 'won', color: winner }];
}

export function seatIndexOfUser(state: RoomState, userId: string): number {
  return state.seats.findIndex((s) => s.occupant?.kind === 'human' && s.occupant.user.id === userId);
}

/**
 * Moves a seated person to the empty seat of `color` while the room waits: the occupant, their horse names and
 * missed turns go with them, the old seat is emptied. Seat colours never change, so the host (an id) and the
 * turn order (ascending colour) are untouched. Returns an error code and leaves `state` as it was, or null.
 * Choosing the colour already held is a no-op (null).
 */
export function changeColor(state: RoomState, userId: string, color: unknown): string | null {
  const from = seatIndexOfUser(state, userId);
  if (from < 0) return 'not_seated';
  if (state.status !== 'waiting') return 'bad_state';
  const to = state.seats.findIndex((s) => s.color === color);
  if (to < 0) return 'bad_color';
  if (to === from) return null;
  const source = state.seats[from]!;
  const target = state.seats[to]!;
  if (target.occupant !== null) return 'color_taken';
  target.occupant = source.occupant;
  if (source.horseNames) target.horseNames = source.horseNames;
  if (source.misses) target.misses = source.misses;
  setOccupant(source, null);
  return null;
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
    state.gameDeadline = null;
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
    if (state.gameDeadline != null) state.gameDeadline += paused;
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

/** True while people with no seat may ask for a CPU seat: a running game in a room created with the option on. */
export function takeoverOpen(state: RoomState): boolean {
  return state.status === 'playing' && state.game !== null && state.allowTakeover === true;
}

/** Index of the seat whose colour is `color` when a CPU plays it in the running game; -1 otherwise. */
export function cpuSeatOf(state: RoomState, color: Color): number {
  const i = state.seats.findIndex((s) => s.color === color);
  const seat = state.seats[i];
  return seat?.occupant?.kind === 'cpu' && state.game?.colors.includes(color) ? i : -1;
}

/** Colours of the CPU seats of the running game, in seat order. */
export function cpuColors(state: RoomState): Color[] {
  return state.seats.filter((s) => cpuSeatOf(state, s.color) >= 0).map((s) => s.color);
}

/** The seat a person who left this game gets back without asking, while a CPU still plays it; -1 otherwise. */
export function formerSeatIndex(state: RoomState, userId: string): number {
  if (!takeoverOpen(state)) return -1;
  return state.seats.findIndex((s) => s.leftBy === userId && cpuSeatOf(state, s.color) >= 0);
}

/**
 * Seats `user` in place of the CPU on seat `i` of the running game: the colour, its horses and the game carry on
 * unchanged. A seat on turn gets a person's full turn from now; `connected` may exclude `user`, whose socket counts as
 * open. A pending CPU alarm then finds nothing due, as `dueAt` has moved past it. While the clocks stand still (host
 * pause, or nobody connected) the turn is planned from the moment they stopped, so resuming or reconnecting moves it
 * on to a full turn. False, and nothing changes, unless a CPU plays that seat.
 */
export function takeOverCpuSeat(
  state: RoomState,
  i: number,
  user: PublicUser,
  connected: ReadonlySet<string>,
  now: number,
  timings: RoomTimings,
): boolean {
  const seat = state.seats[i];
  if (!seat || cpuSeatOf(state, seat.color) !== i) return false;
  setOccupant(seat, { kind: 'human', user });
  // Someone else's request for this colour is dropped (with a notice) by `pruneJoinRequests` on the commit.
  dropRequest(state, user.id);
  if (currentSeatIndex(state) === i) {
    const from = isPaused(state) ? (state.pausedAt ?? now) : (state.noHumanConnectedSince ?? now);
    planTurn(state, new Set([...connected, user.id]), from, timings);
  }
  return true;
}

/**
 * Records `user`'s request for the CPU seat of `color`, replacing their earlier one. Null when recorded, else the
 * reason: the room does not allow it now, the colour has no CPU, or someone else already asked for it.
 */
export function requestSeat(
  state: RoomState,
  user: PublicUser,
  color: Color,
  now: number,
  waitMs: number,
): 'closed' | 'no_cpu' | 'requested' | null {
  if (!takeoverOpen(state) || seatIndexOfUser(state, user.id) >= 0) return 'closed';
  if (cpuSeatOf(state, color) < 0) return 'no_cpu';
  const others = (state.joinRequests ?? []).filter((r) => r.user.id !== user.id);
  if (others.some((r) => r.color === color)) return 'requested';
  state.joinRequests = [...others, { user, color, expiresAt: now + waitMs }];
  return null;
}

/** Removes `userId`'s request; true when there was one. */
export function dropRequest(state: RoomState, userId: string): boolean {
  const before = state.joinRequests ?? [];
  const after = before.filter((r) => r.user.id !== userId);
  if (after.length === before.length) return false;
  if (after.length === 0) delete state.joinRequests;
  else state.joinRequests = after;
  return true;
}

export type DropReason = 'expired' | 'seat_taken' | 'ended' | 'gone';

/**
 * Drops requests that can no longer be granted: the game is over (or the room no longer allows it), the CPU seat was
 * taken, the host did not answer in time, or the requester has no open socket. Returns who was dropped and why.
 */
export function pruneJoinRequests(
  state: RoomState,
  connected: ReadonlySet<string>,
  now: number,
): { userId: string; reason: DropReason }[] {
  const requests = state.joinRequests;
  if (!requests || requests.length === 0) return [];
  const dropped: { userId: string; reason: DropReason }[] = [];
  const open = takeoverOpen(state);
  const kept = requests.filter((r) => {
    const reason: DropReason | null = !open
      ? 'ended'
      : cpuSeatOf(state, r.color) < 0
        ? 'seat_taken'
        : !connected.has(r.user.id)
          ? 'gone'
          : now >= r.expiresAt
            ? 'expired'
            : null;
    if (reason) dropped.push({ userId: r.user.id, reason });
    return reason === null;
  });
  if (kept.length === 0) delete state.joinRequests;
  else state.joinRequests = kept;
  return dropped;
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
  if (state.gameDeadline != null) state.gameDeadline += paused;
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
  if (state.status === 'playing' && state.gameDeadline != null && attended && !paused) times.push(state.gameDeadline);
  if (state.status === 'waiting') {
    for (const since of Object.values(state.disconnectedSince)) times.push(since + timings.waitingDisconnectMs);
  }
  if ((state.status === 'finished' || paused) && attended) {
    const since = state.disconnectedSince[state.hostId];
    if (since !== undefined) times.push(since + timings.waitingDisconnectMs);
  }
  if (state.noHumanConnectedSince !== null) times.push(state.noHumanConnectedSince + timings.idleCloseMs);
  for (const r of state.joinRequests ?? []) times.push(r.expiresAt);
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
    gameDeadline: state.status === 'playing' ? (state.gameDeadline ?? null) : null,
    gamePausedRemaining: paused && state.gameDeadline != null && state.pausedAt != null
      ? Math.max(0, state.gameDeadline - state.pausedAt)
      : null,
    paused,
    cpuLevel: levelOf(state),
    settings: settingsOf(state),
    allowTakeover: state.allowTakeover === true,
    joinRequests: (state.joinRequests ?? []).map((r) => ({ user: r.user, color: r.color, expiresAt: r.expiresAt })),
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
    takeoverSeats: takeoverOpen(state) ? cpuColors(state).filter((c) => !state.joinRequests?.some((r) => r.color === c)).length : 0,
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
