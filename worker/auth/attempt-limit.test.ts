import { describe, expect, it } from 'vitest';
import {
  POLICIES,
  attemptKeyHash,
  attemptWindowStart,
  clientKey,
  limitFromEnv,
} from './attempt-limit';
import { DEFAULT_SESSION_CAP, sessionCap } from './session';

describe('limitFromEnv', () => {
  it('accepts positive integers only', () => {
    expect(limitFromEnv('7', 10)).toBe(7);
    for (const bad of [undefined, '', '0', '-3', '2.5', 'abc', 'Infinity']) {
      expect(limitFromEnv(bad, 10)).toBe(10);
    }
  });
});

describe('sessionCap', () => {
  it('defaults to 10 and honours a valid override', () => {
    expect(sessionCap(undefined)).toBe(DEFAULT_SESSION_CAP);
    expect(DEFAULT_SESSION_CAP).toBe(10);
    expect(sessionCap('3')).toBe(3);
    expect(sessionCap('0')).toBe(DEFAULT_SESSION_CAP);
  });
});

describe('windows', () => {
  it('sign-in looks back 15 minutes and sign-up one hour', () => {
    expect(attemptWindowStart('signin-email', 1_000_000)).toBe(1_000_000 - 15 * 60_000);
    expect(attemptWindowStart('signin-addr', 1_000_000)).toBe(1_000_000 - 15 * 60_000);
    expect(attemptWindowStart('signup-addr', 10_000_000)).toBe(10_000_000 - 60 * 60_000);
  });

  it('defaults match the documented limits', () => {
    expect(POLICIES['signin-email'].defaultLimit).toBe(10);
    expect(POLICIES['signin-addr'].defaultLimit).toBe(50);
    expect(POLICIES['signup-addr'].defaultLimit).toBe(20);
  });
});

describe('attemptKeyHash', () => {
  it('is stable, hides the subject and separates kinds', async () => {
    const a = await attemptKeyHash('signin-email', 'a@b.vn');
    expect(a).toBe(await attemptKeyHash('signin-email', 'a@b.vn'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('a@b.vn');
    expect(a).not.toBe(await attemptKeyHash('signin-addr', 'a@b.vn'));
    expect(a).not.toBe(await attemptKeyHash('signin-email', 'c@b.vn'));
  });
});

describe('clientKey', () => {
  const req = (ip?: string) => new Request('https://x.test/', ip ? { headers: { 'CF-Connecting-IP': ip } } : {});

  it('uses the address, folds IPv6 to its /64 and tolerates a missing header', () => {
    expect(clientKey(req('203.0.113.9'))).toBe('203.0.113.9');
    expect(clientKey(req('2001:db8:1:2:aaaa::1'))).toBe(clientKey(req('2001:db8:1:2:bbbb::2')));
    expect(clientKey(req('2001:db8:1:2::1'))).not.toBe(clientKey(req('2001:db8:1:3::1')));
    expect(clientKey(req())).toBe('no-address');
  });
});
