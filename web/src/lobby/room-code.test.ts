import { describe, expect, it } from 'vitest';
import { parseRoomCode } from './room-code';

describe('parseRoomCode', () => {
  it('accepts a bare code in any case with spaces', () => {
    expect(parseRoomCode('  k7m2qx ')).toBe('K7M2QX');
  });

  it('extracts the code from a pasted link', () => {
    expect(parseRoomCode('https://ca-ngua.example.com/r/k7m2qx?utm=1#top')).toBe('K7M2QX');
    expect(parseRoomCode('/r/ABC234')).toBe('ABC234');
  });

  it('rejects wrong length and ambiguous characters', () => {
    expect(parseRoomCode('ABC')).toBeNull();
    expect(parseRoomCode('ABCDE0')).toBeNull();
    expect(parseRoomCode('ABCDEI')).toBeNull();
    expect(parseRoomCode('')).toBeNull();
  });
});
