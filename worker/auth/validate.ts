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

export function checkDisplayName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  const length = [...name].length;
  if (length < MIN_NAME || length > MAX_NAME) {
    throw new HttpError(400, 'invalid_display_name', `Tên hiển thị phải từ ${MIN_NAME} đến ${MAX_NAME} ký tự.`);
  }
  return name;
}

/** Turns a provider-supplied name into a valid display name. */
export function displayNameFromProfile(raw: string | undefined): string {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ');
  const clipped = [...name].slice(0, MAX_NAME).join('').trim();
  return [...clipped].length >= MIN_NAME ? clipped : 'Người chơi';
}

/** Only a same-origin absolute path is allowed; anything else becomes `/`. */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\\]/.test(raw)) return '/';
  return raw;
}
