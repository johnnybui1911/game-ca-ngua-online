import { OAUTH_PROVIDERS, type OAuthProvider } from '../../shared/protocol';
import type { Env } from '../env';
import { base64Url } from './session';

export interface ProviderProfile {
  id: string;
  name: string | undefined;
  email: string | undefined;
  /** True only when the provider vouches for the email address. */
  emailVerified: boolean;
}

interface ProviderEndpoints {
  authorize: string;
  token: string;
  profile: string;
}

const REAL_ENDPOINTS: Record<OAuthProvider, ProviderEndpoints> = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    profile: 'https://openidconnect.googleapis.com/v1/userinfo',
  },
  facebook: {
    authorize: 'https://www.facebook.com/v21.0/dialog/oauth',
    token: 'https://graph.facebook.com/v21.0/oauth/access_token',
    profile: 'https://graph.facebook.com/v21.0/me?fields=id,name,email',
  },
  x: {
    authorize: 'https://x.com/i/oauth2/authorize',
    token: 'https://api.x.com/2/oauth2/token',
    profile: 'https://api.x.com/2/users/me',
  },
};

const SCOPES: Record<OAuthProvider, string> = {
  google: 'openid email profile',
  facebook: 'public_profile,email',
  x: 'users.read tweet.read',
};

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

export function isProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as string[]).includes(value);
}

/**
 * `OAUTH_TEST_BASE_URL` comes from the worker's own configuration, never from a request,
 * and is honoured only when the worker itself is served from a loopback host.
 */
function endpoints(provider: OAuthProvider, env: Env, origin: string): ProviderEndpoints {
  const base = isLoopbackOrigin(origin) ? env.OAUTH_TEST_BASE_URL?.replace(/\/+$/, '') : undefined;
  if (!base) return REAL_ENDPOINTS[provider];
  return {
    authorize: `${base}/${provider}/authorize`,
    token: `${base}/${provider}/token`,
    profile: `${base}/${provider}/profile`,
  };
}

function credentials(provider: OAuthProvider, env: Env): { id: string; secret: string } | null {
  const [id, secret] =
    provider === 'google'
      ? [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET]
      : provider === 'facebook'
        ? [env.FACEBOOK_CLIENT_ID, env.FACEBOOK_CLIENT_SECRET]
        : [env.X_CLIENT_ID, env.X_CLIENT_SECRET];
  return id && secret ? { id, secret } : null;
}

export function configuredProviders(env: Env): Record<OAuthProvider, boolean> {
  return {
    google: credentials('google', env) !== null,
    facebook: credentials('facebook', env) !== null,
    x: credentials('x', env) !== null,
  };
}

export function redirectUri(origin: string, provider: OAuthProvider): string {
  return `${origin}/api/auth/oauth/${provider}/callback`;
}

export interface AuthorizeStart {
  url: string;
  /** PKCE verifier; only X uses one. */
  verifier: string | null;
}

export async function buildAuthorizeUrl(
  provider: OAuthProvider,
  env: Env,
  origin: string,
  state: string,
): Promise<AuthorizeStart | null> {
  const creds = credentials(provider, env);
  if (!creds) return null;
  const url = new URL(endpoints(provider, env, origin).authorize);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', creds.id);
  url.searchParams.set('redirect_uri', redirectUri(origin, provider));
  url.searchParams.set('scope', SCOPES[provider]);
  url.searchParams.set('state', state);
  let verifier: string | null = null;
  if (provider === 'x') {
    verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    url.searchParams.set('code_challenge', base64Url(new Uint8Array(challenge)));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return { url: url.toString(), verifier };
}

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`provider responded ${res.status}`);
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null) throw new Error('provider body is not an object');
  return body as Record<string, unknown>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Exchanges the authorization code and reads the profile. Throws on any provider failure. */
export async function fetchProfile(
  provider: OAuthProvider,
  env: Env,
  origin: string,
  code: string,
  verifier: string | null,
): Promise<ProviderProfile> {
  const creds = credentials(provider, env);
  if (!creds) throw new Error('provider not configured');
  const ep = endpoints(provider, env, origin);

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(origin, provider),
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (provider === 'x') {
    if (!verifier) throw new Error('missing PKCE verifier');
    form.set('code_verifier', verifier);
    form.set('client_id', creds.id);
    headers.Authorization = `Basic ${btoa(`${creds.id}:${creds.secret}`)}`;
  } else {
    form.set('client_id', creds.id);
    form.set('client_secret', creds.secret);
  }
  const token = await fetchJson(ep.token, { method: 'POST', headers, body: form });
  const accessToken = str(token.access_token);
  if (!accessToken) throw new Error('no access token');

  const profile = await fetchJson(ep.profile, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (provider === 'google') {
    const id = str(profile.sub);
    if (!id) throw new Error('no subject');
    return {
      id,
      name: str(profile.name),
      email: str(profile.email),
      emailVerified: profile.email_verified === true,
    };
  }
  if (provider === 'facebook') {
    const id = str(profile.id);
    if (!id) throw new Error('no id');
    return { id, name: str(profile.name), email: str(profile.email), emailVerified: false };
  }
  const data = profile.data as Record<string, unknown> | undefined;
  const id = str(data?.id);
  if (!id) throw new Error('no id');
  return { id, name: str(data?.name) ?? str(data?.username), email: undefined, emailVerified: false };
}
