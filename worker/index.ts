import { Hono } from 'hono';
import type { ApiError } from '../shared/protocol';
import { eventRoutes } from './analytics/events';
import { HttpError } from './auth/errors';
import { authRoutes } from './auth/routes';
import type { Env } from './env';
import { feedbackRoutes } from './feedback/routes';
import { roomRoutes } from './rooms/routes';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));

// The landing page moved to /gioi-thieu; old links, shares and search results keep working.
app.get('/co-ca-ngua-online', (c) => {
  const { search } = new URL(c.req.url);
  return c.redirect(`/gioi-thieu${search}`, 301);
});

app.route('/api/auth', authRoutes);
app.route('/api', roomRoutes);
app.route('/api', eventRoutes);
app.route('/api', feedbackRoutes);

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
