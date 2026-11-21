import { SOURCE_COOKIE, dayOf, normalizeSource, type FunnelEvent } from '../../shared/analytics';
import { readCookie } from '../auth/session';
import type { Env } from '../env';

/**
 * Adds one to today's counter for `event` and `source`. Never throws: losing a count
 * must not fail the action being counted.
 */
export async function countEvent(env: Env, event: FunnelEvent, source: string, now = Date.now()): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO daily_events (day, event, source, n) VALUES (?, ?, ?, 1)
       ON CONFLICT (day, event, source) DO UPDATE SET n = n + 1`,
    )
      .bind(dayOf(now), event, source)
      .run();
  } catch (e) {
    console.error('event count failed', event, e);
  }
}

/** The visitor's first-touch source, from the cookie the client set on its first visit. */
export function requestSource(request: Request): string {
  return normalizeSource(readCookie(request, SOURCE_COOKIE));
}
