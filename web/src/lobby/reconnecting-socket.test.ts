import { describe, expect, it } from 'vitest';
import { CLOSE_SIGNED_OUT, STOP_CODES, backoffDelay } from './reconnecting-socket';

describe('backoffDelay', () => {
  it('grows exponentially and is capped', () => {
    const mid = () => 0.5;
    expect(backoffDelay(0, mid)).toBe(400);
    expect(backoffDelay(1, mid)).toBe(800);
    expect(backoffDelay(3, mid)).toBe(3200);
    expect(backoffDelay(10, mid)).toBe(8000);
  });

  it('jitters within 25 percent', () => {
    expect(backoffDelay(2, () => 0)).toBe(1200);
    expect(backoffDelay(2, () => 1)).toBe(2000);
  });
});

describe('STOP_CODES', () => {
  it('never reconnects after the session has ended', () => {
    expect(CLOSE_SIGNED_OUT).toBe(4006);
    expect(STOP_CODES.has(CLOSE_SIGNED_OUT)).toBe(true);
  });

  it('keeps reconnecting after an ordinary drop', () => {
    for (const code of [1000, 1001, 1006, 1012]) expect(STOP_CODES.has(code)).toBe(false);
  });
});
