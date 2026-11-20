import { describe, expect, it } from 'vitest';
import { backoffDelay } from './reconnecting-socket';

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
