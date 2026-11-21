import type { MeUser, PublicUser } from '../../shared/protocol';
import type { Env } from '../env';
import { toBase64 } from './password';
import { displayNameFromProfile } from './validate';

export const SESSION_COOKIE = 'ca_session';
const SESSION_SECONDS = 30 * 24 * 60 * 60;

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function cookieHeader(
  name: string,
  value: string,
  opts: { maxAge: number; path?: string },
): string {
  return `${name}=${value}; Max-Age=${opts.maxAge}; Path=${opts.path ?? '/'}; HttpOnly; Secure; SameSite=Lax`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function base64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Validates the token's shape cheaply before hashing; it came from a cookie. */
function plausibleToken(token: string | null): token is string {
  return !!token && token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token);
}

/** Live sessions kept per user; the oldest beyond this are deleted when a new one is created. */
export const DEFAULT_SESSION_CAP = 10;

/** The per-user session cap: the optional env override when it is a positive integer, else the default. */
export function sessionCap(raw: string | undefined): number {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_SESSION_CAP;
}

/** Stores a new session and returns the `Set-Cookie` value that carries its token. */
export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(
      await sha256Hex(token),
      userId,
      now + SESSION_SECONDS * 1000,
    ),
    env.DB.prepare(
      `DELETE FROM sessions WHERE user_id = ?1 AND token_hash NOT IN (
         SELECT token_hash FROM sessions WHERE user_id = ?1 ORDER BY expires_at DESC, rowid DESC LIMIT ?2)`,
    ).bind(userId, sessionCap(env.SESSIONS_PER_USER)),
  ]);
  return cookieHeader(SESSION_COOKIE, token, { maxAge: SESSION_SECONDS });
}

/**
 * Deletes the session named by the request cookie. Returns the cookie-clearing header and the
 * hash of the session that was named (null when the cookie held none), so the caller can end
 * the sockets that were opened under it.
 */
export async function destroySession(
  request: Request,
  env: Env,
): Promise<{ cookie: string; sessionHash: string | null }> {
  const token = readCookie(request, SESSION_COOKIE);
  let sessionHash: string | null = null;
  if (plausibleToken(token)) {
    sessionHash = await sha256Hex(token);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(sessionHash).run();
  }
  return { cookie: cookieHeader(SESSION_COOKIE, '', { maxAge: 0 }), sessionHash };
}

/** How a socket's session is looked up again: by its own token hash, or (older sockets) by user. */
export type SessionCheck = { kind: 'session'; hash: string } | { kind: 'user'; userId: string };

/** True while the session (or, for a user check, any session of that user) exists and has not expired. */
export async function sessionIsLive(db: D1Database, check: SessionCheck, now: number): Promise<boolean> {
  const row =
    check.kind === 'session'
      ? await db.prepare('SELECT 1 AS live FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(check.hash, now).first()
      : await db.prepare('SELECT 1 AS live FROM sessions WHERE user_id = ? AND expires_at > ? LIMIT 1').bind(check.userId, now).first();
  return row !== null;
}

/** A signed-in user together with the hash of the session that proves it. The hash never leaves the server. */
export interface SessionIdentity {
  user: PublicUser;
  sessionHash: string;
}

/**
 * The signed-in user for an HTTP request or WebSocket upgrade, or null. The stored name goes
 * through the current name cleaner, so names saved under an older, looser rule display cleanly.
 */
export async function getSessionUser(request: Request, env: Env): Promise<PublicUser | null> {
  return (await getSessionIdentity(request, env))?.user ?? null;
}

/** Like `getSessionUser`, plus the session's token hash for binding a WebSocket to it. */
export async function getSessionIdentity(request: Request, env: Env): Promise<SessionIdentity | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!plausibleToken(token)) return null;
  const sessionHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id AS id, u.display_name AS displayName
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(sessionHash, Date.now())
    .first<PublicUser>();
  return row ? { user: { id: row.id, displayName: displayNameFromProfile(row.displayName) }, sessionHash } : null;
}

/** The session's user including whether it is a guest, or null. Used by account routes only. */
export async function getSessionAccount(request: Request, env: Env): Promise<MeUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!plausibleToken(token)) return null;
  const row = await env.DB.prepare(
    `SELECT u.id AS id, u.display_name AS displayName, u.is_guest AS guest
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<{ id: string; displayName: string; guest: number }>();
  return row ? { id: row.id, displayName: displayNameFromProfile(row.displayName), guest: row.guest === 1 } : null;
}
