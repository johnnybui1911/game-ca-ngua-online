import { DurableObject } from 'cloudflare:workers';
import { NO_SOURCE, type ServerEvent } from '../../shared/analytics';
import { applyMove, applyRoll, createGame } from '../../shared/game/engine';
import { chooseCpuMove } from '../../shared/game/cpu';
import type { GameEvent, StepResult } from '../../shared/game/types';
import { isEmoteId } from '../../shared/emotes';
import {
  MAX_HORSE_NAME,
  CLOSE_SIGNED_OUT,
  SEAT_COLORS,
  SIGNED_OUT_CODE,
  SIGNED_OUT_MESSAGE,
  type PublicUser,
  type RoomClientMessage,
  type RoomServerMessage,
  type RoomSummary,
  type RoomVisibility,
} from '../../shared/protocol';
import { countEvent } from '../analytics/count';
import type { Env } from '../env';
import { SessionGuard, type SocketBinding } from './session-guard';
import { KeyedQueue } from './socket-queue';
import { KeyedTokenBuckets, TokenBucket } from './token-bucket';
import {
  EMOTE_BURST,
  EMOTE_REFILL_PER_SEC,
  HOST_ACTION_BURST,
  HOST_ACTION_REFILL_PER_SEC,
  MAX_MESSAGE_BYTES,
  MAX_SOCKETS_PER_USER,
  SESSION_HEADER,
  SESSION_RECHECK_MS,
  SOCKET_BURST,
  SOCKET_REFILL_PER_SEC,
  USER_HEADER,
  timingsFor,
  type Timings,
} from './constants';
import {
  cleanHorseNames,
  currentSeatIndex,
  levelForOccupant,
  levelOf,
  parseCpuLevel,
  drawDie,
  firstEmptySeat,
  humanUsers,
  isPaused,
  nextCpuName,
  nextWake,
  occupiedCount,
  planTurn,
  reconcileConnections,
  resumeGame,
  seatIndexOfUser,
  setOccupant,
  toSnapshot,
  toSummary,
  type RoomState,
} from './room-state';

/** Close codes the client interprets; they never reconnect after receiving one of these. */
export const CLOSE_LEFT = 4001;
export const CLOSE_REFUSED = 4002;
export const CLOSE_TOO_MANY = 4003;
export const CLOSE_ROOM_CLOSED = 4004;
export const CLOSE_RATE_LIMITED = 4005;

export interface CreateRoomInit {
  code: string;
  name: string;
  visibility: RoomVisibility;
  seats: number;
  host: PublicUser;
}

interface SocketUser extends SocketBinding {
  displayName: string;
}

class RoomError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const STORAGE_KEY = 'room';
const OPEN_STATES = new Set<number>([WebSocket.READY_STATE_CONNECTING, WebSocket.READY_STATE_OPEN]);

function parseClientMessage(text: string): RoomClientMessage {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new RoomError('bad_message', 'Tin nhắn không hợp lệ.');
  }
  if (typeof raw !== 'object' || raw === null) throw new RoomError('bad_message', 'Tin nhắn không hợp lệ.');
  const msg = raw as Record<string, unknown>;
  const int = (v: unknown): number => {
    if (typeof v !== 'number' || !Number.isInteger(v)) throw new RoomError('bad_message', 'Tin nhắn không hợp lệ.');
    return v;
  };
  switch (msg.t) {
    case 'addCpu':
    case 'removeCpu':
      return { t: msg.t, seat: int(msg.seat) };
    case 'move':
      return { t: 'move', horse: int(msg.horse) };
    case 'horseNames': {
      const names = cleanHorseNames(msg.names);
      if (!names) throw new RoomError('bad_name', `Tên quân tối đa ${MAX_HORSE_NAME} ký tự.`);
      return { t: 'horseNames', names };
    }
    case 'cpuLevel': {
      const level = parseCpuLevel(msg.level);
      if (!level) throw new RoomError('bad_message', 'Độ khó không hợp lệ.');
      return { t: 'cpuLevel', level };
    }
    case 'emote':
      if (!isEmoteId(msg.id)) throw new RoomError('bad_emote', 'Biểu cảm không hợp lệ.');
      return { t: 'emote', id: msg.id };
    case 'start':
    case 'roll':
    case 'rematch':
    case 'leave':
    case 'pause':
    case 'resume':
    case 'closeRoom':
      return { t: msg.t };
    default:
      throw new RoomError('bad_message', 'Loại tin nhắn không được hỗ trợ.');
  }
}

export class RoomDO extends DurableObject<Env> {
  private room: RoomState | null = null;
  private lastPushed = '';
  /** In memory only: a socket woken from hibernation starts with a full bucket. */
  private readonly buckets = new WeakMap<WebSocket, TokenBucket>();
  /** Budget for host messages that write state, per user: reconnecting does not refill it. */
  private readonly hostBudget = new KeyedTokenBuckets(HOST_ACTION_BURST, HOST_ACTION_REFILL_PER_SEC);
  /** Same budget for renaming horses, which any seated player can do. */
  private readonly nameBudget = new KeyedTokenBuckets(HOST_ACTION_BURST, HOST_ACTION_REFILL_PER_SEC);
  /** Emotes are broadcast only; in memory like `hostBudget`, per user across sockets and reconnects. */
  private readonly emoteBudget = new KeyedTokenBuckets(EMOTE_BURST, EMOTE_REFILL_PER_SEC);
  private readonly timings: Timings;
  private readonly sessions: SessionGuard;
  private readonly inbox = new KeyedQueue<WebSocket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.timings = timingsFor(env);
    this.sessions = new SessionGuard(env.DB, SESSION_RECHECK_MS);
    void ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>(STORAGE_KEY)) ?? null;
    });
  }

  // ------------------------------------------------------------------ RPC

  /** Creates the room with the host seated; false when this code is already taken. */
  async create(init: CreateRoomInit): Promise<boolean> {
    if (this.room) return false;
    const colors = SEAT_COLORS[init.seats];
    if (!colors) throw new Error('Invalid seat count');
    const now = Date.now();
    this.room = {
      code: init.code,
      name: init.name,
      visibility: init.visibility,
      hostId: init.host.id,
      status: 'waiting',
      seats: colors.map((color, i) => ({ color, occupant: i === 0 ? { kind: 'human', user: init.host } : null })),
      game: null,
      seq: 0,
      dueAt: null,
      actionDueAt: null,
      disconnectedSince: { [init.host.id]: now },
      noHumanConnectedSince: now,
    };
    await this.persistAndSchedule();
    this.pushLobby(true);
    return true;
  }

  async summary(): Promise<RoomSummary | null> {
    return this.room ? toSummary(this.room) : null;
  }

  /** The room name when `userId` holds a seat, for invite checks. */
  async seatedRoomName(userId: string): Promise<string | null> {
    if (!this.room || seatIndexOfUser(this.room, userId) < 0) return null;
    return this.room.name;
  }

  // ------------------------------------------------------------ upgrades

  override async fetch(request: Request): Promise<Response> {
    if (!this.room) return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const header = request.headers.get(USER_HEADER);
    if (!header) return new Response('Unauthorized', { status: 401 });
    const user = JSON.parse(decodeURIComponent(header)) as PublicUser;

    const before = JSON.stringify(this.room);
    const refusal = this.admit(this.room, user);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    if (refusal) {
      // A refused socket is never registered with the object, so its close cannot trigger a commit.
      server.accept();
      this.send(server, { t: 'error', code: refusal.code, message: refusal.message });
      server.close(CLOSE_REFUSED, refusal.code);
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    // `user` is the PublicUser stored in the room; the session hash stays on the socket only.
    const sessionHash = request.headers.get(SESSION_HEADER) ?? undefined;
    const attachment: SocketUser = { userId: user.id, displayName: user.displayName, at: Date.now(), sessionHash };
    server.serializeAttachment(attachment);
    this.trimSockets(user.id);
    if (!(await this.onConnectionChange(before))) this.sendState(server, [], this.connectedUsers());
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Closes a user's oldest sockets beyond the per-user cap. */
  private trimSockets(userId: string): void {
    const mine = this.openSockets()
      .map((ws) => ({ ws, user: ws.deserializeAttachment() as SocketUser | null }))
      .filter((e) => e.user?.userId === userId)
      .sort((x, y) => (x.user?.at ?? 0) - (y.user?.at ?? 0));
    for (const { ws } of mine.slice(0, Math.max(0, mine.length - MAX_SOCKETS_PER_USER))) {
      this.send(ws, { t: 'error', code: 'too_many_connections', message: 'Bạn mở phòng này ở quá nhiều tab.' });
      ws.close(CLOSE_TOO_MANY, 'too many connections');
    }
  }

  /** Seats a connecting user or says why not. Mutates only when it admits. */
  private admit(room: RoomState, user: PublicUser): RoomError | null {
    if (seatIndexOfUser(room, user.id) >= 0) return null;
    if (room.status !== 'waiting') return new RoomError('game_in_progress', 'Ván đấu đang diễn ra, bạn không thể vào phòng này.');
    const seat = firstEmptySeat(room);
    if (seat < 0) return new RoomError('room_full', 'Phòng đã đầy.');
    const target = room.seats[seat];
    if (target) setOccupant(target, { kind: 'human', user });
    return null;
  }

  // ------------------------------------------------------------ sockets

  /** One socket's messages are handled in arrival order, though handling awaits. */
  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    return this.inbox.run(ws, () => this.handleMessage(ws, message));
  }

  private async handleMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.room) return;
    let bucket = this.buckets.get(ws);
    if (!bucket) {
      bucket = new TokenBucket(SOCKET_BURST, SOCKET_REFILL_PER_SEC, Date.now());
      this.buckets.set(ws, bucket);
    }
    if (!bucket.take(Date.now())) {
      this.send(ws, { t: 'error', code: 'rate_limited', message: 'Bạn gửi quá nhanh, kết nối đã bị đóng.' });
      ws.close(CLOSE_RATE_LIMITED, 'rate limited');
      return;
    }
    const size = typeof message === 'string' ? new TextEncoder().encode(message).length : message.byteLength;
    if (size > MAX_MESSAGE_BYTES) {
      ws.close(1009, 'Message too big');
      return;
    }
    const user = ws.deserializeAttachment() as SocketUser;
    if (await this.sessions.hasEnded(ws, user, Date.now())) {
      this.send(ws, { t: 'error', code: SIGNED_OUT_CODE, message: SIGNED_OUT_MESSAGE });
      ws.close(CLOSE_SIGNED_OUT, SIGNED_OUT_CODE);
      return;
    }
    try {
      if (typeof message !== 'string') throw new RoomError('bad_message', 'Tin nhắn không hợp lệ.');
      const msg = parseClientMessage(message);
      await this.handle(user, msg);
    } catch (err) {
      if (err instanceof RoomError) this.send(ws, { t: 'error', code: err.code, message: err.message });
      else throw err;
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, 'bye');
    } catch {
      // already closed
    }
    await this.onSocketGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  private async onSocketGone(ws: WebSocket): Promise<void> {
    if (!this.room) return;
    await this.onConnectionChange(JSON.stringify(this.room), ws);
  }

  private openSockets(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && OPEN_STATES.has(ws.readyState));
  }

  private connectedUsers(except?: WebSocket): Set<string> {
    const out = new Set<string>();
    for (const ws of this.openSockets(except)) {
      const user = ws.deserializeAttachment() as SocketUser | null;
      if (user) out.add(user.userId);
    }
    return out;
  }

  private send(ws: WebSocket, msg: RoomServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // the socket is closing; its close handler cleans up
    }
  }

  // ------------------------------------------------------------ actions

  private async handle(user: SocketUser, msg: RoomClientMessage): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    if (seatIndexOfUser(room, user.userId) < 0) throw new RoomError('not_seated', 'Bạn không có chỗ trong phòng này.');
    const needHost = () => {
      if (room.hostId !== user.userId) throw new RoomError('not_host', 'Chỉ chủ phòng mới làm được việc này.');
    };
    // Each of these costs a room write, a room alarm and a lobby update; `start` is once per game and exempt.
    const needHostBudget = () => {
      needHost();
      if (!this.hostBudget.take(user.userId, now)) throw new RoomError('too_fast', 'Bạn thao tác quá nhanh, vui lòng chậm lại.');
    };

    switch (msg.t) {
      case 'addCpu': {
        needHostBudget();
        if (room.status !== 'waiting') throw new RoomError('bad_state', 'Chỉ thêm máy khi đang chờ.');
        const seat = room.seats[msg.seat];
        if (!seat || seat.occupant !== null) throw new RoomError('bad_seat', 'Chỗ này không còn trống.');
        setOccupant(seat, { kind: 'cpu', name: nextCpuName(room) });
        await this.commit([]);
        return;
      }
      case 'removeCpu': {
        needHostBudget();
        if (room.status !== 'waiting') throw new RoomError('bad_state', 'Chỉ bỏ máy khi đang chờ.');
        const seat = room.seats[msg.seat];
        if (seat?.occupant?.kind !== 'cpu') throw new RoomError('bad_seat', 'Chỗ này không có máy.');
        setOccupant(seat, null);
        await this.commit([]);
        return;
      }
      case 'cpuLevel': {
        needHostBudget();
        if (room.status !== 'waiting') throw new RoomError('bad_state', 'Chỉ đổi độ khó khi đang chờ.');
        if (levelOf(room) === msg.level) return;
        room.cpuLevel = msg.level;
        await this.commit([]);
        return;
      }
      case 'start': {
        needHost();
        if (room.status !== 'waiting') throw new RoomError('bad_state', 'Ván đấu đã bắt đầu.');
        if (occupiedCount(room) < 2) throw new RoomError('need_players', 'Cần ít nhất 2 người chơi để bắt đầu.');
        const colors = room.seats.filter((s) => s.occupant !== null).map((s) => s.color);
        room.game = createGame(colors);
        room.status = 'playing';
        room.pausedAt = null;
        planTurn(room, this.connectedUsers(), now, this.timings);
        await this.commit([]);
        this.count(humanUsers(room).length > 1 ? 'match_started_group' : 'match_started_solo');
        if (room.seats.some((s) => s.occupant?.kind === 'cpu')) this.count(`cpu_match_${levelOf(room)}`);
        return;
      }
      case 'roll': {
        const game = this.playableGame(user, 'roll');
        await this.apply(applyRoll(game, drawDie()));
        return;
      }
      case 'move': {
        const game = this.playableGame(user, 'move');
        if (!game.legalHorses.includes(msg.horse)) throw new RoomError('illegal_move', 'Quân này không đi được.');
        await this.apply(applyMove(game, msg.horse));
        return;
      }
      case 'rematch': {
        needHostBudget();
        if (room.status !== 'finished') throw new RoomError('bad_state', 'Ván đấu chưa kết thúc.');
        room.status = 'waiting';
        room.game = null;
        room.dueAt = null;
        room.actionDueAt = null;
        // A fresh start for everyone: time spent disconnected during the game does not count against a seat.
        for (const id of Object.keys(room.disconnectedSince)) room.disconnectedSince[id] = now;
        await this.commit([]);
        return;
      }
      case 'leave':
        await this.leave(user.userId);
        return;
      case 'horseNames': {
        if (!this.nameBudget.take(user.userId, now)) throw new RoomError('too_fast', 'Bạn thao tác quá nhanh, vui lòng chậm lại.');
        const seat = room.seats[seatIndexOfUser(room, user.userId)];
        if (!seat) throw new RoomError('not_seated', 'Bạn không có chỗ trong phòng này.');
        if (msg.names.every((n) => n === '')) delete seat.horseNames;
        else seat.horseNames = msg.names;
        await this.commit([]);
        return;
      }
      case 'pause': {
        needHostBudget();
        if (room.status !== 'playing') throw new RoomError('bad_state', 'Chỉ tạm dừng được khi ván đang chơi.');
        if (isPaused(room)) throw new RoomError('bad_state', 'Ván đấu đang tạm dừng.');
        room.pausedAt = now;
        await this.commit([]);
        return;
      }
      case 'resume': {
        needHostBudget();
        if (!isPaused(room)) throw new RoomError('bad_state', 'Ván đấu không tạm dừng.');
        resumeGame(room, this.connectedUsers(), now, this.timings);
        await this.commit([]);
        return;
      }
      case 'emote': {
        // Broadcast only: no commit, storage write, seq bump, alarm or lobby push.
        if (!this.emoteBudget.take(user.userId, now)) return;
        const payload = JSON.stringify({ t: 'emote', seat: seatIndexOfUser(room, user.userId), id: msg.id } satisfies RoomServerMessage);
        for (const ws of this.openSockets()) {
          try {
            ws.send(payload);
          } catch {
            // closing socket
          }
        }
        return;
      }
      case 'closeRoom':
        needHost();
        await this.closeRoom('closed_by_host', 'Chủ phòng đã đóng phòng.');
        return;
    }
  }

  /** The running game when it is `user`'s turn in `phase`; otherwise throws the matching error. */
  private playableGame(user: SocketUser, phase: 'roll' | 'move') {
    const room = this.room;
    const game = room?.game;
    if (!room || !game || room.status !== 'playing') throw new RoomError('bad_state', 'Ván đấu chưa bắt đầu.');
    if (isPaused(room)) throw new RoomError('paused', 'Chủ phòng đã tạm dừng ván đấu.');
    const occupant = room.seats[currentSeatIndex(room)]?.occupant;
    if (occupant?.kind !== 'human' || occupant.user.id !== user.userId) {
      throw new RoomError('not_your_turn', 'Chưa đến lượt của bạn.');
    }
    if (game.phase !== phase) {
      throw new RoomError('bad_phase', phase === 'roll' ? 'Bạn cần chọn quân để đi.' : 'Bạn cần đổ xúc xắc trước.');
    }
    return game;
  }

  private async apply(result: StepResult): Promise<void> {
    const room = this.room;
    if (!room) return;
    room.game = result.state;
    if (result.state.phase === 'finished') {
      room.status = 'finished';
      this.count('match_finished');
      room.dueAt = null;
      room.actionDueAt = null;
    } else {
      planTurn(room, this.connectedUsers(), Date.now(), this.timings);
    }
    await this.commit(result.events);
  }

  /** Counts a match milestone in the launch funnel without delaying the room. */
  private count(event: Extract<ServerEvent, `match_${string}` | `cpu_match_${string}`>): void {
    this.ctx.waitUntil(countEvent(this.env, event, NO_SOURCE));
  }

  private async leave(userId: string): Promise<void> {
    const room = this.room;
    if (!room) return;
    const i = seatIndexOfUser(room, userId);
    const seat = room.seats[i];
    if (!seat) return;
    setOccupant(seat, room.status === 'playing' ? { kind: 'cpu', name: nextCpuName(room) } : null);
    delete room.disconnectedSince[userId];
    for (const ws of this.ctx.getWebSockets()) {
      const u = ws.deserializeAttachment() as SocketUser | null;
      if (u?.userId !== userId) continue;
      this.send(ws, { t: 'error', code: 'left', message: 'Bạn đã rời phòng.' });
      ws.close(CLOSE_LEFT, 'left');
    }
    if (room.status === 'playing' && currentSeatIndex(room) === i) {
      // While paused the clocks stand at the pause start; resuming moves them on from there.
      const from = isPaused(room) ? (room.pausedAt ?? Date.now()) : Date.now();
      room.dueAt = Math.min(room.dueAt ?? Infinity, from + this.timings.cpuDelayMs);
      room.actionDueAt = null;
    }
    await this.commit([]);
  }

  // ----------------------------------------------- commit and scheduling

  /**
   * Single exit point for every change: re-derives connection bookkeeping,
   * fixes the host, persists, broadcasts one snapshot and re-arms the alarm.
   * `closing` is a socket that is going away and must not count as connected.
   */
  private async commit(events: GameEvent[], closing?: WebSocket): Promise<void> {
    const room = this.room;
    if (!room) return;
    const connected = this.connectedUsers(closing);
    reconcileConnections(room, connected, Date.now(), this.timings);
    if (this.closeIfAbandoned(room)) return;
    room.seq += 1;
    await this.persistAndSchedule();
    const payload = this.stateMessage(events, connected);
    for (const ws of this.openSockets(closing)) {
      try {
        ws.send(payload);
      } catch {
        // closing socket
      }
    }
    this.pushLobby();
  }

  /**
   * A socket opened or closed. Commits (and so bumps `seq`, writes and broadcasts) only when this
   * changed the room as `before` recorded it; returns whether it did.
   */
  private async onConnectionChange(before: string, closing?: WebSocket): Promise<boolean> {
    const room = this.room;
    if (!room) return false;
    reconcileConnections(room, this.connectedUsers(closing), Date.now(), this.timings);
    if (JSON.stringify(room) === before) return false;
    await this.commit([], closing);
    return true;
  }

  private stateMessage(events: GameEvent[], connected: ReadonlySet<string>): string {
    const room = this.room;
    if (!room) return '';
    return JSON.stringify({
      t: 'state',
      room: toSnapshot(room, connected),
      events,
      serverNow: Date.now(),
    } satisfies RoomServerMessage);
  }

  private sendState(ws: WebSocket, events: GameEvent[], connected: ReadonlySet<string>): void {
    try {
      ws.send(this.stateMessage(events, connected));
    } catch {
      // closing socket
    }
  }

  /** Closes the room when no human holds a seat; true when it did. */
  private closeIfAbandoned(room: RoomState): boolean {
    if (humanUsers(room).length > 0) return false;
    void this.closeRoom();
    return true;
  }

  private async closeRoom(code = 'room_closed', message = 'Phòng đã đóng.'): Promise<void> {
    const room = this.room;
    if (!room) return;
    this.room = null;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        this.send(ws, { t: 'error', code, message });
        ws.close(CLOSE_ROOM_CLOSED, 'closed');
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.ctx.waitUntil(this.removeFromLobby(room.code));
    this.lastPushed = '';
  }

  /** Retries with growing pauses; the lobby's own periodic check is the backstop if every attempt fails. */
  private async removeFromLobby(code: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.env.LOBBY.getByName('lobby').removeRoom(code);
        return;
      } catch (err) {
        console.error('lobby removeRoom failed', err);
        await new Promise((resolve) => setTimeout(resolve, 500 * 4 ** attempt));
      }
    }
  }

  private async persistAndSchedule(): Promise<void> {
    const room = this.room;
    if (!room) return;
    await this.ctx.storage.put(STORAGE_KEY, room);
    const wake = nextWake(room, this.timings);
    if (wake === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(wake);
  }

  /** Tells the lobby about this room when its public summary changed. */
  private pushLobby(created = false): void {
    const room = this.room;
    if (!room) return;
    const summary = toSummary(room);
    const key = JSON.stringify([summary, room.visibility, room.hostId]);
    if (key === this.lastPushed) return;
    this.lastPushed = key;
    this.ctx.waitUntil(
      this.env.LOBBY.getByName('lobby')
        .upsertRoom(summary, room.visibility, room.hostId, created)
        .catch((err: unknown) => {
          this.lastPushed = '';
          console.error('lobby upsertRoom failed', err);
        }),
    );
  }

  /** Sockets that never send a message (waiting, spectating) are still checked whenever the alarm runs. */
  private async endExpiredSockets(now: number): Promise<void> {
    const ended = await this.sessions.endedAmong(this.openSockets(), (ws) => ws.deserializeAttachment() as SocketUser, now);
    for (const ws of ended) {
      this.send(ws, { t: 'error', code: SIGNED_OUT_CODE, message: SIGNED_OUT_MESSAGE });
      ws.close(CLOSE_SIGNED_OUT, SIGNED_OUT_CODE);
    }
  }

  /**
   * The one alarm. Whatever time it was armed for, what is due is re-derived
   * from persisted state, so a late or repeated firing does the right thing.
   */
  override async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    await this.endExpiredSockets(now);
    // The room may have closed or been replaced while the lookup was in flight.
    if (this.room !== room) return;
    const before = JSON.stringify(room);
    const connected = this.connectedUsers();
    reconcileConnections(room, connected, now, this.timings);

    if (room.noHumanConnectedSince !== null && now >= room.noHumanConnectedSince + this.timings.idleCloseMs) {
      await this.closeRoom();
      return;
    }

    let events: GameEvent[] = [];

    if (room.status === 'waiting') {
      let vacated = false;
      for (const [userId, since] of Object.entries(room.disconnectedSince)) {
        if (now < since + this.timings.waitingDisconnectMs) continue;
        const seat = room.seats[seatIndexOfUser(room, userId)];
        if (seat) setOccupant(seat, null);
        delete room.disconnectedSince[userId];
        vacated = true;
      }
      if (vacated) reconcileConnections(room, connected, now, this.timings);
    } else if (room.status === 'playing' && !isPaused(room) && room.noHumanConnectedSince === null && room.dueAt !== null && now >= room.dueAt && room.game) {
      // With nobody watching, or paused by the host, the game stays frozen.
      const game = room.game;
      const result =
        game.phase === 'roll'
          ? applyRoll(game, drawDie())
          : game.phase === 'move'
            ? applyMove(game, chooseCpuMove(game, levelForOccupant(room, room.seats[currentSeatIndex(room)]?.occupant ?? null)))
            : null;
      if (result) {
        room.game = result.state;
        events = result.events;
        if (result.state.phase === 'finished') {
          room.status = 'finished';
          this.count('match_finished');
          room.dueAt = null;
          room.actionDueAt = null;
        } else {
          planTurn(room, connected, now, this.timings);
        }
      }
    }

    if (JSON.stringify(room) !== before) await this.commit(events);
    else await this.persistAndSchedule();
  }
}
