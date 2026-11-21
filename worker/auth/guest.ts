import type { Env } from '../env';
import { HttpError } from './errors';
import { sha256Hex } from './session';

/** Sized for shared addresses (carrier NAT, school or office networks), where many real players arrive from one IP. */
export const DEFAULT_GUEST_LIMIT = 100;
export const GUEST_WINDOW_MS = 60 * 60 * 1000;
/** Most abandoned guests removed by one creation, so no request does unbounded work. */
const CLEANUP_BATCH = 50;
/** A guest younger than this is never cleaned up: its session may still be being created. */
const CLEANUP_GRACE_MS = 60 * 60 * 1000;
/** Address key used when the request carries no client address (local dev). */
const NO_ADDRESS = 'no-address';

/** The per-address creation limit: the optional env override when it is a positive integer, else the default. */
export function guestLimit(raw: string | undefined): number {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_GUEST_LIMIT;
}

/** Start of the sliding window that ends at `now`. */
export const windowStart = (now: number) => now - GUEST_WINDOW_MS;

/**
 * The unit the creation limit applies to. An IPv6 subscriber usually controls a whole
 * /64, so every address in it counts as one; an IPv4 address counts as itself.
 */
export function addressKey(address: string | null): string {
  if (!address) return NO_ADDRESS;
  if (!address.includes(':')) return address;
  const [head = '', tail = ''] = address.toLowerCase().split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === '' ? [] : tail.split(':');
  const groups = address.includes('::')
    ? [...left, ...new Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  return groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':');
}

/**
 * Records one guest creation for the request's address unless the address already made
 * `limit` of them within the window. Counting and inserting are one statement, so
 * concurrent requests cannot overshoot. Only a hash of the address key is stored.
 */
export async function claimGuestSlot(env: Env, request: Request, now = Date.now()): Promise<void> {
  const addr = await sha256Hex(`guest-limit:${addressKey(request.headers.get('CF-Connecting-IP'))}`);
  const limit = guestLimit(env.GUEST_LIMIT_PER_HOUR);
  const [, claimed] = await env.DB.batch([
    env.DB.prepare('DELETE FROM guest_creations WHERE created_at <= ?').bind(windowStart(now)),
    env.DB.prepare(
      `INSERT INTO guest_creations (addr_hash, created_at)
       SELECT ?1, ?2 WHERE (SELECT COUNT(*) FROM guest_creations WHERE addr_hash = ?1 AND created_at > ?3) < ?4`,
    ).bind(addr, now, windowStart(now), limit),
  ]);
  if (!claimed?.meta.changes) {
    throw new HttpError(429, 'too_many_guests', 'Bạn đã tạo quá nhiều tài khoản khách. Vui lòng thử lại sau.');
  }
}

/** Creates a guest user (no email, no password) and returns its id. */
export async function createGuest(env: Env, displayName: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM users WHERE id IN (
         SELECT u.id FROM users u
          WHERE u.is_guest = 1
            AND u.created_at < ?
            AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?)
          LIMIT ${CLEANUP_BATCH})`,
    ).bind(Date.now() - CLEANUP_GRACE_MS, Date.now()),
    env.DB.prepare(
      'INSERT INTO users (id, email, display_name, password_hash, created_at, is_guest) VALUES (?, NULL, ?, NULL, ?, 1)',
    ).bind(id, displayName, Date.now()),
  ]);
  return id;
}

/**
 * Deletes a guest user (sessions and links cascade). Does nothing for a registered user.
 * Never throws: a guest left behind is removed later by the cleanup in `createGuest`.
 */
export async function deleteGuest(env: Env, userId: string): Promise<void> {
  try {
    await env.DB.prepare('DELETE FROM users WHERE id = ? AND is_guest = 1').bind(userId).run();
  } catch (e) {
    console.error('guest delete failed', e);
  }
}
