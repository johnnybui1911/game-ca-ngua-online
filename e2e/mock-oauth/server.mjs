/**
 * Mock Google, Facebook and X OAuth providers for e2e.
 *
 * Per provider: GET /<p>/authorize, POST /<p>/token, GET /<p>/profile. Credentials and the listen
 * address are read from `.dev.vars.e2e-mock`, the same file the worker is configured with.
 * Test control: POST /__control/profile {provider, profile}, POST /__control/deny {provider, deny},
 * POST /__control/reset.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const vars = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../../.dev.vars.e2e-mock', import.meta.url)), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const base = new URL(vars.OAUTH_TEST_BASE_URL);

const PROVIDERS = {
  google: { id: vars.GOOGLE_CLIENT_ID, secret: vars.GOOGLE_CLIENT_SECRET, scope: 'openid email profile', pkce: false },
  facebook: { id: vars.FACEBOOK_CLIENT_ID, secret: vars.FACEBOOK_CLIENT_SECRET, scope: 'public_profile,email', pkce: false },
  x: { id: vars.X_CLIENT_ID, secret: vars.X_CLIENT_SECRET, scope: 'users.read tweet.read', pkce: true },
};

const defaultProfile = (p) => ({ id: `mock-${p}-1`, name: `Mock ${p}`, email: undefined, emailVerified: false });
const profiles = {};
const denied = new Set();
const codes = new Map();
const tokens = new Map();

function reset() {
  for (const p of Object.keys(PROVIDERS)) profiles[p] = defaultProfile(p);
  denied.clear();
  codes.clear();
  tokens.clear();
}
reset();

const sha256url = (s) => createHash('sha256').update(s).digest('base64url');

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function formatProfile(provider, p) {
  if (provider === 'google') {
    return { sub: p.id, name: p.name, email: p.email, email_verified: p.emailVerified };
  }
  if (provider === 'facebook') return { id: p.id, name: p.name, email: p.email };
  return { data: { id: p.id, name: p.name, username: `user${p.id}` } };
}

function authorize(provider, cfg, url, res) {
  const q = url.searchParams;
  const redirectUri = q.get('redirect_uri') ?? '';
  const state = q.get('state');
  let target;
  try {
    target = new URL(redirectUri);
  } catch {
    return send(res, 400, { error: 'bad redirect_uri' });
  }
  const problems = [];
  if (q.get('client_id') !== cfg.id) problems.push('client_id');
  if (q.get('response_type') !== 'code') problems.push('response_type');
  if (q.get('scope') !== cfg.scope) problems.push('scope');
  if (!state) problems.push('state');
  if (target.pathname !== `/api/auth/oauth/${provider}/callback`) problems.push('redirect_uri path');
  if (cfg.pkce && (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge'))) problems.push('pkce');
  if (problems.length > 0) return send(res, 400, { error: 'invalid_request', problems });

  if (denied.has(provider)) {
    target.searchParams.set('error', 'access_denied');
  } else {
    const code = randomBytes(16).toString('hex');
    codes.set(code, { provider, redirectUri, challenge: q.get('code_challenge'), profile: { ...profiles[provider] } });
    target.searchParams.set('code', code);
  }
  target.searchParams.set('state', state);
  res.writeHead(302, { Location: target.toString() });
  res.end();
}

async function token(provider, cfg, req, res) {
  const form = new URLSearchParams(await readBody(req));
  let clientId = form.get('client_id');
  let secret = form.get('client_secret');
  if (cfg.pkce) {
    // Confidential X client: credentials travel in the Basic header.
    const auth = req.headers.authorization ?? '';
    const decoded = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString() : '';
    const i = decoded.indexOf(':');
    secret = i < 0 ? null : decoded.slice(i + 1);
    clientId = i < 0 ? null : decoded.slice(0, i);
    if (form.get('client_id') !== clientId) return send(res, 400, { error: 'invalid_client' });
  }
  if (clientId !== cfg.id || secret !== cfg.secret) return send(res, 401, { error: 'invalid_client' });
  if (form.get('grant_type') !== 'authorization_code') return send(res, 400, { error: 'unsupported_grant_type' });
  const entry = codes.get(form.get('code') ?? '');
  codes.delete(form.get('code') ?? '');
  if (!entry || entry.provider !== provider) return send(res, 400, { error: 'invalid_grant' });
  if (entry.redirectUri !== form.get('redirect_uri')) return send(res, 400, { error: 'redirect_uri_mismatch' });
  if (cfg.pkce && sha256url(form.get('code_verifier') ?? '') !== entry.challenge) {
    return send(res, 400, { error: 'invalid_grant', detail: 'pkce' });
  }
  const accessToken = randomBytes(16).toString('hex');
  tokens.set(accessToken, { provider, profile: entry.profile });
  send(res, 200, { access_token: accessToken, token_type: 'bearer' });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', base);
    const [, first, second] = url.pathname.split('/');
    if (first === '__control') {
      const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {};
      if (second === 'reset') reset();
      else if (second === 'profile') profiles[body.provider] = { ...defaultProfile(body.provider), ...body.profile };
      else if (second === 'deny') (body.deny ? denied.add(body.provider) : denied.delete(body.provider));
      else return send(res, 404, { error: 'unknown control' });
      return send(res, 204);
    }
    const cfg = PROVIDERS[first];
    if (!cfg) return send(res, 404, { error: 'unknown provider' });
    if (second === 'authorize' && req.method === 'GET') return authorize(first, cfg, url, res);
    if (second === 'token' && req.method === 'POST') return await token(first, cfg, req, res);
    if (second === 'profile' && req.method === 'GET') {
      const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      const entry = tokens.get(bearer);
      if (!entry || entry.provider !== first) return send(res, 401, { error: 'invalid_token' });
      return send(res, 200, formatProfile(first, entry.profile));
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
});

server.listen(Number(base.port), base.hostname, () => {
  console.log(`mock oauth listening on ${base.origin}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
