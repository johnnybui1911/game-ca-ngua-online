import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import { allowSummaryLookup, resetSummaryLimitWarning, summaryLimitBody, summaryLimitKey } from './summary-limit';

function fakeLimiter(limit: number) {
  const counts = new Map<string, number>();
  const calls: string[] = [];
  return {
    calls,
    binding: {
      async limit({ key }: { key: string }) {
        calls.push(key);
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        return { success: n <= limit };
      },
    },
  };
}

const asEnv = (binding?: unknown) => ({ ROOM_SUMMARY_LIMITER: binding }) as unknown as Env;
const from = (ip?: string) => new Request('https://x.test/api/rooms/ABC234', ip ? { headers: { 'CF-Connecting-IP': ip } } : {});

afterEach(() => {
  vi.restoreAllMocks();
  resetSummaryLimitWarning();
});

describe('summaryLimitKey', () => {
  it('is prefixed with the route and keeps an IPv4 address whole', () => {
    expect(summaryLimitKey('203.0.113.7')).toBe('room-summary:203.0.113.7');
  });

  it('counts a whole IPv6 /64 as one client', () => {
    expect(summaryLimitKey('2001:db8:12:3400:1::1')).toBe(summaryLimitKey('2001:DB8:12:3400::ffff'));
    expect(summaryLimitKey('2001:db8:12:3401::1')).not.toBe(summaryLimitKey('2001:db8:12:3400::1'));
  });
});

describe('allowSummaryLookup', () => {
  it('allows until the binding refuses, per address', async () => {
    const { binding, calls } = fakeLimiter(2);
    const env = asEnv(binding);
    expect(await allowSummaryLookup(env, from('203.0.113.7'))).toBe(true);
    expect(await allowSummaryLookup(env, from('203.0.113.7'))).toBe(true);
    expect(await allowSummaryLookup(env, from('203.0.113.7'))).toBe(false);
    expect(await allowSummaryLookup(env, from('203.0.113.8'))).toBe(true);
    expect(calls).toEqual(Array.from({ length: 3 }, () => 'room-summary:203.0.113.7').concat('room-summary:203.0.113.8'));
  });

  it('fails open and warns once when the binding is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await allowSummaryLookup(asEnv(), from('203.0.113.7'))).toBe(true);
    expect(await allowSummaryLookup(asEnv(), from('203.0.113.7'))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('fails open and warns once when the binding throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = asEnv({
      async limit() {
        throw new Error('limiter down');
      },
    });
    expect(await allowSummaryLookup(env, from('203.0.113.7'))).toBe(true);
    expect(await allowSummaryLookup(env, from('203.0.113.7'))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('skips the limiter entirely when ROOM_SUMMARY_LIMIT_OFF is 1', async () => {
    const { binding, calls } = fakeLimiter(0);
    const env = { ROOM_SUMMARY_LIMITER: binding, ROOM_SUMMARY_LIMIT_OFF: '1' } as unknown as Env;
    expect(await allowSummaryLookup(env, from('203.0.113.7'))).toBe(true);
    expect(calls).toEqual([]);
    const other = { ROOM_SUMMARY_LIMITER: binding, ROOM_SUMMARY_LIMIT_OFF: '0' } as unknown as Env;
    expect(await allowSummaryLookup(other, from('203.0.113.7'))).toBe(false);
  });

  it('does not count a request that carries no client address', async () => {
    const { binding, calls } = fakeLimiter(0);
    expect(await allowSummaryLookup(asEnv(binding), from())).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('summaryLimitBody', () => {
  it('uses the error envelope with the agreed code and message', () => {
    expect(summaryLimitBody).toEqual({
      error: { code: 'too_many_requests', message: 'Bạn tra cứu phòng quá nhanh, vui lòng thử lại sau ít phút.' },
    });
  });
});
