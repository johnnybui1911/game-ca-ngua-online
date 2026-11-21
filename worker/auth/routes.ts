import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { GuestRequest, MeResponse, MeUser, SignInRequest, SignUpRequest } from '../../shared/protocol';
import type { Env } from '../env';
import { claimAttempts, clientKey, forgiveSignIn, signInSubjects, tooManySignins, tooManySignups } from './attempt-limit';
import {
  createPasswordUser,
  findUserByEmail,
  resolveOAuthUser,
  upgradeGuestWithPassword,
} from './accounts';
import { HttpError } from './errors';
import { claimGuestSlot, createGuest, deleteGuest } from './guest';
import { buildAuthorizeUrl, configuredProviders, fetchProfile, isProvider } from './oauth';
import { DUMMY_HASH_PROMISE, verifyPassword } from './password';
import {
  base64Url,
  cookieHeader,
  createSession,
  destroySession,
  getSessionAccount,
  randomToken,
  readCookie,
} from './session';
import { checkDisplayName, checkPassword, normalizeEmail, sanitizeReturnTo } from './validate';

type AppContext = Context<{ Bindings: Env }>;

const OAUTH_COOKIE = 'ca_oauth';
const OAUTH_COOKIE_PATH = '/api/auth/oauth';
const OAUTH_COOKIE_SECONDS = 600;

/** Rejects state-changing requests that do not originate from the request's own host. */
export const requireSameOrigin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const origin = c.req.header('Origin');
  let ok = false;
  if (origin) {
    try {
      ok = new URL(origin).host === new URL(c.req.url).host;
    } catch {
      ok = false;
    }
  }
  if (!ok) throw new HttpError(403, 'forbidden_origin', 'Yêu cầu không hợp lệ.');
  await next();
};

async function readJson(c: AppContext): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json();
    if (typeof body === 'object' && body !== null) return body as Record<string, unknown>;
  } catch {
    // fall through to the error below
  }
  throw new HttpError(400, 'invalid_json', 'Dữ liệu gửi lên không hợp lệ.');
}

async function me(c: AppContext, userOverride?: MeUser): Promise<MeResponse> {
  return {
    user: userOverride ?? (await getSessionAccount(c.req.raw, c.env)),
    providers: configuredProviders(c.env),
  };
}

async function respondSignedIn(c: AppContext, userId: string) {
  c.header('Set-Cookie', await createSession(c.env, userId));
  const row = await c.env.DB.prepare('SELECT id, display_name AS displayName, is_guest AS guest FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; displayName: string; guest: number }>();
  return c.json(await me(c, row ? { id: row.id, displayName: row.displayName, guest: row.guest === 1 } : undefined));
}

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.onError((err, c) => {
  if (err instanceof HttpError) return c.json(err.toBody(), err.status);
  console.error('auth error', err);
  return c.json(
    { error: { code: 'internal', message: 'Có lỗi xảy ra, vui lòng thử lại.' } },
    500,
  );
});

authRoutes.get('/me', async (c) => c.json(await me(c)));

authRoutes.post('/signup', requireSameOrigin, async (c) => {
  const body = (await readJson(c)) as Partial<SignUpRequest>;
  const email = normalizeEmail(body.email);
  const password = checkPassword(body.password);
  const displayName = checkDisplayName(body.displayName);
  await claimAttempts(c.env, [{ kind: 'signup-addr', subject: clientKey(c.req.raw) }], tooManySignups);
  const current = await getSessionAccount(c.req.raw, c.env);
  if (current?.guest) {
    // Upgrade in place: the user id and the session stay, so the guest keeps its seat.
    await upgradeGuestWithPassword(c.env, current.id, email, password, displayName);
    return c.json(await me(c, { ...current, displayName, guest: false }));
  }
  const userId = await createPasswordUser(c.env, email, password, displayName);
  return respondSignedIn(c, userId);
});

authRoutes.post('/guest', requireSameOrigin, async (c) => {
  const body = (await readJson(c)) as Partial<GuestRequest>;
  if (await getSessionAccount(c.req.raw, c.env)) {
    throw new HttpError(409, 'already_signed_in', 'Bạn đã đăng nhập rồi.');
  }
  const displayName = checkDisplayName(body.displayName);
  await claimGuestSlot(c.env, c.req.raw);
  return respondSignedIn(c, await createGuest(c.env, displayName));
});

authRoutes.post('/signin', requireSameOrigin, async (c) => {
  const body = (await readJson(c)) as Partial<SignInRequest>;
  const failure = new HttpError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.');
  let email: string;
  try {
    email = normalizeEmail(body.email);
  } catch {
    throw failure;
  }
  const password = typeof body.password === 'string' ? body.password : '';
  // Claimed before any hashing and forgiven once the password proves right, so only failures stay counted.
  const address = clientKey(c.req.raw);
  const claims = await claimAttempts(c.env, signInSubjects(email, address), tooManySignins);
  const user = await findUserByEmail(c.env, email);
  // Verify against a dummy hash for unknown or password-less accounts so the response time is alike.
  const stored = user?.password_hash ?? (await DUMMY_HASH_PROMISE());
  const ok = await verifyPassword(password, stored);
  if (!user || !user.password_hash || !ok) throw failure;
  await forgiveSignIn(c.env, claims, email, address);
  const current = await getSessionAccount(c.req.raw, c.env);
  const response = await respondSignedIn(c, user.id);
  // A guest that signs in to an existing account is replaced by it.
  if (current?.guest) await deleteGuest(c.env, current.id);
  return response;
});

authRoutes.post('/signout', requireSameOrigin, async (c) => {
  c.header('Set-Cookie', await destroySession(c.req.raw, c.env));
  return c.body(null, 204);
});

function oauthFailed(c: AppContext, reason = 'oauth_failed') {
  c.header('Set-Cookie', cookieHeader(OAUTH_COOKIE, '', { maxAge: 0, path: OAUTH_COOKIE_PATH }));
  return c.redirect(`/dang-nhap?error=${reason}`, 302);
}

authRoutes.get('/oauth/:provider/start', async (c) => {
  const provider = c.req.param('provider');
  if (!isProvider(provider)) throw new HttpError(404, 'unknown_provider', 'Không tìm thấy nhà cung cấp đăng nhập.');
  const state = randomToken(24);
  const start = await buildAuthorizeUrl(provider, c.env, new URL(c.req.url).origin, state);
  if (!start) return oauthFailed(c, 'provider_not_configured');
  const returnTo = sanitizeReturnTo(c.req.query('returnTo'));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ state, verifier: start.verifier, returnTo })));
  c.header('Set-Cookie', cookieHeader(OAUTH_COOKIE, payload, { maxAge: OAUTH_COOKIE_SECONDS, path: OAUTH_COOKIE_PATH }));
  return c.redirect(start.url, 302);
});

interface OAuthCookie {
  state: string;
  verifier: string | null;
  returnTo: string;
}

function readOAuthCookie(request: Request): OAuthCookie | null {
  const raw = readCookie(request, OAUTH_COOKIE);
  if (!raw) return null;
  try {
    const json = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(json, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<OAuthCookie>;
    if (typeof parsed.state !== 'string') return null;
    return {
      state: parsed.state,
      verifier: typeof parsed.verifier === 'string' ? parsed.verifier : null,
      returnTo: sanitizeReturnTo(parsed.returnTo),
    };
  } catch {
    return null;
  }
}

/** Equal-length comparison without early exit. */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

authRoutes.get('/oauth/:provider/callback', async (c) => {
  const provider = c.req.param('provider');
  if (!isProvider(provider)) throw new HttpError(404, 'unknown_provider', 'Không tìm thấy nhà cung cấp đăng nhập.');
  const saved = readOAuthCookie(c.req.raw);
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!saved || !code || !state || c.req.query('error') || !sameText(saved.state, state)) {
    return oauthFailed(c);
  }
  try {
    const profile = await fetchProfile(provider, c.env, new URL(c.req.url).origin, code, saved.verifier);
    // The guest comes from the session cookie only; nothing about it travels in the URL.
    const current = await getSessionAccount(c.req.raw, c.env);
    const guestId = current?.guest ? current.id : null;
    const userId = await resolveOAuthUser(c.env, provider, profile, guestId);
    // The new session exists before the guest goes, so a failure never leaves the player with neither.
    c.header('Set-Cookie', await createSession(c.env, userId), { append: true });
    if (guestId && userId !== guestId) await deleteGuest(c.env, guestId);
    c.header('Set-Cookie', cookieHeader(OAUTH_COOKIE, '', { maxAge: 0, path: OAUTH_COOKIE_PATH }), {
      append: true,
    });
    return c.redirect(saved.returnTo, 302);
  } catch (e) {
    console.error('oauth callback failed', provider, e);
    return oauthFailed(c);
  }
});
