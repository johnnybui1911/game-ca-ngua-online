import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../api';
import { gateFailure } from './room-gate';

const err = (status: number) => new ApiRequestError(status, 'x', 'x');

describe('gateFailure', () => {
  it('stops for a missing room', () => expect(gateFailure(err(404))).toBe('not_found'));
  it('stops for a server error', () => {
    expect(gateFailure(err(500))).toBe('unavailable');
    expect(gateFailure(err(503))).toBe('unavailable');
  });
  it('goes on to connect when rate limited or offline', () => {
    expect(gateFailure(err(429))).toBeNull();
    expect(gateFailure(err(0))).toBeNull();
  });
  it('goes on for anything that is not an API error', () => expect(gateFailure(new TypeError('x'))).toBeNull());
});
