import type { Env } from '../env';
import { HttpError } from './errors';
import { addressKey } from './guest';
import { sha256Hex } from './session';

export type AttemptKind = 'signin-pair' | 'signin-email' | 'signin-addr' | 'signup-addr';

interface Policy {
  windowMs: number;
  defaultLimit: number;
}

const MINUTE = 60 * 1000;

/**
 * Sign-in limits count attempts that have not succeeded: the claim is made before the password is
 * checked (so concurrent guesses cannot overshoot). A correct password releases the request's own
 * claims and clears every earlier attempt of the same (email, address) pair.
 *  - pair: the strict limit. Keyed by both email and address, so a third party cannot lock an
 *    account owner out from another address.
 *  - email: a looser ceiling against guessing spread over many addresses.
 *  - addr: sized for shared addresses (carrier NAT, school or office networks).
 * Sign-ups are counted before their outcome, whether or not they succeed: every attempt runs a
 * password hash, so the count bounds that work.
 */
export const POLICIES: Record<AttemptKind, Policy> = {
  'signin-pair': { windowMs: 15 * MINUTE, defaultLimit: 10 },
  'signin-email': { windowMs: 15 * MINUTE, defaultLimit: 100 },
  'signin-addr': { windowMs: 15 * MINUTE, defaultLimit: 50 },
  'signup-addr': { windowMs: 60 * MINUTE, defaultLimit: 20 },
};

/** An optional env override when it is a positive integer, else the default. */
export function limitFromEnv(raw: string | undefined, fallback: number): number {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function limitFor(env: Env, kind: AttemptKind): number {
  const raw = {
    'signin-pair': env.SIGNIN_PAIR_LIMIT,
    'signin-email': env.SIGNIN_EMAIL_LIMIT,
    'signin-addr': env.SIGNIN_ADDRESS_LIMIT,
    'signup-addr': env.SIGNUP_ADDRESS_LIMIT,
  }[kind];
  return limitFromEnv(raw, POLICIES[kind].defaultLimit);
}

/** Start of the sliding window that ends at `now`. */
export const attemptWindowStart = (kind: AttemptKind, now: number) => now - POLICIES[kind].windowMs;

/** Hash of the limited subject; the kind is part of it so counters never mix. */
export function attemptKeyHash(kind: AttemptKind, subject: string): Promise<string> {
  return sha256Hex(`auth-attempt:${kind}:${subject}`);
}

export const clientKey = (request: Request) => addressKey(request.headers.get('CF-Connecting-IP'));

/** A claimed attempt, released again when the attempt turns out to be legitimate. */
export interface Claim {
  kind: AttemptKind;
  rowId: number;
}

type Subject = { kind: AttemptKind; subject: string };

/** The counters one sign-in attempt for `email` from `address` is held against. */
export function signInSubjects(email: string, address: string): Subject[] {
  return [
    { kind: 'signin-pair', subject: `${address}|${email}` },
    { kind: 'signin-email', subject: email },
    { kind: 'signin-addr', subject: address },
  ];
}

/**
 * Claims one attempt for every subject, or none: when any subject is already at its limit nothing
 * stays claimed and `tooMany` is thrown. Counting and inserting are one statement per subject.
 */
export async function claimAttempts(
  env: Env,
  subjects: Subject[],
  tooMany: () => HttpError,
  now = Date.now(),
): Promise<Claim[]> {
  const hashes = await Promise.all(subjects.map((s) => attemptKeyHash(s.kind, s.subject)));
  const statements = subjects.flatMap((s, i) => {
    const start = attemptWindowStart(s.kind, now);
    return [
      env.DB.prepare('DELETE FROM auth_attempts WHERE kind = ? AND created_at <= ?').bind(s.kind, start),
      env.DB.prepare(
        `INSERT INTO auth_attempts (kind, key_hash, created_at)
         SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM auth_attempts WHERE kind = ?1 AND key_hash = ?2 AND created_at > ?4) < ?5`,
      ).bind(s.kind, hashes[i], now, start, limitFor(env, s.kind)),
    ];
  });
  const results = await env.DB.batch(statements);
  const claims: Claim[] = [];
  let spent = false;
  subjects.forEach((s, i) => {
    const insert = results[i * 2 + 1];
    if (insert?.meta.changes) claims.push({ kind: s.kind, rowId: insert.meta.last_row_id });
    else spent = true;
  });
  if (spent) {
    await releaseAttempts(env, claims);
    throw tooMany();
  }
  return claims;
}

/** Gives claimed attempts back. */
export async function releaseAttempts(env: Env, claims: Claim[]): Promise<void> {
  if (claims.length === 0) return;
  await env.DB.batch(claims.map((c) => env.DB.prepare('DELETE FROM auth_attempts WHERE rowid = ?').bind(c.rowId)));
}

/**
 * Settles a correct sign-in: every attempt of the (email, address) pair is forgotten, and the
 * request's claims on the shared email and address counters are given back.
 */
export async function forgiveSignIn(env: Env, claims: Claim[], email: string, address: string): Promise<void> {
  const [pair] = signInSubjects(email, address);
  const pairHash = await attemptKeyHash(pair!.kind, pair!.subject);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_attempts WHERE kind = ? AND key_hash = ?').bind(pair!.kind, pairHash),
    ...claims
      .filter((c) => c.kind !== pair!.kind)
      .map((c) => env.DB.prepare('DELETE FROM auth_attempts WHERE rowid = ?').bind(c.rowId)),
  ]);
}

export const tooManySignins = () =>
  new HttpError(429, 'too_many_attempts', 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.');

export const tooManySignups = () =>
  new HttpError(429, 'too_many_signups', 'Bạn đã đăng ký quá nhiều lần. Vui lòng thử lại sau.');
