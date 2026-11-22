import { Hono } from 'hono';
import { FEEDBACK_LIMITS, type FeedbackResponse } from '../../shared/feedback';
import { HttpError } from '../auth/errors';
import { addressKey } from '../auth/guest';
import { requireSameOrigin } from '../auth/routes';
import { getSessionUser, sha256Hex } from '../auth/session';
import type { Env } from '../env';
import { checkFeedback, type CleanFeedback } from './validate';

export const tooManyFeedback = () =>
  new HttpError(429, 'too_many_feedback', 'Bạn đã gửi góp ý quá nhiều lần. Vui lòng thử lại sau ít phút.');

/** Hash of the client address key (an IPv6 /64 counts as one); the address itself is never stored. */
export const feedbackClientKey = (request: Request) =>
  sha256Hex(`feedback:${addressKey(request.headers.get('CF-Connecting-IP'))}`);

/**
 * Stores one feedback row unless the client already posted `perWindow` within `windowMs` or `perDay`
 * within a day. Counting and inserting are one statement, so concurrent posts cannot overshoot.
 * Returns the new row id.
 */
export async function insertFeedback(
  env: Env,
  clientKey: string,
  userId: string | null,
  f: CleanFeedback,
  now = Date.now(),
): Promise<number> {
  const { perWindow, windowMs, perDay, dayMs } = FEEDBACK_LIMITS;
  const result = await env.DB.prepare(
    `INSERT INTO feedback (created_at, category, message, contact, user_id, room_code, path, viewport, user_agent, client_key)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
      WHERE (SELECT COUNT(*) FROM feedback WHERE client_key = ?10 AND created_at > ?11) < ?12
        AND (SELECT COUNT(*) FROM feedback WHERE client_key = ?10 AND created_at > ?13) < ?14`,
  )
    .bind(
      now,
      f.category,
      f.message,
      f.contact,
      userId,
      f.roomCode,
      f.path,
      f.viewport,
      f.userAgent,
      clientKey,
      now - windowMs,
      perWindow,
      now - dayMs,
      perDay,
    )
    .run();
  if (!result.meta.changes) throw tooManyFeedback();
  return result.meta.last_row_id;
}

async function readBody(request: Request): Promise<unknown> {
  const max = FEEDBACK_LIMITS.bodyMaxBytes;
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > max) throw tooLarge();
  const text = await request.text();
  if (new TextEncoder().encode(text).length > max) throw tooLarge();
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_body', 'Yêu cầu không hợp lệ.');
  }
}

const tooLarge = () => new HttpError(400, 'body_too_large', 'Góp ý quá dài.');

export const feedbackRoutes = new Hono<{ Bindings: Env }>();

/** Body `FeedbackRequest`. Plain text: stored and returned as given, never rendered as HTML here. */
feedbackRoutes.post('/feedback', requireSameOrigin, async (c) => {
  const clean = checkFeedback(await readBody(c.req.raw));
  const user = await getSessionUser(c.req.raw, c.env);
  const id = await insertFeedback(c.env, await feedbackClientKey(c.req.raw), user?.id ?? null, clean);
  return c.json<FeedbackResponse>({ ok: true, id });
});
