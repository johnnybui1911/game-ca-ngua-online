import { describe, expect, it } from 'vitest';
import { DEFAULT_GUEST_LIMIT, addressKey, guestLimit } from './guest';

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

describe('addressKey', () => {
  it('keeps an IPv4 address whole', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
    expect(addressKey('203.0.113.8')).not.toBe(addressKey('203.0.113.7'));
  });

  it('counts every IPv6 address of one /64 as the same client', () => {
    const a = addressKey('2001:db8:12:3400:1111:2222:3333:4444');
    expect(addressKey('2001:db8:12:3400:ffff:0:0:1')).toBe(a);
    expect(addressKey('2001:0DB8:0012:3400::1')).toBe(a);
    expect(addressKey('2001:db8:12:3401::1')).not.toBe(a);
  });

  it('expands a compressed prefix before cutting it', () => {
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0');
    expect(addressKey('::1')).toBe('0:0:0:0');
    expect(addressKey('2001:db8:0:0:5::')).toBe('2001:db8:0:0');
  });

  it('uses one shared key when the request carries no address', () => {
    expect(addressKey(null)).toBe(addressKey(''));
  });
});
