import { Hono, type Context } from 'hono';
import {
  MAX_SEATS,
  MIN_SEATS,
  type ApiError,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type PublicUser,
} from '../../shared/protocol';
import { countEvent, requestSource } from '../analytics/count';
import { requireSameOrigin } from '../auth/routes';
import { getSessionUser } from '../auth/session';
import { sanitizeText } from '../auth/validate';
import type { Env } from '../env';
import { MAX_ROOM_NAME, USER_HEADER } from './constants';
import { generateRoomCode, isRoomCode } from './room-code';

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

/** Forwards a WebSocket upgrade to a Durable Object with the authenticated user attached. */
function forwardUpgrade(user: PublicUser, stub: { fetch(request: Request): Promise<Response> }) {
  const headers = new Headers({ Upgrade: 'websocket', [USER_HEADER]: encodeURIComponent(JSON.stringify(user)) });
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
  const summary = await c.env.ROOMS.getByName(code).summary();
  return summary ? c.json(summary) : notFound(c);
});

roomRoutes.get('/rooms/:code/ws', async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return unauthorized(c);
  if (!sameOrigin(c)) return fail(c, 403, 'forbidden_origin', 'Yêu cầu không hợp lệ.');
  if (c.req.header('Upgrade') !== 'websocket') return fail(c, 400, 'expected_websocket', 'Cần kết nối WebSocket.');
  const code = c.req.param('code').toUpperCase();
  if (!isRoomCode(code)) return notFound(c);
  return forwardUpgrade(user, c.env.ROOMS.getByName(code));
});

roomRoutes.get('/lobby/ws', async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return unauthorized(c);
  if (!sameOrigin(c)) return fail(c, 403, 'forbidden_origin', 'Yêu cầu không hợp lệ.');
  if (c.req.header('Upgrade') !== 'websocket') return fail(c, 400, 'expected_websocket', 'Cần kết nối WebSocket.');
  return forwardUpgrade(user, c.env.LOBBY.getByName('lobby'));
});
