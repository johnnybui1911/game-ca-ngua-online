import { DurableObject } from 'cloudflare:workers';
import { applyMove, applyRoll, createGame } from '../../shared/game/engine';
import { chooseCpuMove } from '../../shared/game/cpu';
import type { GameEvent, StepResult } from '../../shared/game/types';
import {
  SEAT_COLORS,
  type PublicUser,
  type RoomClientMessage,
  type RoomServerMessage,
  type RoomSummary,
  type RoomVisibility,
} from '../../shared/protocol';
import type { Env } from '../env';
import { MAX_MESSAGE_BYTES, USER_HEADER, timingsFor, type Timings } from './constants';
import {
  currentSeatIndex,
  drawDie,
  dueDelay,
  firstEmptySeat,
  humanUsers,
  nextCpuName,
  nextWake,
  occupiedCount,
  pickHost,
  seatIndexOfUser,
  toSnapshot,
  toSummary,
  type RoomState,
} from './room-state';

/** Close codes the client interprets; they never reconnect after receiving one of these. */
export const CLOSE_LEFT = 4001;
export const CLOSE_REFUSED = 4002;
export const CLOSE_ROOM_CLOSED = 4004;

export interface CreateRoomInit {
  code: string;
  name: string;
  visibility: RoomVisibility;
  seats: number;
  host: PublicUser;
}

interface SocketUser {
  userId: string;
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
    case 'start':
    case 'roll':
    case 'rematch':
    case 'leave':
      return { t: msg.t };
    default:
      throw new RoomError('bad_message', 'Loại tin nhắn không được hỗ trợ.');
  }
}

export class RoomDO extends DurableObject<Env> {
  private room: RoomState | null = null;
  private lastPushed = '';
  private readonly timings: Timings;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.timings = timingsFor(env);
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
      disconnectedSince: { [init.host.id]: now },
      noHumanConnectedSince: now,
    };
    await this.persistAndSchedule();
    this.pushLobby();
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

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const attachment: SocketUser = { userId: user.id, displayName: user.displayName };
    server.serializeAttachment(attachment);

    const refusal = this.admit(this.room, user);
    if (refusal) {
      this.send(server, { t: 'error', code: refusal.code, message: refusal.message });
      server.close(CLOSE_REFUSED, refusal.code);
    } else {
      await this.commit([]);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Seats a connecting user or says why not. Mutates only when it admits. */
  private admit(room: RoomState, user: PublicUser): RoomError | null {
    if (seatIndexOfUser(room, user.id) >= 0) return null;
    if (room.status !== 'waiting') return new RoomError('game_in_progress', 'Ván đấu đang diễn ra, bạn không thể vào phòng này.');
    const seat = firstEmptySeat(room);
    if (seat < 0) return new RoomError('room_full', 'Phòng đã đầy.');
    const target = room.seats[seat];
    if (target) target.occupant = { kind: 'human', user };
    return null;
  }

  // ------------------------------------------------------------ sockets

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.room) return;
    const size = typeof message === 'string' ? new TextEncoder().encode(message).length : message.byteLength;
    if (size > MAX_MESSAGE_BYTES) {
      ws.close(1009, 'Message too big');
      return;
    }
    try {
      if (typeof message !== 'string') throw new RoomError('bad_message', 'Tin nhắn không hợp lệ.');
      const msg = parseClientMessage(message);
      const user = ws.deserializeAttachment() as SocketUser;
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
    await this.commit([], ws);
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

    switch (msg.t) {
      case 'addCpu': {
        needHost();
        if (room.status !== 'waiting') throw new RoomError('bad_state', 'Chỉ thêm máy khi đang chờ.');
        const seat = room.seats[msg.seat];
        if (!seat || seat.occupant !== null) throw new RoomError('bad_seat', 'Chỗ này không còn trống.');
        seat.occupant = { kind: 'cpu', name: nextCpuName(room) };
        await this.commit([]);
        return;
      }
      case 'removeCpu': {
        needHost();
        if (room.status !== 'waiting') throw new RoomError('bad_state', 'Chỉ bỏ máy khi đang chờ.');
        const seat = room.seats[msg.seat];
        if (seat?.occupant?.kind !== 'cpu') throw new RoomError('bad_seat', 'Chỗ này không có máy.');
        seat.occupant = null;
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
        this.planDue(now);
        await this.commit([]);
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
        needHost();
        if (room.status !== 'finished') throw new RoomError('bad_state', 'Ván đấu chưa kết thúc.');
        room.status = 'waiting';
        room.game = null;
        room.dueAt = null;
        // A fresh start for everyone: time spent disconnected during the game does not count against a seat.
        for (const id of Object.keys(room.disconnectedSince)) room.disconnectedSince[id] = now;
        await this.commit([]);
        return;
      }
      case 'leave':
        await this.leave(user.userId);
        return;
    }
  }

  /** The running game when it is `user`'s turn in `phase`; otherwise throws the matching error. */
  private playableGame(user: SocketUser, phase: 'roll' | 'move') {
    const room = this.room;
    const game = room?.game;
    if (!room || !game || room.status !== 'playing') throw new RoomError('bad_state', 'Ván đấu chưa bắt đầu.');
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
      room.dueAt = null;
    } else {
      this.planDue(Date.now());
    }
    await this.commit(result.events);
  }

  /** `dueAt` for the colour now on turn, counted from `now`. */
  private planDue(now: number): void {
    const room = this.room;
    if (!room) return;
    const delay = room.status === 'playing' ? dueDelay(room, this.connectedUsers(), this.timings) : null;
    room.dueAt = delay === null ? null : now + delay;
  }

  private async leave(userId: string): Promise<void> {
    const room = this.room;
    if (!room) return;
    const i = seatIndexOfUser(room, userId);
    const seat = room.seats[i];
    if (!seat) return;
    seat.occupant = room.status === 'playing' ? { kind: 'cpu', name: nextCpuName(room) } : null;
    delete room.disconnectedSince[userId];
    for (const ws of this.ctx.getWebSockets()) {
      const u = ws.deserializeAttachment() as SocketUser | null;
      if (u?.userId !== userId) continue;
      this.send(ws, { t: 'error', code: 'left', message: 'Bạn đã rời phòng.' });
      ws.close(CLOSE_LEFT, 'left');
    }
    if (room.status === 'playing' && currentSeatIndex(room) === i) {
      room.dueAt = Math.min(room.dueAt ?? Infinity, Date.now() + this.timings.cpuDelayMs);
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
    const now = Date.now();
    this.reconcileConnections(room, this.connectedUsers(closing), now);
    if (this.closeIfAbandoned(room)) return;
    room.seq += 1;
    await this.persistAndSchedule();
    const snapshot = toSnapshot(room, this.connectedUsers(closing));
    const payload = JSON.stringify({ t: 'state', room: snapshot, events } satisfies RoomServerMessage);
    for (const ws of this.openSockets(closing)) {
      try {
        ws.send(payload);
      } catch {
        // closing socket
      }
    }
    this.pushLobby();
  }

  /** Brings disconnect timers and the host in line with who has an open socket right now. */
  private reconcileConnections(room: RoomState, connected: ReadonlySet<string>, now: number): void {
    const was = new Set(Object.keys(room.disconnectedSince));
    for (const user of humanUsers(room)) {
      if (connected.has(user.id)) delete room.disconnectedSince[user.id];
      else room.disconnectedSince[user.id] ??= now;
    }
    for (const id of Object.keys(room.disconnectedSince)) {
      if (seatIndexOfUser(room, id) < 0) delete room.disconnectedSince[id];
    }
    const anyConnected = humanUsers(room).some((u) => connected.has(u.id));
    room.noHumanConnectedSince = anyConnected ? null : (room.noHumanConnectedSince ?? now);

    const turnSeat = room.seats[currentSeatIndex(room)]?.occupant;
    if (room.status === 'playing' && turnSeat?.kind === 'human') {
      const id = turnSeat.user.id;
      if (connected.has(id) && was.has(id)) room.dueAt = now + this.timings.turnMs;
      if (!connected.has(id) && !was.has(id)) {
        room.dueAt = Math.min(room.dueAt ?? Infinity, now + Math.max(this.timings.cpuDelayMs, this.timings.playingDisconnectMs));
      }
    }
    if (!humanUsers(room).some((u) => u.id === room.hostId)) {
      const host = pickHost(room);
      if (host !== null) room.hostId = host;
    }
  }

  /** Closes the room when no human holds a seat; true when it did. */
  private closeIfAbandoned(room: RoomState): boolean {
    if (humanUsers(room).length > 0) return false;
    void this.closeRoom();
    return true;
  }

  private async closeRoom(): Promise<void> {
    const room = this.room;
    if (!room) return;
    this.room = null;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        this.send(ws, { t: 'error', code: 'room_closed', message: 'Phòng đã đóng.' });
        ws.close(CLOSE_ROOM_CLOSED, 'closed');
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.ctx.waitUntil(
      this.env.LOBBY.getByName('lobby')
        .removeRoom(room.code)
        .catch((err: unknown) => console.error('lobby removeRoom failed', err)),
    );
    this.lastPushed = '';
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
  private pushLobby(): void {
    const room = this.room;
    if (!room) return;
    const summary = toSummary(room);
    const key = JSON.stringify([summary, room.visibility]);
    if (key === this.lastPushed) return;
    this.lastPushed = key;
    this.ctx.waitUntil(
      this.env.LOBBY.getByName('lobby')
        .upsertRoom(summary, room.visibility)
        .catch((err: unknown) => {
          this.lastPushed = '';
          console.error('lobby upsertRoom failed', err);
        }),
    );
  }

  /**
   * The one alarm. Whatever time it was armed for, what is due is re-derived
   * from persisted state, so a late or repeated firing does the right thing.
   */
  override async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    const connected = this.connectedUsers();
    this.reconcileConnections(room, connected, now);

    if (room.noHumanConnectedSince !== null && now >= room.noHumanConnectedSince + this.timings.idleCloseMs) {
      await this.closeRoom();
      return;
    }

    let events: GameEvent[] = [];
    let changed = false;

    if (room.status === 'waiting') {
      for (const [userId, since] of Object.entries(room.disconnectedSince)) {
        if (now < since + this.timings.waitingDisconnectMs) continue;
        const seat = room.seats[seatIndexOfUser(room, userId)];
        if (seat) seat.occupant = null;
        delete room.disconnectedSince[userId];
        changed = true;
      }
      if (changed) this.reconcileConnections(room, connected, now);
    } else if (room.dueAt !== null && now >= room.dueAt && room.game) {
      const game = room.game;
      const result =
        game.phase === 'roll'
          ? applyRoll(game, drawDie())
          : game.phase === 'move'
            ? applyMove(game, chooseCpuMove(game))
            : null;
      if (result) {
        room.game = result.state;
        events = result.events;
        if (result.state.phase === 'finished') {
          room.status = 'finished';
          room.dueAt = null;
        } else {
          this.planDue(now);
        }
        changed = true;
      }
    }

    if (changed) await this.commit(events);
    else if (this.room) await this.persistAndSchedule();
  }
}
