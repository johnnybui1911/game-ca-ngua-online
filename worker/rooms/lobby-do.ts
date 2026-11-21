import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE_SIGNED_OUT,
  SIGNED_OUT_CODE,
  SIGNED_OUT_MESSAGE,
  type LobbyClientMessage,
  type LobbyServerMessage,
  type PublicUser,
  type RoomSummary,
  type RoomVisibility,
} from '../../shared/protocol';
import type { Env } from '../env';
import {
  CREATE_RESERVATION_MS,
  INVITE_COOLDOWN_MS,
  LOBBY_BROADCAST_DELAY_MS,
  MAX_CREATES_PER_MINUTE,
  MAX_LOBBY_LIST,
  MAX_OPEN_ROOMS_PER_HOST,
  MAX_MESSAGE_BYTES,
  MAX_LOBBY_SOCKETS_PER_USER,
  SESSION_HEADER,
  SESSION_RECHECK_MS,
  SOCKET_BURST,
  SOCKET_REFILL_PER_SEC,
  USER_HEADER,
  timingsFor,
  type Timings,
} from './constants';
import { isRoomCode } from './room-code';
import {
  ROOM_KEY_PREFIX,
  listRoom,
  mergeLegacyRooms,
  publicRoomList,
  reserveCreate,
  roomKey,
  type PendingCreates,
  type StoredRoom,
} from './lobby-rooms';
import { bindingOf, invitedMessage, onlineUsers, type LobbySocketUser } from './lobby-sockets';
import { SessionGuard, itemsOfSession } from './session-guard';
import { KeyedQueue } from './socket-queue';
import { applySweep } from './lobby-sweep';
import { TokenBucket } from './token-bucket';

/** Close codes the client treats as final; see STOP_CODES on the web side. */
const CLOSE_TOO_MANY = 4003;
const CLOSE_RATE_LIMITED = 4005;

interface LobbyEntry extends StoredRoom {
  /** Bumped from `revCounter` on every write, so a sweep can tell its answer went stale. */
  rev: number;
}

/** Where every room's entry lived before it got a key of its own. */
const LEGACY_ROOMS_KEY = 'rooms';
/** Most keys one `put` of many may carry. */
const PUT_BATCH = 128;
const CREATES_KEY = 'creates';
const SWEEP_KEY = 'sweepAt';

export class LobbyDO extends DurableObject<Env> {
  private rooms: Record<string, LobbyEntry> = {};
  private revCounter = 0;
  private creates: Record<string, number[]> = {};
  /** Creations whose room has not reached the lobby yet; in memory, since they expire within seconds. */
  private readonly pendingCreates: PendingCreates = new Map();
  /** `${from}|${to}` -> last invite time. Losing it on eviction only forgets a 10 s window. */
  private invites = new Map<string, number>();
  private readonly buckets = new WeakMap<WebSocket, TokenBucket>();
  private readonly timings: Timings;
  private readonly sessions: SessionGuard;
  private readonly inbox = new KeyedQueue<WebSocket>();
  /** When the lobby next checks its listed rooms against their room objects; null while it lists none. */
  private sweepAt: number | null = null;
  /** When the pending broadcast is due; null when none is waiting. */
  private broadcastAt: number | null = null;
  /** Last payload sent, so an alarm that has nothing new to say stays silent. */
  private lastPayload = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.timings = timingsFor(env);
    this.sessions = new SessionGuard(env.DB, SESSION_RECHECK_MS, this.timings.lobbySweepMs);
    void ctx.blockConcurrencyWhile(async () => {
      await this.loadRooms();
      this.creates = (await ctx.storage.get<Record<string, number[]>>(CREATES_KEY)) ?? {};
      this.sweepAt = (await ctx.storage.get<number>(SWEEP_KEY)) ?? null;
    });
  }

  // ------------------------------------------------------------------ RPC

  private async loadRooms(): Promise<void> {
    const stored = await this.ctx.storage.list<StoredRoom>({ prefix: ROOM_KEY_PREFIX });
    const current: Record<string, StoredRoom> = {};
    for (const [key, entry] of stored) current[key.slice(ROOM_KEY_PREFIX.length)] = entry;
    const legacy = await this.ctx.storage.get<Record<string, StoredRoom>>(LEGACY_ROOMS_KEY);
    const { merged, migrated } = mergeLegacyRooms(current, legacy ?? {});
    if (legacy) {
      // Per-room keys first: a crash before the delete leaves both, and the merge is repeatable.
      const entries = Object.entries(migrated).map(([code, entry]) => [roomKey(code), entry] as const);
      for (let i = 0; i < entries.length; i += PUT_BATCH) {
        await this.ctx.storage.put(Object.fromEntries(entries.slice(i, i + PUT_BATCH)));
      }
      await this.ctx.storage.delete(LEGACY_ROOMS_KEY);
    }
    for (const [code, entry] of Object.entries(merged)) this.rooms[code] = { ...entry, rev: ++this.revCounter };
  }

  private persistRoom(code: string): Promise<void> {
    const entry = this.rooms[code];
    if (!entry) return this.ctx.storage.delete(roomKey(code)).then(() => undefined);
    const { rev: _rev, ...stored } = entry;
    return this.ctx.storage.put(roomKey(code), stored);
  }

  /** `created` marks the room's first listing after its creation, which is what ends the creator's reservation. */
  async upsertRoom(summary: RoomSummary, visibility: RoomVisibility, hostId: string, created = false): Promise<void> {
    const entry = listRoom(this.rooms, this.pendingCreates, { summary, visibility, hostId, created }, Date.now());
    this.rooms[summary.code] = { ...entry, rev: ++this.revCounter };
    await this.persistRoom(summary.code);
    await this.ensureSweepScheduled();
    await this.scheduleBroadcast();
  }

  async removeRoom(code: string): Promise<void> {
    if (!(code in this.rooms)) return;
    delete this.rooms[code];
    await this.persistRoom(code);
    await this.scheduleBroadcast();
  }

  /**
   * Decides whether the user may create a room: not past the open-room cap and under the per-minute
   * limit. An allowed creation is held against the cap until its room is listed, so a burst of
   * creates cannot all pass before the first room arrives.
   */
  async allowCreate(userId: string): Promise<'ok' | 'too_many_rooms' | 'rate_limited'> {
    const now = Date.now();
    const recent = (this.creates[userId] ?? []).filter((t) => now - t < 60_000);
    this.creates[userId] = recent;
    if (recent.length >= MAX_CREATES_PER_MINUTE) return 'rate_limited';
    if (!reserveCreate(this.rooms, this.pendingCreates, userId, now, MAX_OPEN_ROOMS_PER_HOST, CREATE_RESERVATION_MS)) {
      return 'too_many_rooms';
    }
    recent.push(now);
    for (const id of Object.keys(this.creates)) {
      if ((this.creates[id] ?? []).every((t) => now - t >= 60_000)) delete this.creates[id];
    }
    await this.ctx.storage.put(CREATES_KEY, this.creates);
    return 'ok';
  }

  /** Ends every lobby socket opened under this session; the user's other sessions stay connected. */
  async closeSession(sessionHash: string): Promise<void> {
    const mine = itemsOfSession(this.openSockets(), (ws) => (ws.deserializeAttachment() as LobbySocketUser | null)?.sessionHash, sessionHash);
    for (const ws of mine) this.endSocket(ws);
    if (mine.length > 0) await this.scheduleBroadcast();
  }

  private endSocket(ws: WebSocket): void {
    this.send(ws, { t: 'error', code: SIGNED_OUT_CODE, message: SIGNED_OUT_MESSAGE });
    ws.close(CLOSE_SIGNED_OUT, SIGNED_OUT_CODE);
  }

  // ------------------------------------------------------------ sockets

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const header = request.headers.get(USER_HEADER);
    if (!header) return new Response('Unauthorized', { status: 401 });
    const user = JSON.parse(decodeURIComponent(header)) as PublicUser;
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const sessionHash = request.headers.get(SESSION_HEADER) ?? undefined;
    const attachment: LobbySocketUser = { id: user.id, displayName: user.displayName, at: Date.now(), sessionHash };
    server.serializeAttachment(attachment);
    this.trimSockets(user.id);
    this.send(server, this.lobbyMessage());
    await this.scheduleBroadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Closes a user's oldest sockets beyond the per-user cap. */
  private trimSockets(userId: string): void {
    const mine = this.socketsOf(userId).sort(
      (a, b) => ((a.deserializeAttachment() as LobbySocketUser).at ?? 0) - ((b.deserializeAttachment() as LobbySocketUser).at ?? 0),
    );
    for (const ws of mine.slice(0, Math.max(0, mine.length - MAX_LOBBY_SOCKETS_PER_USER))) {
      this.send(ws, { t: 'error', code: 'too_many_connections', message: 'Bạn mở sảnh ở quá nhiều tab.' });
      ws.close(CLOSE_TOO_MANY, 'too many connections');
    }
  }

  /** One socket's messages are handled in arrival order, though handling awaits. */
  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    return this.inbox.run(ws, () => this.handleMessage(ws, message));
  }

  private async handleMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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
    const attachment = ws.deserializeAttachment() as LobbySocketUser;
    if (await this.sessions.hasEnded(ws, bindingOf(attachment), Date.now())) {
      this.endSocket(ws);
      await this.scheduleBroadcast();
      return;
    }
    const fail = (code: string, text: string) => this.send(ws, { t: 'error', code, message: text });
    if (typeof message !== 'string') return fail('bad_message', 'Tin nhắn không hợp lệ.');
    let msg: unknown;
    try {
      msg = JSON.parse(message);
    } catch {
      return fail('bad_message', 'Tin nhắn không hợp lệ.');
    }
    const invite = msg as Partial<LobbyClientMessage> | null;
    if (invite?.t !== 'invite' || typeof invite.toUserId !== 'string' || typeof invite.code !== 'string') {
      return fail('bad_message', 'Tin nhắn không hợp lệ.');
    }
    await this.invite(attachment, invite.toUserId, invite.code, fail);
  }

  private async invite(
    sender: LobbySocketUser,
    toUserId: string,
    code: string,
    fail: (code: string, text: string) => void,
  ): Promise<void> {
    if (toUserId === sender.id) return fail('invalid_invite', 'Bạn không thể tự mời chính mình.');
    if (!isRoomCode(code)) return fail('invalid_invite', 'Mã phòng không hợp lệ.');
    const targets = this.socketsOf(toUserId);
    if (targets.length === 0) return fail('not_online', 'Người này không còn online.');
    const now = Date.now();
    const key = `${sender.id}|${toUserId}`;
    const last = this.invites.get(key);
    if (last !== undefined && now - last < INVITE_COOLDOWN_MS) {
      return fail('invite_cooldown', 'Bạn vừa mời người này, vui lòng đợi một chút.');
    }
    // Claim the slot before awaiting the room so two invites in flight cannot both pass the check.
    for (const [k, t] of this.invites) if (now - t >= INVITE_COOLDOWN_MS) this.invites.delete(k);
    this.invites.set(key, now);
    const roomName = await this.env.ROOMS.getByName(code).seatedRoomName(sender.id);
    if (roomName === null) {
      this.invites.delete(key);
      return fail('not_in_room', 'Bạn không ở trong phòng này.');
    }
    for (const ws of targets) this.send(ws, invitedMessage(sender, code, roomName));
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, 'bye');
    } catch {
      // already closed
    }
    await this.scheduleBroadcast();
  }

  override async webSocketError(): Promise<void> {
    await this.scheduleBroadcast();
  }

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN);
  }

  private socketsOf(userId: string): WebSocket[] {
    return this.openSockets().filter((ws) => (ws.deserializeAttachment() as LobbySocketUser | null)?.id === userId);
  }

  private send(ws: WebSocket, msg: LobbyServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // closing socket
    }
  }

  // ------------------------------------------------------- coalesced push

  /** Any number of changes within the delay share one broadcast, sent from the alarm. */
  private async scheduleBroadcast(): Promise<void> {
    this.broadcastAt ??= Date.now() + LOBBY_BROADCAST_DELAY_MS;
    await this.arm();
  }

  private async ensureSweepScheduled(): Promise<void> {
    if (this.sweepAt !== null || Object.keys(this.rooms).length === 0) return;
    this.sweepAt = Date.now() + this.timings.lobbySweepMs;
    await this.ctx.storage.put(SWEEP_KEY, this.sweepAt);
  }

  /** One alarm serves both the coalesced broadcast and the periodic room check; it is set to the earlier. */
  private async arm(): Promise<void> {
    const times = [this.broadcastAt, this.sweepAt].filter((t): t is number => t !== null);
    if (times.length > 0) await this.ctx.storage.setAlarm(Math.min(...times));
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    this.broadcastAt = null;
    if (this.sweepAt !== null && now >= this.sweepAt) {
      this.sweepAt = null;
      await this.sweepRooms();
      await this.ensureSweepScheduled();
      if (this.sweepAt === null) await this.ctx.storage.delete(SWEEP_KEY);
    }
    await this.endExpiredSockets(now);
    const payload = JSON.stringify(this.lobbyMessage());
    if (payload !== this.lastPayload) {
      this.lastPayload = payload;
      for (const ws of this.openSockets()) {
        try {
          ws.send(payload);
        } catch {
          // closing socket
        }
      }
    }
    await this.arm();
  }

  /** Sockets whose session expired or whose user was deleted close even if they never send a message. */
  private async endExpiredSockets(now: number): Promise<void> {
    const sockets = this.openSockets();
    const ended = await this.sessions.endedAmong(sockets, (ws) => bindingOf(ws.deserializeAttachment() as LobbySocketUser), now);
    for (const ws of ended) this.endSocket(ws);
  }

  /**
   * Asks each listed room's object whether it still exists. A room that closed while its removal
   * notice was lost (or never arrived) would otherwise stay listed for good.
   */
  private async sweepRooms(): Promise<void> {
    const asked = Object.entries(this.rooms).map(([code, entry]) => ({ code, rev: entry.rev }));
    const results = await Promise.all(
      asked.map(({ code, rev }) =>
        this.env.ROOMS.getByName(code)
          .summary()
          .then(
            (summary) => ({ code, rev, summary, failed: false }),
            () => ({ code, rev, summary: null, failed: true }),
          ),
      ),
    );
    // An unreachable room object says nothing about the room, so only definite answers count.
    const answers = results.filter((r) => !r.failed).map((r) => ({ code: r.code, summary: r.summary, rev: r.rev }));
    await Promise.all(applySweep(this.rooms, answers).map((code) => this.persistRoom(code)));
  }

  private lobbyMessage(): LobbyServerMessage {
    const rooms = publicRoomList(this.rooms, MAX_LOBBY_LIST);
    const online = onlineUsers(this.openSockets().map((ws) => ws.deserializeAttachment() as LobbySocketUser | null));
    return { t: 'lobby', rooms, online };
  }
}
