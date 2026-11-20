import type { OAuthProvider } from '../../shared/protocol';
import type { Env } from '../env';
import { HttpError } from './errors';
import type { ProviderProfile } from './oauth';
import { hashPassword } from './password';
import { displayNameFromProfile } from './validate';

export interface UserRow {
  id: string;
  display_name: string;
  password_hash: string | null;
}

export async function findUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT id, display_name, password_hash FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();
}

const isUniqueViolation = (e: unknown) => e instanceof Error && /UNIQUE|constraint/i.test(e.message);

export async function createPasswordUser(
  env: Env,
  email: string,
  password: string,
  displayName: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  try {
    await env.DB.prepare(
      'INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(id, email, displayName, hash, Date.now())
      .run();
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, 'email_taken', 'Email này đã được đăng ký.');
    throw e;
  }
  return id;
}

async function findLinkedUser(env: Env, provider: OAuthProvider, providerUserId: string) {
  const row = await env.DB.prepare(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?',
  )
    .bind(provider, providerUserId)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

const linkStatement = (env: Env, provider: OAuthProvider, providerUserId: string, userId: string) =>
  env.DB.prepare('INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)').bind(
    provider,
    providerUserId,
    userId,
  );

/**
 * Resolves a provider profile to a user id, creating or linking as needed.
 *
 * - A known (provider, id) pair signs that user in.
 * - Only a Google-verified email may link to an existing email account.
 * - Otherwise a new user is created. The email is stored on it only when the
 *   provider verified it and no other user holds it; an unverified address
 *   must not reserve an email that its real owner could later sign up with.
 */
export async function resolveOAuthUser(
  env: Env,
  provider: OAuthProvider,
  profile: ProviderProfile,
): Promise<string> {
  const linked = await findLinkedUser(env, provider, profile.id);
  if (linked) return linked;

  const email = profile.email?.trim().toLowerCase();
  const verifiedEmail = profile.emailVerified && email ? email : null;

  if (provider === 'google' && verifiedEmail) {
    const existing = await findUserByEmail(env, verifiedEmail);
    if (existing) {
      // An unverified password sign-up may have been made by someone other than the email's owner.
      // Linking hands the account to the verified owner, so the password and every session made
      // before now stop working, atomically with the link.
      const statements = [linkStatement(env, provider, profile.id, existing.id)];
      if (existing.password_hash !== null) {
        statements.push(
          env.DB.prepare('UPDATE users SET password_hash = NULL WHERE id = ?').bind(existing.id),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(existing.id),
        );
      }
      try {
        await env.DB.batch(statements);
      } catch (e) {
        // A concurrent callback linked the same provider account first.
        const winner = await findLinkedUser(env, provider, profile.id);
        if (winner) return winner;
        throw e;
      }
      return existing.id;
    }
  }

  const userId = crypto.randomUUID();
  const name = displayNameFromProfile(profile.name);
  const insertUser = (storedEmail: string | null) =>
    env.DB.prepare('INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, NULL, ?)').bind(
      userId,
      storedEmail,
      name,
      Date.now(),
    );
  try {
    await env.DB.batch([insertUser(verifiedEmail), linkStatement(env, provider, profile.id, userId)]);
  } catch (e) {
    const winner = await findLinkedUser(env, provider, profile.id);
    if (winner) return winner;
    if (!verifiedEmail || !isUniqueViolation(e)) throw e;
    // The email was claimed between the check and the insert; keep the account without it.
    await env.DB.batch([insertUser(null), linkStatement(env, provider, profile.id, userId)]);
  }
  return userId;
}
