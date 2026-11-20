/** Bindings and variables available to the worker. Keep in sync with wrangler.jsonc. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

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
}
