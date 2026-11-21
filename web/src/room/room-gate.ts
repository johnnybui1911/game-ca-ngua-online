import { ApiRequestError } from '../api';

/**
 * Why the pre-connect room lookup should stop the connection for good, or null to go ahead.
 * Only a missing room (404) or a server refusal is final. No answer (status 0) and being
 * rate limited (429) say nothing about the room, and the socket upgrade itself rejects a
 * missing room or session, so both go on to connect.
 */
export function gateFailure(err: unknown): 'not_found' | 'unavailable' | null {
  if (!(err instanceof ApiRequestError)) return null;
  if (err.status === 404) return 'not_found';
  if (err.status === 0 || err.status === 429) return null;
  return 'unavailable';
}
