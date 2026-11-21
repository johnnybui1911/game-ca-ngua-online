import { HttpError } from './errors';

export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
export const MIN_NAME = 2;
export const MAX_NAME = 24;

export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'invalid_email', 'Email không hợp lệ.');
  }
  return email;
}

export function checkPassword(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length < MIN_PASSWORD) {
    throw new HttpError(400, 'invalid_password', `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự.`);
  }
  if (raw.length > MAX_PASSWORD) {
    throw new HttpError(400, 'invalid_password', `Mật khẩu tối đa ${MAX_PASSWORD} ký tự.`);
  }
  return raw;
}

const MAX_MARKS_PER_BASE = 2;

/**
 * Characters that render blank (or as nothing) but are letters, symbols or marks, so the
 * general-category filter alone would keep them: Hangul fillers, Braille blank, combining
 * grapheme joiner, Khmer inherent vowels and musical-symbol format controls.
 */
const INVISIBLE = new Set<number>([
  0x034f, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x2800, 0x3164, 0xffa0, 0x1d159,
  ...Array.from({ length: 0x1d17a - 0x1d173 + 1 }, (_, i) => 0x1d173 + i),
]);

const ZWJ = 0x200d;
const EXTENDED_PICTOGRAPHIC = /^\p{Extended_Pictographic}$/u;
const EMOJI_MODIFIER = /^\p{Emoji_Modifier}$/u;
const KEYCAP_BASE = /^[0-9#*]$/;
const IDEOGRAPH = /^\p{Script=Han}$/u;
const MARK = /^\p{M}$/u;
const WHITESPACE = /^\s$/u;
const CONTROL_OR_FORMAT = /^[\p{Cc}\p{Cf}]$/u;

function isVariationSelector(cp: number): boolean {
  return (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
}

/** A variation selector is kept only right after a character it can modify. */
function variationSelectorFits(cp: number, prev: string): boolean {
  if (prev === '') return false;
  if (cp === 0xfe0e || cp === 0xfe0f) return EXTENDED_PICTOGRAPHIC.test(prev) || KEYCAP_BASE.test(prev);
  return IDEOGRAPH.test(prev);
}

/**
 * Normalises text to NFC and removes what can make a name look blank or misleading:
 * - whitespace of any kind (incl. U+3000, U+00A0, U+FEFF) collapses to one space; ends are trimmed;
 * - control and format characters (Cc, Cf: bidi overrides, zero-width space, soft hyphen, ...) are
 *   dropped, except U+200D, kept only between two emoji (an emoji, optionally followed by U+FE0F
 *   or a skin-tone modifier, then an emoji) so family and rainbow-flag sequences stay whole;
 *   emoji tag characters (U+E0020-E007F) are format characters and are dropped, so a subdivision
 *   flag such as England degrades to a plain black flag;
 * - an explicit set of blank-rendering letters/symbols (see INVISIBLE) is dropped;
 * - variation selectors survive only directly after a character they can modify;
 * - at most 2 consecutive combining marks stay on a base character (enough for any NFC
 *   Vietnamese text and keycaps), and marks with no base are dropped.
 * Runs before any length check so invisible characters cannot pad a name.
 */
export function sanitizeText(raw: string): string {
  const chars = [...raw.normalize('NFC')];
  let out = '';
  let prev = ''; // last emitted code point as a string, '' at start
  let prevEmoji = false; // last emitted base is an emoji (survives FE0F and skin-tone modifiers)
  let marks = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const cp = ch.codePointAt(0)!;

    if (WHITESPACE.test(ch)) {
      if (prev !== '' && prev !== ' ') {
        out += ' ';
        prev = ' ';
        prevEmoji = false;
        marks = 0;
      }
      continue;
    }
    if (cp === ZWJ) {
      if (prevEmoji && EXTENDED_PICTOGRAPHIC.test(chars[i + 1] ?? '')) {
        out += ch;
        prev = ch;
        prevEmoji = false;
      }
      continue;
    }
    if (CONTROL_OR_FORMAT.test(ch) || INVISIBLE.has(cp)) continue;
    if (isVariationSelector(cp)) {
      if (!variationSelectorFits(cp, prev)) continue;
      // The selector keeps the emoji state of its base.
    } else if (MARK.test(ch)) {
      if (prev === '' || prev === ' ' || ++marks > MAX_MARKS_PER_BASE) continue;
      prevEmoji = false;
    } else {
      marks = 0;
      prevEmoji = EXTENDED_PICTOGRAPHIC.test(ch) || (prevEmoji && EMOJI_MODIFIER.test(ch));
    }
    if (isVariationSelector(cp)) marks++;
    out += ch;
    prev = ch;
  }
  return out.trimEnd();
}

export function checkDisplayName(raw: unknown): string {
  const name = typeof raw === 'string' ? sanitizeText(raw) : '';
  const length = [...name].length;
  if (length < MIN_NAME || length > MAX_NAME) {
    throw new HttpError(400, 'invalid_display_name', `Tên hiển thị phải từ ${MIN_NAME} đến ${MAX_NAME} ký tự.`);
  }
  return name;
}

/** Turns a provider-supplied name into a valid display name. */
export function displayNameFromProfile(raw: string | undefined): string {
  const name = sanitizeText(raw ?? '');
  const clipped = [...name].slice(0, MAX_NAME).join('').trim();
  return [...clipped].length >= MIN_NAME ? clipped : 'Người chơi';
}

/** Only a same-origin absolute path is allowed; anything else becomes `/`. */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\\]/.test(raw)) return '/';
  return raw;
}
