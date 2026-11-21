import type { Env } from '../env';
import { HttpError } from './errors';
import { sha256Hex } from './session';

export const DEFAULT_GUEST_LIMIT = 10;
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
 * Records one guest creation for the request's address unless the address already made
 * `limit` of them within the window. Counting and inserting are one statement, so
 * concurrent requests cannot overshoot. Only a hash of the address is stored.
 */
export async function claimGuestSlot(env: Env, request: Request, now = Date.now()): Promise<void> {
  const addr = await sha256Hex(`guest-limit:${request.headers.get('CF-Connecting-IP') ?? NO_ADDRESS}`);
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

/** Deletes a guest user (sessions and links cascade). Does nothing for a registered user. */
export async function deleteGuest(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM users WHERE id = ? AND is_guest = 1').bind(userId).run();
}
