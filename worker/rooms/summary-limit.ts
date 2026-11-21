import type { ApiError } from '../../shared/protocol';
import { addressKey } from '../auth/guest';
import type { Env } from '../env';

export const SUMMARY_LIMIT_CODE = 'too_many_requests';
export const SUMMARY_LIMIT_MESSAGE = 'Bạn tra cứu phòng quá nhanh, vui lòng thử lại sau ít phút.';

/** Body of the 429 answer, in the shape every other API error uses. */
export const summaryLimitBody: ApiError = { error: { code: SUMMARY_LIMIT_CODE, message: SUMMARY_LIMIT_MESSAGE } };

const warned = new Set<string>();

function warnOnce(kind: string, message: string): void {
  if (warned.has(kind)) return;
  warned.add(kind);
  console.warn(message);
}

/**
 * Whether this request may look up a room summary. The check runs before the room
 * Durable Object is touched, so a refused lookup costs no Durable Object request.
 *
 * Fails open (the lookup is allowed) when the limiter cannot decide: the binding is
 * missing or `limit()` throws. Each case is logged once, so an outage of the limiter
 * does not take room entry down with it.
 *
 * A request without CF-Connecting-IP is not counted: Cloudflare's edge always sets
 * that header for Workers, so its absence means there is no client to attribute the
 * request to. Local dev is different: Miniflare fills the header from the socket
 * address, so all local traffic counts under one key such as 127.0.0.1. The e2e
 * suite runs from one address and can exceed the limit, so it sets
 * ROOM_SUMMARY_LIMIT_OFF=1 (local `.dev.vars.<env>` only; never set in production).
 */
export async function allowSummaryLookup(env: Env, request: Request): Promise<boolean> {
  if (env.ROOM_SUMMARY_LIMIT_OFF === '1') return true;
  const address = request.headers.get('CF-Connecting-IP');
  if (!address) return true;
  const limiter = env.ROOM_SUMMARY_LIMITER;
  if (!limiter) {
    warnOnce('missing', 'ROOM_SUMMARY_LIMITER binding is missing; room summary lookups are not rate limited.');
    return true;
  }
  try {
    const { success } = await limiter.limit({ key: summaryLimitKey(address) });
    return success;
  } catch (err) {
    warnOnce('failed', `ROOM_SUMMARY_LIMITER failed; allowing the lookup. ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }
}

/** One counter per client: an IPv6 /64 counts as a single client, like the guest limit. */
export function summaryLimitKey(address: string): string {
  return `room-summary:${addressKey(address)}`;
}

/** Test-only: forget that the missing-binding warning was logged. */
export function resetSummaryLimitWarning(): void {
  warned.clear();
}
