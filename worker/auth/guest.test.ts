import { describe, expect, it } from 'vitest';
import { DEFAULT_GUEST_LIMIT, GUEST_WINDOW_MS, guestLimit, windowStart } from './guest';

describe('guestLimit', () => {
  it('uses the default when unset or not a positive integer', () => {
    expect(guestLimit(undefined)).toBe(DEFAULT_GUEST_LIMIT);
    for (const bad of ['', 'abc', '0', '-3', '2.5']) expect(guestLimit(bad)).toBe(DEFAULT_GUEST_LIMIT);
  });

  it('honours a positive integer override', () => {
    expect(guestLimit('4')).toBe(4);
    expect(guestLimit('1000')).toBe(1000);
  });
});

describe('windowStart', () => {
  it('excludes creations older than one hour and keeps newer ones', () => {
    const now = 10 * GUEST_WINDOW_MS;
    const counted = (createdAt: number) => createdAt > windowStart(now);
    expect(counted(now - GUEST_WINDOW_MS)).toBe(false);
    expect(counted(now - GUEST_WINDOW_MS + 1)).toBe(true);
    expect(counted(now)).toBe(true);
  });
});
