/**
 * Launch funnel counters. Only daily totals per event and acquisition source are
 * kept: no user id, address or name, so nothing here identifies a player.
 */

/** Events the browser may report through `POST /api/events`. */
export const CLIENT_EVENTS = ['visit', 'landing_view', 'invite_shared'] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

/** Events only the server records, at the point where they actually happen. */
export type ServerEvent =
  | 'guest_started'
  | 'signed_up'
  | 'account_saved'
  | 'room_created'
  | 'match_started_solo'
  | 'match_started_group'
  | 'match_finished';

export type FunnelEvent = ClientEvent | ServerEvent;

/**
 * Acquisition sources counted separately. Anything else is `other`; a visitor with
 * no `utm_source` is `direct`. A closed list keeps the table from growing on junk input.
 */
export const SOURCES = [
  'direct',
  'invite',
  'facebook',
  'zalo',
  'tiktok',
  'threads',
  'x',
  'reddit',
  'youtube',
  'instagram',
  'discord',
  'email',
  'other',
] as const;
export type Source = (typeof SOURCES)[number];

/** Source recorded for events that have no visitor attached (match events run inside the room). */
export const NO_SOURCE = '-';

/** First-touch source cookie, set by the client on the first visit and read by the server. */
export const SOURCE_COOKIE = 'ca_src';
export const SOURCE_COOKIE_DAYS = 30;

/** Short aliases people actually type in `utm_source`. */
const ALIASES: Record<string, Source> = { fb: 'facebook', tt: 'tiktok', ig: 'instagram', twitter: 'x', yt: 'youtube' };

/** Maps a raw `utm_source` (or cookie value) to a counted source. */
export function normalizeSource(raw: string | null | undefined): Source {
  if (raw === null || raw === undefined) return 'direct';
  const key = raw.trim().toLowerCase();
  if (key === '') return 'direct';
  if (Object.hasOwn(ALIASES, key)) return ALIASES[key] as Source;
  return (SOURCES as readonly string[]).includes(key) ? (key as Source) : 'other';
}

export function isClientEvent(value: unknown): value is ClientEvent {
  return typeof value === 'string' && (CLIENT_EVENTS as readonly string[]).includes(value);
}

/** UTC day `YYYY-MM-DD` that a counter falls into. */
export function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
