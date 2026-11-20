/** Same rule the worker applies: only a same-origin absolute path is accepted. */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\\]/.test(raw)) return '/';
  return raw;
}
