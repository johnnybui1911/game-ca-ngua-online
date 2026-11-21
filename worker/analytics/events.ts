import { Hono } from 'hono';
import { isClientEvent, normalizeSource } from '../../shared/analytics';
import type { ApiError } from '../../shared/protocol';
import { addressKey } from '../auth/guest';
import { requireSameOrigin } from '../auth/routes';
import type { Env } from '../env';
import { TokenBucket } from '../rooms/token-bucket';
import { countEvent, requestSource } from './count';

/** Browser reports per address: a burst of 20, then one every 10 seconds. Per isolate, so a soft cap. */
const BURST = 20;
const REFILL_PER_SEC = 0.1;
/** Most addresses tracked at once; past this the map starts over rather than grow without bound. */
const MAX_TRACKED = 10_000;
const buckets = new Map<string, TokenBucket>();

function allow(address: string, now: number): boolean {
  let bucket = buckets.get(address);
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED) buckets.clear();
    bucket = new TokenBucket(BURST, REFILL_PER_SEC, now);
    buckets.set(address, bucket);
  }
  return bucket.take(now);
}

export const eventRoutes = new Hono<{ Bindings: Env }>();

/**
 * Body `{ event, source? }`. `source` is the visit's own `utm_source`; without it the
 * first-touch cookie decides. Only the client events in `CLIENT_EVENTS` are accepted.
 */
eventRoutes.post('/events', requireSameOrigin, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = null;
  }
  const { event, source } = (body ?? {}) as { event?: unknown; source?: unknown };
  if (!isClientEvent(event)) {
    return c.json<ApiError>({ error: { code: 'bad_event', message: 'Sự kiện không hợp lệ.' } }, 400);
  }
  const now = Date.now();
  if (!allow(addressKey(c.req.header('CF-Connecting-IP') ?? null), now)) {
    return c.json<ApiError>({ error: { code: 'rate_limited', message: 'Thử lại sau.' } }, 429);
  }
  const counted = typeof source === 'string' ? normalizeSource(source) : requestSource(c.req.raw);
  await countEvent(c.env, event, counted, now);
  return c.body(null, 204);
});
