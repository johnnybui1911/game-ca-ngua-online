import { Hono } from 'hono';
import type { ApiError } from '../shared/protocol';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.notFound((c) =>
  c.json<ApiError>({ error: { code: 'not_found', message: 'Không tìm thấy.' } }, 404),
);

export default app;
