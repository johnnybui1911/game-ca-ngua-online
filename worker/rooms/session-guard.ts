import { sessionIsLive, type SessionCheck } from '../auth/session';

/** What a Durable Object keeps on a socket to find its session again. Old sockets carry no hash. */
export interface SocketBinding {
  userId: string;
  /** Connection time; the first recheck is due this long after it. */
  at: number;
  sessionHash?: string;
}

const HASH = /^[0-9a-f]{64}$/;

/**
 * The lookup for a socket. A socket opened before sessions were bound carries no hash; it is
 * checked by user, so a deploy never drops a signed-in player, and it ends once the user has no
 * live session at all. Sockets opened afterwards are checked by their own session.
 */
export function checkFor(binding: SocketBinding): SessionCheck {
  const hash = binding.sessionHash;
  return typeof hash === 'string' && HASH.test(hash) ? { kind: 'session', hash } : { kind: 'user', userId: binding.userId };
}

/** Which sessions, and which users (for old sockets), have a live session right now. */
export interface LiveSessions {
  hashes: ReadonlySet<string>;
  userIds: ReadonlySet<string>;
}

/** The items whose session is gone, given what is live. Pure; the lookup is `loadLiveSessions`. */
export function endedItems<T>(items: readonly T[], bindingOf: (item: T) => SocketBinding, live: LiveSessions): T[] {
  return items.filter((item) => {
    const check = checkFor(bindingOf(item));
    return check.kind === 'session' ? !live.hashes.has(check.hash) : !live.userIds.has(check.userId);
  });
}

/** The sockets of one session; a user's other sessions are left alone. */
export function itemsOfSession<T>(items: readonly T[], hashOf: (item: T) => string | undefined, sessionHash: string): T[] {
  return items.filter((item) => hashOf(item) === sessionHash);
}

/** D1 allows 100 bound values per statement; one is the expiry time. */
const IDENTIFIERS_PER_QUERY = 90;

/** One query per 90 distinct sessions or users, however many sockets share them. */
export async function loadLiveSessions(db: D1Database, bindings: readonly SocketBinding[], now: number): Promise<LiveSessions> {
  const hashes = new Set<string>();
  const userIds = new Set<string>();
  const wanted = new Set<string>();
  for (const binding of bindings) {
    const check = checkFor(binding);
    wanted.add(check.kind === 'session' ? `h${check.hash}` : `u${check.userId}`);
  }
  const all = [...wanted];
  for (let i = 0; i < all.length; i += IDENTIFIERS_PER_QUERY) {
    const chunk = all.slice(i, i + IDENTIFIERS_PER_QUERY);
    const hs = chunk.filter((k) => k[0] === 'h').map((k) => k.slice(1));
    const us = chunk.filter((k) => k[0] === 'u').map((k) => k.slice(1));
    const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');
    const conditions = [hs.length ? `token_hash IN (${marks(hs.length)})` : '', us.length ? `user_id IN (${marks(us.length)})` : ''].filter(Boolean);
    const { results } = await db
      .prepare(`SELECT token_hash AS hash, user_id AS userId FROM sessions WHERE expires_at > ? AND (${conditions.join(' OR ')})`)
      .bind(now, ...hs, ...us)
      .all<{ hash: string; userId: string }>();
    for (const row of results) {
      hashes.add(row.hash);
      userIds.add(row.userId);
    }
  }
  return { hashes, userIds };
}

export function recheckDue(lastCheckedAt: number, now: number, intervalMs: number): boolean {
  return now - lastCheckedAt >= intervalMs;
}

/**
 * Decides when a socket's session is looked up again. The last lookup time lives in memory: a
 * socket woken from hibernation falls back to its connection time, so the first message after a
 * long sleep is checked, and no per-message storage write is needed.
 */
export class SessionGuard {
  private readonly lastChecked = new WeakMap<object, number>();

  private lastSweep = 0;

  /** `sweepMs` is how often `endedAmong` actually queries; `intervalMs` is the per-socket recheck. */
  constructor(
    private readonly db: D1Database,
    private readonly intervalMs: number,
    private readonly sweepMs: number = intervalMs,
  ) {}

  /**
   * For an object's alarm: the items whose session has ended, looked up in bulk and at most once
   * per sweep interval. A failed lookup says nothing, so it ends nobody and is retried next time.
   */
  async endedAmong<T>(items: readonly T[], bindingOf: (item: T) => SocketBinding, now: number): Promise<T[]> {
    if (items.length === 0 || !recheckDue(this.lastSweep, now, this.sweepMs)) return [];
    this.lastSweep = now;
    try {
      return endedItems(items, bindingOf, await loadLiveSessions(this.db, items.map(bindingOf), now));
    } catch {
      return [];
    }
  }

  /** True when the socket's session is gone. A failed lookup says nothing, so it counts as live and is retried after one interval. */
  async hasEnded(ws: object, binding: SocketBinding, now: number): Promise<boolean> {
    const last = this.lastChecked.get(ws) ?? binding.at;
    if (!recheckDue(last, now, this.intervalMs)) return false;
    this.lastChecked.set(ws, now);
    try {
      return !(await sessionIsLive(this.db, checkFor(binding), now));
    } catch {
      return false;
    }
  }
}
