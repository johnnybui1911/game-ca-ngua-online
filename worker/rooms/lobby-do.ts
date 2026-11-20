import { DurableObject } from 'cloudflare:workers';
import type {
  LobbyClientMessage,
  LobbyServerMessage,
  PublicUser,
  RoomSummary,
  RoomVisibility,
} from '../../shared/protocol';
import type { Env } from '../env';
import {
  INVITE_COOLDOWN_MS,
  LOBBY_BROADCAST_DELAY_MS,
  MAX_CREATES_PER_MINUTE,
  MAX_MESSAGE_BYTES,
  MAX_LOBBY_SOCKETS_PER_USER,
  SOCKET_BURST,
  SOCKET_REFILL_PER_SEC,
  USER_HEADER,
  timingsFor,
  type Timings,
} from './constants';
import { isRoomCode } from './room-code';
import { applySweep } from './lobby-sweep';
import { TokenBucket } from './token-bucket';

/** Close codes the client treats as final; see STOP_CODES on the web side. */
const CLOSE_TOO_MANY = 4003;
const CLOSE_RATE_LIMITED = 4005;

/** What the lobby keeps on a socket: the user, plus when it connected to find the oldest. */
type LobbySocketUser = PublicUser & { at: number };

interface LobbyEntry {
  summary: RoomSummary;
  visibility: RoomVisibility;
  /** Insertion order for newest-first listing. */
  at: number;
}

const ROOMS_KEY = 'rooms';
const CREATES_KEY = 'creates';
const SWEEP_KEY = 'sweepAt';

export class LobbyDO extends DurableObject<Env> {
  private rooms: Record<string, LobbyEntry> = {};
  private creates: Record<string, number[]> = {};
  /** `${from}|${to}` -> last invite time. Losing it on eviction only forgets a 10 s window. */
  private invites = new Map<string, number>();
  private readonly buckets = new WeakMap<WebSocket, TokenBucket>();
  private readonly timings: Timings;
  /** When the lobby next checks its listed rooms against their room objects; null while it lists none. */
  private sweepAt: number | null = null;
  /** When the pending broadcast is due; null when none is waiting. */
  private broadcastAt: number | null = null;
  /** Last payload sent, so an alarm that has nothing new to say stays silent. */
  private lastPayload = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.timings = timingsFor(env);
    void ctx.blockConcurrencyWhile(async () => {
      this.rooms = (await ctx.storage.get<Record<string, LobbyEntry>>(ROOMS_KEY)) ?? {};
      this.creates = (await ctx.storage.get<Record<string, number[]>>(CREATES_KEY)) ?? {};
      this.sweepAt = (await ctx.storage.get<number>(SWEEP_KEY)) ?? null;
    });
  }

  // ------------------------------------------------------------------ RPC

  async upsertRoom(summary: RoomSummary, visibility: RoomVisibility): Promise<void> {
    const prev = this.rooms[summary.code];
    this.rooms[summary.code] = { summary, visibility, at: prev?.at ?? Date.now() };
    await this.ctx.storage.put(ROOMS_KEY, this.rooms);
    await this.ensureSweepScheduled();
    await this.scheduleBroadcast();
  }

  async removeRoom(code: string): Promise<void> {
    if (!(code in this.rooms)) return;
    delete this.rooms[code];
    await this.ctx.storage.put(ROOMS_KEY, this.rooms);
    await this.scheduleBroadcast();
  }

  /** Records a room creation and says whether the user is still under the per-minute limit. */
  async allowCreate(userId: string): Promise<boolean> {
    const now = Date.now();
    const recent = (this.creates[userId] ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= MAX_CREATES_PER_MINUTE) {
      this.creates[userId] = recent;
      return false;
    }
    recent.push(now);
    this.creates[userId] = recent;
    for (const id of Object.keys(this.creates)) {
      if ((this.creates[id] ?? []).every((t) => now - t >= 60_000)) delete this.creates[id];
    }
    await this.ctx.storage.put(CREATES_KEY, this.creates);
    return true;
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
    const attachment: LobbySocketUser = { id: user.id, displayName: user.displayName, at: Date.now() };
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

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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
    const sender = ws.deserializeAttachment() as PublicUser;
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
    await this.invite(sender, invite.toUserId, invite.code, fail);
  }

  private async invite(
    sender: PublicUser,
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
    for (const ws of targets) this.send(ws, { t: 'invited', from: sender, code, roomName });
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
    return this.openSockets().filter((ws) => (ws.deserializeAttachment() as PublicUser | null)?.id === userId);
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

  /**
   * Asks each listed room's object whether it still exists. A room that closed while its removal
   * notice was lost (or never arrived) would otherwise stay listed for good.
   */
  private async sweepRooms(): Promise<void> {
    const codes = Object.keys(this.rooms);
    const results = await Promise.all(
      codes.map((code) =>
        this.env.ROOMS.getByName(code)
          .summary()
          .then(
            (summary) => ({ code, summary, failed: false }),
            () => ({ code, summary: null, failed: true }),
          ),
      ),
    );
    // An unreachable room object says nothing about the room, so only definite answers count.
    const answers = results.filter((r) => !r.failed).map((r) => ({ code: r.code, summary: r.summary }));
    if (applySweep(this.rooms, answers)) await this.ctx.storage.put(ROOMS_KEY, this.rooms);
  }

  private lobbyMessage(): LobbyServerMessage {
    const rooms = Object.values(this.rooms)
      .filter((e) => e.visibility === 'public' && e.summary.status !== 'finished')
      .sort((a, b) => b.at - a.at)
      .map((e) => e.summary);
    const online = new Map<string, PublicUser>();
    for (const ws of this.openSockets()) {
      const user = ws.deserializeAttachment() as PublicUser | null;
      if (user) online.set(user.id, { id: user.id, displayName: user.displayName });
    }
    return { t: 'lobby', rooms, online: [...online.values()] };
  }
}
