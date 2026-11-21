import { describe, expect, it } from 'vitest';
import { HOST_ACTION_BURST, HOST_ACTION_REFILL_PER_SEC } from './constants';
import { KeyedTokenBuckets, TokenBucket } from './token-bucket';

describe('TokenBucket', () => {
  it('allows a burst up to capacity, then refuses', () => {
    const b = new TokenBucket(3, 1, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
  });

  it('refills over time but never beyond capacity', () => {
    const b = new TokenBucket(2, 2, 0);
    b.take(0);
    b.take(0);
    expect(b.take(0)).toBe(false);
    expect(b.take(500)).toBe(true);
    expect(b.take(500)).toBe(false);
    expect([b.take(60_000), b.take(60_000), b.take(60_000)]).toEqual([true, true, false]);
  });

  it('sustains a steady rate at the refill rate', () => {
    const b = new TokenBucket(5, 50, 0);
    for (let t = 0; t < 10_000; t += 20) expect(b.take(t)).toBe(true);
  });
});

describe('KeyedTokenBuckets', () => {
  it('keeps a separate budget per key', () => {
    const b = new KeyedTokenBuckets(1, 0);
    expect([b.take('a', 0), b.take('a', 0), b.take('b', 0)]).toEqual([true, false, true]);
  });

  it('allows the burst, then about the refill rate, as the host budget does', () => {
    const b = new KeyedTokenBuckets(HOST_ACTION_BURST, HOST_ACTION_REFILL_PER_SEC);
    const burst = Array.from({ length: HOST_ACTION_BURST + 1 }, () => b.take('host', 0));
    expect(burst).toEqual([...Array(HOST_ACTION_BURST).fill(true), false]);
    expect(b.take('host', 500)).toBe(true);
    expect(b.take('host', 500)).toBe(false);
  });
});
