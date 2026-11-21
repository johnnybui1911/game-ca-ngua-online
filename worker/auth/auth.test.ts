import { describe, expect, it } from 'vitest';
import { constantTimeEqual, hashPassword, verifyPassword } from './password';
import { checkDisplayName, displayNameFromProfile, sanitizeReturnTo, sanitizeText } from './validate';

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
    const cut = 'A'.repeat(22) + '👨\u200D👩';
    expect(displayNameFromProfile(cut)).toBe('A'.repeat(22) + '👨');
    expect(displayNameFromProfile('A'.repeat(21) + '👨\u200D👩')).toBe('A'.repeat(21) + '👨\u200D👩');
  });
});

describe('text sanitising', () => {
  it('strips control, zero-width and bidi-override characters and collapses spaces', () => {
    expect(sanitizeText('  An\u200B\u202Eevil\u2066 \t Bình\u0007 ')).toBe('Anevil Bình');
  });

  it('keeps Vietnamese letters and ordinary emoji', () => {
    expect(sanitizeText('Nguyễn Văn Ả 🐴')).toBe('Nguyễn Văn Ả 🐴');
  });

  it('applies before the length check, so invisible padding cannot satisfy the minimum', () => {
    expect(() => checkDisplayName('a\u200B\u200B\u200B')).toThrow();
    expect(checkDisplayName('A\u200Bn')).toBe('An');
    expect(displayNameFromProfile('\u202E\u200B')).toBe('Người chơi');
  });

  it('normalises decomposed Vietnamese to NFC without hitting the mark limit', () => {
    const decomposed = 'Nguye\u0302\u0303n Va\u0306n A\u0309';
    expect(sanitizeText(decomposed)).toBe('Nguyễn Văn Ả');
  });

  it('keeps ZWJ sequences and keycaps whole', () => {
    const family = '👨\u200D👩\u200D👧';
    const flag = '🏳\uFE0F\u200D🌈';
    const skin = '👩🏽\u200D💻';
    expect(sanitizeText(`${family} ${flag} ${skin} 1\uFE0F\u20E3`)).toBe(`${family} ${flag} ${skin} 1\uFE0F\u20E3`);
  });

  it('removes ZWJ that is not between two emoji', () => {
    expect(sanitizeText('\u200D🐴\u200D')).toBe('🐴');
    expect(sanitizeText('A\u200DB')).toBe('AB');
    expect(sanitizeText('🐴\u200D\u200D🐴')).toBe('🐴\u200D🐴');
    expect(sanitizeText('🐴\u200DA')).toBe('🐴A');
  });

  it('drops emoji tag characters', () => {
    expect(sanitizeText('🏴\u{E0067}\u{E0062}\u{E007F}')).toBe('🏴');
  });

  it.each([
    0x3164, 0xffa0, 0x115f, 0x1160, 0x2800, 0x034f, 0x17b4, 0x17b5, 0x1d159, 0x1d173, 0x1d17a, 0xfe00, 0xe0100,
  ])('removes invisible U+%s', (cp) => {
    expect(sanitizeText(`A${String.fromCodePoint(cp)}B`)).toBe('AB');
  });

  it('drops standalone variation selectors but keeps FE0F after emoji', () => {
    expect(sanitizeText('\uFE0FA\uFE0F')).toBe('A');
    expect(sanitizeText('❤\uFE0F\uFE0F')).toBe('❤\uFE0F');
  });

  it('collapses whitespace-class characters to a single space', () => {
    expect(sanitizeText('\u3000A\u00A0\u2003\u205FB\uFEFF\u3164 C\u2000')).toBe('A B C');
  });

  it('limits combining marks per base', () => {
    const zalgo = 'Z' + '\u0300\u0301\u0302\u0303\u0304\u0305'.repeat(5) + 'a';
    expect(sanitizeText(zalgo)).toBe('Z\u0300\u0301a');
    expect(sanitizeText('\u0301\u0302 A')).toBe('A');
  });

  it('rejects names made only of invisible characters', () => {
    expect(() => checkDisplayName('\u3164\u3164')).toThrow();
    expect(displayNameFromProfile('\u2800\u2800\u2800')).toBe('Người chơi');
  });
});
