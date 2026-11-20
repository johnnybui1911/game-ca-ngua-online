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
  USER_HEADER,
} from './constants';
import { isRoomCode } from './room-code';

interface LobbyEntry {
  summary: RoomSummary;
  visibility: RoomVisibility;
  /** Insertion order for newest-first listing. */
  at: number;
}

const ROOMS_KEY = 'rooms';
const CREATES_KEY = 'creates';

export class LobbyDO extends DurableObject<Env> {
  private rooms: Record<string, LobbyEntry> = {};
  private creates: Record<string, number[]> = {};
  /** `${from}|${to}|${code}` -> last invite time. Losing it on eviction only forgets a 10 s window. */
  private invites = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.rooms = (await ctx.storage.get<Record<string, LobbyEntry>>(ROOMS_KEY)) ?? {};
      this.creates = (await ctx.storage.get<Record<string, number[]>>(CREATES_KEY)) ?? {};
    });
  }

  // ------------------------------------------------------------------ RPC

  async upsertRoom(summary: RoomSummary, visibility: RoomVisibility): Promise<void> {
    const prev = this.rooms[summary.code];
    this.rooms[summary.code] = { summary, visibility, at: prev?.at ?? Date.now() };
    await this.ctx.storage.put(ROOMS_KEY, this.rooms);
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
    server.serializeAttachment(user);
    this.send(server, this.lobbyMessage());
    await this.scheduleBroadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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
    const key = `${sender.id}|${toUserId}|${code}`;
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
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + LOBBY_BROADCAST_DELAY_MS);
    }
  }

  override async alarm(): Promise<void> {
    const payload = JSON.stringify(this.lobbyMessage());
    for (const ws of this.openSockets()) {
      try {
        ws.send(payload);
      } catch {
        // closing socket
      }
    }
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
