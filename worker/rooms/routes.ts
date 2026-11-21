import { Hono, type Context } from 'hono';
import {
  MAX_SEATS,
  MIN_SEATS,
  type ApiError,
  type CreateRoomRequest,
  type CreateRoomResponse,
} from '../../shared/protocol';
import { countEvent, requestSource } from '../analytics/count';
import { requireSameOrigin } from '../auth/routes';
import { getSessionIdentity, getSessionUser, type SessionIdentity } from '../auth/session';
import { sanitizeText } from '../auth/validate';
import type { Env } from '../env';
import { MAX_ROOM_NAME, SESSION_HEADER, USER_HEADER } from './constants';
import { generateRoomCode, isRoomCode } from './room-code';
import { allowSummaryLookup, summaryLimitBody } from './summary-limit';

type AppContext = Context<{ Bindings: Env }>;

export const roomRoutes = new Hono<{ Bindings: Env }>();

function fail(c: AppContext, status: 400 | 401 | 403 | 404 | 429, code: string, message: string) {
  return c.json<ApiError>({ error: { code, message } }, status);
}

const unauthorized = (c: AppContext) => fail(c, 401, 'unauthorized', 'Bạn cần đăng nhập.');
const notFound = (c: AppContext) => fail(c, 404, 'room_not_found', 'Không tìm thấy phòng.');

function sameOrigin(c: AppContext): boolean {
  const origin = c.req.header('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(c.req.url).host;
  } catch {
    return false;
  }
}

/**
 * Forwards a WebSocket upgrade to a Durable Object with the authenticated user and the hash of
 * its session attached. The hash goes in its own header so it cannot end up inside the user object
 * that rooms store and broadcast.
 */
function forwardUpgrade(identity: SessionIdentity, stub: { fetch(request: Request): Promise<Response> }) {
  const headers = new Headers({
    Upgrade: 'websocket',
    [USER_HEADER]: encodeURIComponent(JSON.stringify(identity.user)),
    [SESSION_HEADER]: identity.sessionHash,
  });
  return stub.fetch(new Request('https://do.internal/ws', { headers }));
}

roomRoutes.post('/rooms', requireSameOrigin, async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return unauthorized(c);
  const body: unknown = await c.req.json().catch(() => null);
  const input = (body ?? {}) as Partial<CreateRoomRequest>;
  const name = typeof input.name === 'string' ? sanitizeText(input.name) : '';
  if (name.length < 1 || name.length > MAX_ROOM_NAME) {
    return fail(c, 400, 'invalid_name', `Tên phòng cần từ 1 đến ${MAX_ROOM_NAME} ký tự.`);
  }
  if (input.visibility !== 'public' && input.visibility !== 'private') {
    return fail(c, 400, 'invalid_visibility', 'Chế độ phòng không hợp lệ.');
  }
  const seats = input.seats;
  if (typeof seats !== 'number' || !Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
    return fail(c, 400, 'invalid_seats', `Số chỗ cần từ ${MIN_SEATS} đến ${MAX_SEATS}.`);
  }
  const allowed = await c.env.LOBBY.getByName('lobby').allowCreate(user.id);
  if (allowed === 'too_many_rooms') {
    return fail(c, 429, 'too_many_rooms', 'Bạn đang có quá nhiều phòng đang mở. Hãy rời bớt phòng trước khi tạo phòng mới.');
  }
  if (allowed !== 'ok') {
    return fail(c, 429, 'rate_limited', 'Bạn tạo phòng quá nhanh, vui lòng thử lại sau một phút.');
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    const created = await c.env.ROOMS.getByName(code).create({ code, name, visibility: input.visibility, seats, host: user });
    if (created) {
      c.executionCtx.waitUntil(countEvent(c.env, 'room_created', requestSource(c.req.raw)));
      return c.json<CreateRoomResponse>({ code }, 201);
    }
  }
  return c.json<ApiError>({ error: { code: 'code_exhausted', message: 'Không tạo được phòng, vui lòng thử lại.' } }, 503);
});

roomRoutes.get('/rooms/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  if (!isRoomCode(code)) return notFound(c);
  // Only lookups that would wake a room object count against the per-address limit.
  if (!(await allowSummaryLookup(c.env, c.req.raw))) return c.json(summaryLimitBody, 429);
  const summary = await c.env.ROOMS.getByName(code).summary();
  return summary ? c.json(summary) : notFound(c);
});

roomRoutes.get('/rooms/:code/ws', async (c) => {
  const identity = await getSessionIdentity(c.req.raw, c.env);
  if (!identity) return unauthorized(c);
  if (!sameOrigin(c)) return fail(c, 403, 'forbidden_origin', 'Yêu cầu không hợp lệ.');
  if (c.req.header('Upgrade') !== 'websocket') return fail(c, 400, 'expected_websocket', 'Cần kết nối WebSocket.');
  const code = c.req.param('code').toUpperCase();
  if (!isRoomCode(code)) return notFound(c);
  return forwardUpgrade(identity, c.env.ROOMS.getByName(code));
});

roomRoutes.get('/lobby/ws', async (c) => {
  const identity = await getSessionIdentity(c.req.raw, c.env);
  if (!identity) return unauthorized(c);
  if (!sameOrigin(c)) return fail(c, 403, 'forbidden_origin', 'Yêu cầu không hợp lệ.');
  if (c.req.header('Upgrade') !== 'websocket') return fail(c, 400, 'expected_websocket', 'Cần kết nối WebSocket.');
  return forwardUpgrade(identity, c.env.LOBBY.getByName('lobby'));
});
