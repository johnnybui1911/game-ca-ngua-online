import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../env';
import {
  claimAttempts,
  forgiveSignIn,
  signInSubjects,
  tooManySignins,
  tooManySignups,
} from './attempt-limit';
import { createSession, sha256Hex } from './session';
import { createTestDb } from './sqlite-d1';

const NOW = 10_000_000;
const MIN = 60_000;

let env: Env;
let count: (where?: string) => number;

async function setup(migrations: string[], overrides: Partial<Env> = {}) {
  const t = await createTestDb(migrations);
  env = { ...t.env, ...overrides } as Env;
  count = (where = '1') => (t.db.prepare(`SELECT COUNT(*) AS n FROM auth_attempts WHERE ${where}`).all()[0] as { n: number }).n;
}

const signIn = (email: string, address: string, now = NOW) =>
  claimAttempts(env, signInSubjects(email, address), tooManySignins, now);

describe('sign-in claims', () => {
  beforeEach(() => setup(['0003_auth_attempts.sql']));

  it('rejects the 11th attempt of one (email, address) pair but not the same email from elsewhere', async () => {
    for (let i = 0; i < 10; i++) await signIn('a@x.vn', '1.1.1.1');
    await expect(signIn('a@x.vn', '1.1.1.1')).rejects.toMatchObject({ status: 429, code: 'too_many_attempts' });
    await expect(signIn('a@x.vn', '2.2.2.2')).resolves.toHaveLength(3);
    await expect(signIn('b@x.vn', '1.1.1.1')).resolves.toHaveLength(3);
  });

  it('rejects once the email is spent across addresses', async () => {
    env = { ...env, SIGNIN_EMAIL_LIMIT: '5' } as Env;
    for (let i = 0; i < 5; i++) await signIn('a@x.vn', `10.0.0.${i}`);
    await expect(signIn('a@x.vn', '10.0.0.99')).rejects.toMatchObject({ code: 'too_many_attempts' });
    await expect(signIn('b@x.vn', '10.0.0.99')).resolves.toHaveLength(3);
  });

  it('rejects once the address is spent across emails', async () => {
    env = { ...env, SIGNIN_ADDRESS_LIMIT: '4' } as Env;
    for (let i = 0; i < 4; i++) await signIn(`u${i}@x.vn`, '9.9.9.9');
    await expect(signIn('new@x.vn', '9.9.9.9')).rejects.toMatchObject({ code: 'too_many_attempts' });
    await expect(signIn('new@x.vn', '8.8.8.8')).resolves.toHaveLength(3);
  });

  it('leaves no row behind from a rejected request', async () => {
    env = { ...env, SIGNIN_ADDRESS_LIMIT: '2' } as Env;
    await signIn('a@x.vn', '1.1.1.1');
    await signIn('b@x.vn', '1.1.1.1');
    expect(count()).toBe(6);
    await expect(signIn('c@x.vn', '1.1.1.1')).rejects.toBeTruthy();
    // The pair and email claims of the rejected request were given back.
    expect(count()).toBe(6);
    expect(count("kind = 'signin-pair'")).toBe(2);
  });

  it('counts only attempts inside the 15 minute window', async () => {
    for (let i = 0; i < 10; i++) await signIn('a@x.vn', '1.1.1.1', NOW);
    await expect(signIn('a@x.vn', '1.1.1.1', NOW + 15 * MIN - 1)).rejects.toBeTruthy();
    await expect(signIn('a@x.vn', '1.1.1.1', NOW + 15 * MIN)).resolves.toHaveLength(3);
    // The old rows were pruned by that claim.
    expect(count("kind = 'signin-pair'")).toBe(1);
  });

  it('forgives a correct sign-in: the pair starts over, the request gives back its shared claims', async () => {
    for (let i = 0; i < 9; i++) await signIn('a@x.vn', '1.1.1.1');
    const claims = await signIn('a@x.vn', '1.1.1.1');
    await signIn('a@x.vn', '2.2.2.2'); // another place keeps its own failures
    await forgiveSignIn(env, claims, 'a@x.vn', '1.1.1.1');
    expect(count("kind = 'signin-pair'")).toBe(1);
    expect(count("kind = 'signin-email'")).toBe(10);
    expect(count("kind = 'signin-addr'")).toBe(9 + 1);
    // 10 more failures fit again.
    for (let i = 0; i < 9; i++) await signIn('a@x.vn', '1.1.1.1');
  });
});

describe('sign-up claims', () => {
  beforeEach(() => setup(['0003_auth_attempts.sql']));

  it('allows 20 an hour per address and the 21st is rejected', async () => {
    const up = (address: string, now = NOW) =>
      claimAttempts(env, [{ kind: 'signup-addr', subject: address }], tooManySignups, now);
    for (let i = 0; i < 20; i++) await up('1.1.1.1');
    await expect(up('1.1.1.1', NOW + 59 * MIN)).rejects.toMatchObject({ status: 429, code: 'too_many_signups' });
    await expect(up('2.2.2.2')).resolves.toHaveLength(1);
    await expect(up('1.1.1.1', NOW + 60 * MIN)).resolves.toHaveLength(1);
  });
});

describe('session cap', () => {
  beforeEach(async () => {
    await setup(['0001_auth.sql', '0002_guests.sql', '0003_auth_attempts.sql']);
    for (const id of ['user-a', 'user-b']) {
      await env.DB.prepare('INSERT INTO users (id, email, display_name, created_at) VALUES (?, NULL, ?, 0)').bind(id, id).run();
    }
  });

  const tokenOf = (cookie: string) => /ca_session=([^;]+)/.exec(cookie)![1]!;
  const live = async (token: string) =>
    (await env.DB.prepare('SELECT 1 AS x FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).first()) !== null;

  it('keeps the 10 newest sessions of the user and leaves other users alone', async () => {
    const other = await createSession(env, 'user-b');
    const tokens: string[] = [];
    for (let i = 0; i < 12; i++) tokens.push(tokenOf(await createSession(env, 'user-a')));
    const flags = await Promise.all(tokens.map(live));
    expect(flags).toEqual([false, false, ...new Array<boolean>(10).fill(true)]);
    expect(await live(tokenOf(other))).toBe(true);
  });

  it('honours the override', async () => {
    env = { ...env, SESSIONS_PER_USER: '2' } as Env;
    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) tokens.push(tokenOf(await createSession(env, 'user-a')));
    expect(await Promise.all(tokens.map(live))).toEqual([false, true, true]);
  });
});
