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

  constructor(
    private readonly db: D1Database,
    private readonly intervalMs: number,
  ) {}

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
