import type { MeUser, PublicUser } from '../../shared/protocol';
import type { Env } from '../env';
import { toBase64 } from './password';

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
  ]);
  return cookieHeader(SESSION_COOKIE, token, { maxAge: SESSION_SECONDS });
}

/** Deletes the session named by the request cookie and returns the cookie-clearing header. */
export async function destroySession(request: Request, env: Env): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (plausibleToken(token)) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  }
  return cookieHeader(SESSION_COOKIE, '', { maxAge: 0 });
}

/** The signed-in user for an HTTP request or WebSocket upgrade, or null. */
export async function getSessionUser(request: Request, env: Env): Promise<PublicUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!plausibleToken(token)) return null;
  const row = await env.DB.prepare(
    `SELECT u.id AS id, u.display_name AS displayName
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<PublicUser>();
  return row ?? null;
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
  return row ? { id: row.id, displayName: row.displayName, guest: row.guest === 1 } : null;
}
