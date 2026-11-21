/** Bindings and variables available to the worker. Keep in sync with wrangler.jsonc. */
import type { LobbyDO } from './rooms/lobby-do';
import type { RoomDO } from './rooms/room-do';

export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace<RoomDO>;
  LOBBY: DurableObjectNamespace<LobbyDO>;

  /** Public room summary lookups per client address (see wrangler.jsonc). Optional so a missing binding fails open. */
  ROOM_SUMMARY_LIMITER?: RateLimit;

  // OAuth credentials, set per deployment with `wrangler secret put`. A provider
  // with a missing id or secret is reported as not configured.
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;

  /**
   * Test-only: when set, every OAuth provider endpoint is served from this base URL
   * (`<base>/<provider>/{authorize,token,profile}`). Only ever set through a local
   * `.dev.vars.<env>` file, never a request or a deployed secret.
   */
  OAUTH_TEST_BASE_URL?: string;

  /** Guest creations allowed per client address per hour (positive integer; default 100). Local `.dev.vars.<env>` only. */
  GUEST_LIMIT_PER_HOUR?: string;

  /** Unsuccessful sign-ins allowed per email and client address together per 15 minutes (positive integer; default 10). Local `.dev.vars.<env>` only. */
  SIGNIN_PAIR_LIMIT?: string;

  /** Unsuccessful sign-ins allowed per email, from any address, per 15 minutes (positive integer; default 100). Local `.dev.vars.<env>` only. */
  SIGNIN_EMAIL_LIMIT?: string;

  /** Unsuccessful sign-ins allowed per client address, for any email, per 15 minutes (positive integer; default 50). Local `.dev.vars.<env>` only. */
  SIGNIN_ADDRESS_LIMIT?: string;

  /** Sign-up attempts allowed per client address per hour (positive integer; default 20). Local `.dev.vars.<env>` only. */
  SIGNUP_ADDRESS_LIMIT?: string;

  /** Live sessions kept per user, oldest removed first (positive integer; default 10). Local `.dev.vars.<env>` only. */
  SESSIONS_PER_USER?: string;

  /** Test-only: "1" shortens room timers (CPU pacing, turn deadline, disconnect grace). Local `.dev.vars.<env>` only. */
  ROOM_FAST_TIMERS?: string;
}
