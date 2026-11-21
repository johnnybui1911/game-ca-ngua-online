import { describe, expect, it } from 'vitest';
import { EMOTE_BURST, EMOTE_REFILL_PER_SEC, SOCKET_BURST, SOCKET_REFILL_PER_SEC } from './constants';
import { KeyedTokenBuckets } from './token-bucket';

const make = () => new KeyedTokenBuckets(EMOTE_BURST, EMOTE_REFILL_PER_SEC);

describe('emote budget', () => {
  it('allows a burst, then one per 2 s', () => {
    const b = make();
    for (let i = 0; i < EMOTE_BURST; i++) expect(b.take('u', 0)).toBe(true);
    expect(b.take('u', 0)).toBe(false);
    expect(b.take('u', 2000)).toBe(true);
    expect(b.take('u', 2001)).toBe(false);
  });

  it('keeps users apart', () => {
    const b = make();
    for (let i = 0; i < EMOTE_BURST; i++) b.take('a', 0);
    expect(b.take('a', 0)).toBe(false);
    expect(b.take('b', 0)).toBe(true);
  });

  it('shares one budget per user id regardless of socket', () => {
    const b = make();
    b.take('u', 0);
    b.take('u', 0);
    b.take('u', 0);
    expect(b.take('u', 0)).toBe(false);
  });

  it('is tighter than the socket bucket', () => {
    expect(EMOTE_BURST).toBeLessThan(SOCKET_BURST);
    expect(EMOTE_REFILL_PER_SEC).toBeLessThan(SOCKET_REFILL_PER_SEC);
  });
});
