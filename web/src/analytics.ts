import {
  SOURCE_COOKIE,
  SOURCE_COOKIE_DAYS,
  normalizeSource,
  type ClientEvent,
} from '../../shared/analytics';

const VISIT_FLAG = 'ca_visit_counted';
const UTM_PARAM = 'utm_source';

function hasSourceCookie(): boolean {
  return document.cookie.split(';').some((part) => part.trim().startsWith(`${SOURCE_COOKIE}=`));
}

/** Fire-and-forget report; analytics must never surface an error to the player. */
function report(event: ClientEvent, source?: string): void {
  void fetch('/api/events', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source === undefined ? { event } : { event, source }),
  }).catch(() => undefined);
}

/**
 * Runs once at startup: remembers the first-touch source in a cookie the server reads
 * on sign-up and room creation, counts one visit per browser tab session, then drops
 * `utm_source` from the address bar so it does not travel into room links or `returnTo`.
 */
export function recordVisit(): void {
  const url = new URL(location.href);
  const raw = url.searchParams.get(UTM_PARAM);
  const source = normalizeSource(raw);
  if (!hasSourceCookie()) {
    document.cookie = `${SOURCE_COOKIE}=${source}; Max-Age=${SOURCE_COOKIE_DAYS * 86400}; Path=/; SameSite=Lax; Secure`;
  }
  try {
    if (!sessionStorage.getItem(VISIT_FLAG)) {
      sessionStorage.setItem(VISIT_FLAG, '1');
      report('visit', source);
    }
  } catch {
    // Storage disabled (private mode in some browsers): skip the visit count.
  }
  if (raw !== null) {
    url.searchParams.delete(UTM_PARAM);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
}

/** Landing page startup: counts the landing view under this visit's own source, then records the visit. */
export function recordLandingVisit(): void {
  report('landing_view', normalizeSource(new URL(location.href).searchParams.get(UTM_PARAM)));
  recordVisit();
}

/** Counts a room link being copied or shared. */
export function reportInviteShared(): void {
  report('invite_shared');
}

/** Room link to hand to friends; the tag lets the funnel count players brought by invites. */
export function inviteLink(code: string): string {
  return `${location.origin}/r/${code}?${UTM_PARAM}=invite`;
}
