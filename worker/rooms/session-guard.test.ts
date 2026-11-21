import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../auth/sqlite-d1';
import { sha256Hex } from '../auth/session';
import { SessionGuard, checkFor, endedItems, loadLiveSessions, recheckDue, type SocketBinding } from './session-guard';

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

describe('endedItems', () => {
  const h1 = '1'.repeat(64);
  const h2 = '2'.repeat(64);
  const sockets = [
    { name: 'bound live', b: { userId: 'u1', at: 0, sessionHash: h1 } },
    { name: 'bound gone', b: { userId: 'u1', at: 0, sessionHash: h2 } },
    { name: 'legacy live user', b: { userId: 'u2', at: 0 } },
    { name: 'legacy gone user', b: { userId: 'u3', at: 0 } },
  ];

  it('ends bound sockets by session and legacy sockets by user', () => {
    const live = { hashes: new Set([h1]), userIds: new Set(['u1', 'u2']) };
    expect(endedItems(sockets, (s) => s.b, live).map((s) => s.name)).toEqual(['bound gone', 'legacy gone user']);
  });

  it('a user having some other live session does not keep a bound socket alive', () => {
    const live = { hashes: new Set<string>(), userIds: new Set(['u1']) };
    expect(endedItems([sockets[1]!], (s) => s.b, live)).toHaveLength(1);
  });
});

describe('bulk lookup against real SQL', () => {
  it('finds live sessions and users in one pass, across the per-query limit, and skips expired ones', async () => {
    const t = await createTestDb(['0001_auth.sql', '0002_guests.sql']);
    t.db.exec(`INSERT INTO users (id, display_name, created_at) VALUES ('u1', 'Một', 0), ('u2', 'Hai', 0)`);
    const bindings: SocketBinding[] = [];
    for (let i = 0; i < 200; i++) {
      const hash = i.toString(16).padStart(64, '0');
      const expires = i === 7 ? NOW : NOW + 1; // index 7 expires exactly now: not live
      t.db.exec(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('${hash}', 'u1', ${expires})`);
      bindings.push({ userId: 'u1', at: 0, sessionHash: hash });
    }
    bindings.push({ userId: 'u2', at: 0 }, { userId: 'u1', at: 0 });
    const live = await loadLiveSessions(t.env.DB, bindings, NOW);
    expect(live.hashes.size).toBe(199);
    expect(live.hashes.has((7).toString(16).padStart(64, '0'))).toBe(false);
    expect(live.userIds.has('u1')).toBe(true);
    expect(live.userIds.has('u2')).toBe(false);
  });

  it('endedAmong sweeps at most once per sweep interval and treats an error as live', async () => {
    const t = await createTestDb(['0001_auth.sql', '0002_guests.sql']);
    const guard = new SessionGuard(t.env.DB, INTERVAL);
    const gone = [{ userId: 'u9', at: 0, sessionHash: 'f'.repeat(64) }];
    expect(await guard.endedAmong(gone, (b) => b, NOW)).toHaveLength(1);
    expect(await guard.endedAmong(gone, (b) => b, NOW + INTERVAL - 1)).toEqual([]);
    expect(await guard.endedAmong(gone, (b) => b, NOW + INTERVAL)).toHaveLength(1);
    const broken = new SessionGuard({ prepare: () => { throw new Error('down'); } } as unknown as D1Database, INTERVAL);
    expect(await broken.endedAmong(gone, (b) => b, NOW)).toEqual([]);
  });
});
