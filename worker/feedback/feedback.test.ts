import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { FEEDBACK_LIMITS } from '../../shared/feedback';
import { createSession } from '../auth/session';
import { createTestDb } from '../auth/sqlite-d1';
import type { Env } from '../env';
import { feedbackRoutes, insertFeedback } from './routes';
import { checkFeedback } from './validate';

const MIN = 60_000;
const ORIGIN = 'https://game.test';

let env: Env;
let rows: () => Record<string, unknown>[];
const app = new Hono<{ Bindings: Env }>();
app.route('/api', feedbackRoutes);
app.onError((err, c) => {
  const e = err as { status?: 400 | 403 | 429; toBody?: () => unknown };
  if (e.toBody) return c.json(e.toBody() as object, e.status ?? 400);
  throw err;
});

beforeEach(async () => {
  const t = await createTestDb(['0001_auth.sql', '0002_guests.sql', '0005_feedback.sql']);
  env = t.env as Env;
  rows = () => t.db.prepare('SELECT * FROM feedback ORDER BY id').all() as Record<string, unknown>[];
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  app.request(
    `${ORIGIN}/api/feedback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '1.2.3.4', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  );

const valid = { category: 'idea', message: 'Thêm chế độ 2 vs 2 nhé' };

describe('validation', () => {
  it('trims the message and normalises optional fields', () => {
    const c = checkFeedback({
      category: 'bug',
      message: '  Lỗi\nxuống dòng  ',
      contact: '   ',
      roomCode: 'abc234',
      context: { path: '/r/ABC234', viewport: '390x844', userAgent: 'UA' },
    });
    expect(c).toMatchObject({ message: 'Lỗi\nxuống dòng', contact: null, roomCode: 'ABC234', viewport: '390x844' });
  });

  it.each([
    [{ ...valid, category: 'other' }, 'invalid_category'],
    [{ ...valid, message: ' a ' }, 'invalid_message'],
    [{ ...valid, message: 'x'.repeat(2001) }, 'invalid_message'],
    [{ ...valid, message: 'abc\u0000def' }, 'invalid_message'],
    [{ ...valid, message: 'abc\u202Edef\u0085' }, 'invalid_message'],
    [{ ...valid, message: 5 }, 'invalid_message'],
    [{ ...valid, contact: 'c'.repeat(121) }, 'invalid_contact'],
    [{ ...valid, contact: 'a\nb' }, 'invalid_contact'],
    [{ ...valid, roomCode: 'OOO111' }, 'invalid_room_code'],
    [{ ...valid, context: { path: 'p'.repeat(201) } }, 'invalid_context'],
    [{ ...valid, context: { userAgent: 'u'.repeat(201) } }, 'invalid_context'],
    [{ ...valid, context: { viewport: '390 x 844' } }, 'invalid_context'],
    [{ ...valid, context: 'x' }, 'invalid_context'],
    [[], 'invalid_body'],
  ])('rejects %j', (body, code) => {
    expect(() => checkFeedback(body)).toThrowError(expect.objectContaining({ status: 400, code }));
  });

  it('counts characters, not UTF-16 units, at the limits', () => {
    expect(checkFeedback({ ...valid, message: '😀'.repeat(2000) }).message).toHaveLength(4000);
    expect(checkFeedback({ ...valid, message: 'ơ'.repeat(2) }).message).toBe('ơơ');
  });
});

describe('POST /api/feedback', () => {
  it('stores a valid post with context and no raw address', async () => {
    const res = await post({
      ...valid,
      contact: 'lan@x.vn',
      roomCode: 'ABC234',
      context: { path: '/r/ABC234', viewport: '390x844', userAgent: 'UA/1' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: number };
    expect(body.ok).toBe(true);
    const [row] = rows();
    expect(row).toMatchObject({
      id: body.id,
      category: 'idea',
      message: valid.message,
      contact: 'lan@x.vn',
      user_id: null,
      room_code: 'ABC234',
      path: '/r/ABC234',
      viewport: '390x844',
      user_agent: 'UA/1',
    });
    expect(row!.client_key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('1.2.3.4');
  });

  it('keeps HTML as inert text', async () => {
    await post({ ...valid, message: '<script>alert(1)</script>' });
    expect(rows()[0]!.message).toBe('<script>alert(1)</script>');
  });

  it('answers invalid input with the ApiError shape and stores nothing', async () => {
    const res = await post({ ...valid, message: '' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: 'invalid_message', message: expect.stringContaining('Nội dung') },
    });
    expect((await post('not json')).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('accepts 2000 emoji with the usual context, and every field at its limit in 4-byte characters', async () => {
    const context = { path: '/r/ABC234', viewport: '390x844', userAgent: 'u'.repeat(FEEDBACK_LIMITS.userAgentMax) };
    const emoji = await post({ ...valid, message: '😀'.repeat(FEEDBACK_LIMITS.messageMax), contact: 'lan@x.vn', roomCode: 'ABC234', context });
    expect(emoji.status).toBe(200);
    const widest = await post({
      ...valid,
      message: '😀'.repeat(FEEDBACK_LIMITS.messageMax),
      contact: '😀'.repeat(FEEDBACK_LIMITS.contactMax),
      roomCode: 'ABC234',
      context: { path: '😀'.repeat(FEEDBACK_LIMITS.pathMax), viewport: '99999x99999', userAgent: '😀'.repeat(FEEDBACK_LIMITS.userAgentMax) },
    });
    expect(widest.status).toBe(200);
    expect(rows()).toHaveLength(2);
  });

  it('rejects an oversized body and a foreign origin', async () => {
    const big = await post({ ...valid, contact: 'x'.repeat(FEEDBACK_LIMITS.bodyMaxBytes) });
    expect(big.status).toBe(400);
    expect(((await big.json()) as { error: { code: string } }).error.code).toBe('body_too_large');
    expect((await post(valid, { Origin: 'https://evil.test' })).status).toBe(403);
    expect(rows()).toHaveLength(0);
  });

  it('attaches the signed-in user and ignores an unknown cookie', async () => {
    await env.DB.prepare('INSERT INTO users (id, email, display_name, created_at) VALUES (?, NULL, ?, 0)').bind('u-1', 'Lan').run();
    const cookie = (await createSession(env, 'u-1')).split(';')[0]!;
    await post(valid, { Cookie: cookie });
    await post(valid, { Cookie: 'ca_session=' + 'z'.repeat(43) });
    expect(rows().map((r) => r.user_id)).toEqual(['u-1', null]);
  });

  it('answers the 6th post within 10 minutes with 429 and keeps other clients unaffected', async () => {
    for (let i = 0; i < 5; i++) expect((await post(valid)).status).toBe(200);
    const res = await post(valid);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: 'too_many_feedback', message: expect.stringContaining('quá nhiều') } });
    expect(rows()).toHaveLength(5);
    expect((await post(valid, { 'CF-Connecting-IP': '5.6.7.8' })).status).toBe(200);
  });
});

describe('rate limit windows', () => {
  const clean = checkFeedback(valid);
  const NOW = 100_000_000;

  it('frees the short window after 10 minutes', async () => {
    for (let i = 0; i < 5; i++) await insertFeedback(env, 'k', null, clean, NOW);
    await expect(insertFeedback(env, 'k', null, clean, NOW + 10 * MIN - 1)).rejects.toMatchObject({ status: 429 });
    await expect(insertFeedback(env, 'k', null, clean, NOW + 10 * MIN)).resolves.toBeGreaterThan(0);
  });

  it('caps a client at 30 a day, spread over windows', async () => {
    for (let i = 0; i < 30; i++) await insertFeedback(env, 'k', null, clean, NOW + i * 11 * MIN);
    await expect(insertFeedback(env, 'k', null, clean, NOW + 30 * 11 * MIN)).rejects.toMatchObject({ status: 429 });
    await expect(insertFeedback(env, 'k', null, clean, NOW + 24 * 60 * MIN + 1)).resolves.toBeGreaterThan(0);
  });
});
