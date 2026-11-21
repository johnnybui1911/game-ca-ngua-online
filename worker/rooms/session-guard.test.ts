import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../auth/sqlite-d1';
import { sha256Hex } from '../auth/session';
import { SessionGuard, checkFor, recheckDue, type SocketBinding } from './session-guard';

const INTERVAL = 30_000;
const NOW = 1_000_000;

describe('recheckDue', () => {
  it('is not due before the interval and due exactly at it', () => {
    expect(recheckDue(NOW, NOW, INTERVAL)).toBe(false);
    expect(recheckDue(NOW, NOW + INTERVAL - 1, INTERVAL)).toBe(false);
    expect(recheckDue(NOW, NOW + INTERVAL, INTERVAL)).toBe(true);
  });
});

describe('checkFor', () => {
  const hash = 'a'.repeat(64);

  it('looks a bound socket up by its own session', () => {
    expect(checkFor({ userId: 'u', at: 0, sessionHash: hash })).toEqual({ kind: 'session', hash });
  });

  it('falls back to the user for an attachment written before sessions were bound', () => {
    expect(checkFor({ userId: 'u', at: 0 })).toEqual({ kind: 'user', userId: 'u' });
  });

  it('does not trust a malformed hash', () => {
    for (const bad of ['', 'xyz', 'A'.repeat(64), 'a'.repeat(63)]) {
      expect(checkFor({ userId: 'u', at: 0, sessionHash: bad })).toEqual({ kind: 'user', userId: 'u' });
    }
  });
});

describe('SessionGuard against real SQL', () => {
  let db: D1Database;
  let raw: { exec(sql: string): void };
  let hashA: string;
  let hashB: string;
  const bind = (sessionHash?: string, at = NOW): SocketBinding => ({ userId: 'u1', at, sessionHash });

  beforeEach(async () => {
    const t = await createTestDb(['0001_auth.sql', '0002_guests.sql']);
    db = t.env.DB;
    raw = t.db;
    hashA = await sha256Hex('token-a');
    hashB = await sha256Hex('token-b');
    raw.exec(`INSERT INTO users (id, display_name, created_at) VALUES ('u1', 'Một', 0)`);
    raw.exec(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('${hashA}', 'u1', ${NOW + 10 * INTERVAL})`);
    raw.exec(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('${hashB}', 'u1', ${NOW + 10 * INTERVAL})`);
  });

  it('does not query before the interval has passed, even if the session is gone', async () => {
    const guard = new SessionGuard(db, INTERVAL);
    const ws = {};
    raw.exec(`DELETE FROM sessions WHERE token_hash = '${hashA}'`);
    expect(await guard.hasEnded(ws, bind(hashA), NOW + INTERVAL - 1)).toBe(false);
  });

  it('ends only the socket whose own session was deleted', async () => {
    const guard = new SessionGuard(db, INTERVAL);
    raw.exec(`DELETE FROM sessions WHERE token_hash = '${hashA}'`);
    const later = NOW + INTERVAL;
    expect(await guard.hasEnded({}, bind(hashA), later)).toBe(true);
    expect(await guard.hasEnded({}, bind(hashB), later)).toBe(false);
  });

  it('ends a socket whose session expired', async () => {
    const guard = new SessionGuard(db, INTERVAL);
    raw.exec(`UPDATE sessions SET expires_at = ${NOW + INTERVAL} WHERE token_hash = '${hashA}'`);
    expect(await guard.hasEnded({}, bind(hashA), NOW + INTERVAL)).toBe(true);
    expect(await guard.hasEnded({}, bind(hashB), NOW + INTERVAL)).toBe(false);
  });

  it('checks again only after another interval', async () => {
    const guard = new SessionGuard(db, INTERVAL);
    const ws = {};
    expect(await guard.hasEnded(ws, bind(hashA), NOW + INTERVAL)).toBe(false);
    raw.exec(`DELETE FROM sessions WHERE token_hash = '${hashA}'`);
    expect(await guard.hasEnded(ws, bind(hashA), NOW + INTERVAL + 1)).toBe(false);
    expect(await guard.hasEnded(ws, bind(hashA), NOW + 2 * INTERVAL)).toBe(true);
  });

  it('keeps an old socket without a hash while its user has any live session', async () => {
    const guard = new SessionGuard(db, INTERVAL);
    raw.exec(`DELETE FROM sessions WHERE token_hash = '${hashA}'`);
    expect(await guard.hasEnded({}, bind(undefined), NOW + INTERVAL)).toBe(false);
    raw.exec(`DELETE FROM sessions WHERE token_hash = '${hashB}'`);
    expect(await guard.hasEnded({}, bind(undefined), NOW + INTERVAL)).toBe(true);
  });

  it('ends the sockets of a deleted user, whose sessions cascade away', async () => {
    const guard = new SessionGuard(db, INTERVAL);
    raw.exec('PRAGMA foreign_keys = ON');
    raw.exec(`DELETE FROM users WHERE id = 'u1'`);
    expect(await guard.hasEnded({}, bind(hashA), NOW + INTERVAL)).toBe(true);
  });

  it('treats a failed lookup as live and retries after one interval', async () => {
    let fail = true;
    const flaky = {
      prepare: (sql: string) => {
        if (fail) throw new Error('D1 unavailable');
        return db.prepare(sql);
      },
    } as unknown as D1Database;
    const guard = new SessionGuard(flaky, INTERVAL);
    const ws = {};
    raw.exec(`DELETE FROM sessions WHERE token_hash = '${hashA}'`);
    expect(await guard.hasEnded(ws, bind(hashA), NOW + INTERVAL)).toBe(false);
    fail = false;
    expect(await guard.hasEnded(ws, bind(hashA), NOW + INTERVAL + 1)).toBe(false);
    expect(await guard.hasEnded(ws, bind(hashA), NOW + 2 * INTERVAL)).toBe(true);
  });
});
