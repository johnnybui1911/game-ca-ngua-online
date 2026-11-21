import type { ApiError } from '../../shared/protocol';
import { addressKey } from '../auth/guest';
import type { Env } from '../env';

export const SUMMARY_LIMIT_CODE = 'too_many_requests';
export const SUMMARY_LIMIT_MESSAGE = 'Bạn tra cứu phòng quá nhanh, vui lòng thử lại sau ít phút.';

/** Body of the 429 answer, in the shape every other API error uses. */
export const summaryLimitBody: ApiError = { error: { code: SUMMARY_LIMIT_CODE, message: SUMMARY_LIMIT_MESSAGE } };

let warnedMissingBinding = false;

/**
 * Whether this request may look up a room summary. The check runs before the room
 * Durable Object is touched, so a refused lookup costs no Durable Object request.
 *
 * Requests without CF-Connecting-IP never crossed Cloudflare's edge (local dev, e2e),
 * so there is no client to count; they pass instead of sharing one key. A missing
 * binding also passes (logged once): a misconfigured deployment keeps working.
 */
export async function allowSummaryLookup(env: Env, request: Request): Promise<boolean> {
  const address = request.headers.get('CF-Connecting-IP');
  if (!address) return true;
  const limiter = env.ROOM_SUMMARY_LIMITER;
  if (!limiter) {
    if (!warnedMissingBinding) {
      warnedMissingBinding = true;
      console.warn('ROOM_SUMMARY_LIMITER binding is missing; room summary lookups are not rate limited.');
    }
    return true;
  }
  const { success } = await limiter.limit({ key: summaryLimitKey(address) });
  return success;
}

/** One counter per client: an IPv6 /64 counts as a single client, like the guest limit. */
export function summaryLimitKey(address: string): string {
  return `room-summary:${addressKey(address)}`;
}

/** Test-only: forget that the missing-binding warning was logged. */
export function resetSummaryLimitWarning(): void {
  warnedMissingBinding = false;
}
