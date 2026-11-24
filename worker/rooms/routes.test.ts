import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import { roomRoutes } from './routes';

vi.mock('../auth/session', () => ({
  getSessionUser: async () => ({ id: 'u1', displayName: 'Lan' }),
  getSessionIdentity: async () => null,
}));
vi.mock('../analytics/count', () => ({
  countEvent: async () => {},
  requestSource: () => 'direct',
}));

describe('room creation takeover default', () => {
  it.each([
    [undefined, true],
    [true, true],
    [false, false],
  ])('forwards %s as %s', async (input, expected) => {
    const create = vi.fn(async () => true);
    const env = {
      LOBBY: { getByName: () => ({ allowCreate: async () => 'ok' }) },
      ROOMS: { getByName: () => ({ create }) },
    } as unknown as Env;
    const app = new Hono<{ Bindings: Env }>();
    app.route('/api', roomRoutes);
    const res = await app.request('https://game.test/api/rooms', {
      method: 'POST',
      headers: { Origin: 'https://game.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Phòng', visibility: 'public', seats: 4, allowTakeover: input }),
    }, env, { waitUntil: () => {} } as unknown as ExecutionContext);
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ allowTakeover: expected }));
  });
});
