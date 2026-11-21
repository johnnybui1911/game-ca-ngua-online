import { Hono } from 'hono';
import type { ApiError } from '../shared/protocol';
import { eventRoutes } from './analytics/events';
import { HttpError } from './auth/errors';
import { authRoutes } from './auth/routes';
import type { Env } from './env';
import { roomRoutes } from './rooms/routes';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/auth', authRoutes);
app.route('/api', roomRoutes);
app.route('/api', eventRoutes);

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json(err.toBody(), err.status);
  console.error('unhandled error', err);
  return c.json<ApiError>({ error: { code: 'internal', message: 'Có lỗi xảy ra, vui lòng thử lại.' } }, 500);
});

app.notFound((c) =>
  c.json<ApiError>({ error: { code: 'not_found', message: 'Không tìm thấy.' } }, 404),
);

export { LobbyDO } from './rooms/lobby-do';
export { RoomDO } from './rooms/room-do';

export default app;
