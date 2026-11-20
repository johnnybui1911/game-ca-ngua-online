import { describe, expect, it } from 'vitest';
import { constantTimeEqual, hashPassword, verifyPassword } from './password';
import { displayNameFromProfile, sanitizeReturnTo } from './validate';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const stored = await hashPassword('mat-khau-dai');
    expect(await verifyPassword('mat-khau-dai', stored)).toBe(true);
    expect(await verifyPassword('mat-khau-sai', stored)).toBe(false);
  });

  it('salts every hash differently and uses 100000 iterations', async () => {
    const a = await hashPassword('giong-nhau-1');
    const b = await hashPassword('giong-nhau-1');
    expect(a).not.toBe(b);
    expect(a.split('$')[1]).toBe('100000');
  });

  it('rejects malformed stored values', async () => {
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2-sha256$0$AA==$AA==')).toBe(false);
  });

  it('compares bytes of differing length as unequal', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
  });
});

describe('sanitizeReturnTo', () => {
  it('keeps same-origin paths with query', () => {
    expect(sanitizeReturnTo('/r/ABC234')).toBe('/r/ABC234');
    expect(sanitizeReturnTo('/lobby?x=1#y')).toBe('/lobby?x=1#y');
  });

  it.each([
    null,
    undefined,
    '',
    'r/ABC',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '/a\nb',
  ])('falls back to / for %j', (value) => {
    expect(sanitizeReturnTo(value)).toBe('/');
  });
});

describe('displayNameFromProfile', () => {
  it('clips to 24 characters and falls back when too short', () => {
    expect([...displayNameFromProfile('A'.repeat(40))]).toHaveLength(24);
    expect(displayNameFromProfile('x')).toBe('Người chơi');
    expect(displayNameFromProfile(undefined)).toBe('Người chơi');
    expect(displayNameFromProfile('  Lan   Anh ')).toBe('Lan Anh');
  });
});
