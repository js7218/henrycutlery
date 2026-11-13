import { randomBytes, randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_EXPIRY, createJWT, setAuthCookies } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import {
  exchangeCode,
  fetchProfile,
  getOrigin,
  getProvider,
  getRedirectUri,
  isProviderConfigured,
  isSafeNextPath,
  oauthCookieNames,
  type OAuthProfile,
} from '@/lib/oauth';

export const dynamic = 'force-dynamic';

type SessionUser = { id: string; email: string; role: string };

/** Finds or creates the account and always returns the row used for the JWT. */
async function resolveUser(providerId: string, profile: OAuthProfile): Promise<SessionUser> {
  const db = getPool();
  const identityResult = await db.query(
    `SELECT id, email, role, avatar_url
     FROM users
     WHERE oauth_provider = $1 AND oauth_subject = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [providerId, profile.subject]
  );

  if (identityResult.rows[0]) {
    const row = identityResult.rows[0];
    if (profile.avatar && profile.avatar !== row.avatar_url) {
      await db.query(
        `UPDATE users SET avatar_url = $2, updated_at = NOW() WHERE id = $1`,
        [row.id, profile.avatar]
      );
    }
    return row as SessionUser;
  }

  if (!profile.email) {
    // Apple omits the email on repeat consent. Without a subject match there is
    // no way to link the account safely.
    throw new Error('Provider did not return an email for a new account');
  }

  const email = profile.email.toLowerCase();
  const byEmail = await db.query(
    `SELECT id, email, role FROM users
     WHERE LOWER(email) = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [email]
  );

  if (byEmail.rows[0]) {
    const row = byEmail.rows[0];
    const linked = await db.query(
      `UPDATE users
       SET oauth_provider = $2, oauth_subject = $3,
           avatar_url = COALESCE(NULLIF($4, ''), avatar_url),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, role`,
      [row.id, providerId, profile.subject, profile.avatar]
    );
    return linked.rows[0] as SessionUser;
  }

  try {
    const inserted = await db.query(
      `INSERT INTO users (id, email, name, phone, password_hash, role, oauth_provider, oauth_subject, avatar_url)
       VALUES ($1, $2, $3, '', NULL, 'user', $4, $5, $6)
       RETURNING id, email, role`,
      [
        `u${randomUUID()}`,
        email,
        profile.name || email.split('@')[0],
        providerId,
        profile.subject,
        profile.avatar || null,
      ]
    );
    return inserted.rows[0] as SessionUser;
  } catch (error) {
    // A concurrent callback may have inserted the same identity or email.
    const code = (error as { code?: string }).code;
    if (code !== '23505') throw error;

    const retry = await db.query(
      `SELECT id, email, role FROM users
       WHERE ((oauth_provider = $1 AND oauth_subject = $2) OR LOWER(email) = $3)
         AND deleted_at IS NULL
       LIMIT 1`,
      [providerId, profile.subject, email]
    );
    if (!retry.rows[0]) throw error;
    return retry.rows[0] as SessionUser;
  }
}

async function readCode(request: Request): Promise<{ code: string; state: string }> {
  if (request.method === 'POST') {
    // Apple posts the authorization result as a form instead of a query string.
    const form = await request.formData();
    return { code: String(form.get('code') || ''), state: String(form.get('state') || '') };
  }
  const params = new URL(request.url).searchParams;
  return { code: params.get('code') || '', state: params.get('state') || '' };
}

async function handleCallback(
  request: Request,
  providerId: string
): Promise<NextResponse> {
  const origin = getOrigin(request);
  const names = oauthCookieNames(providerId);
  const cookieStore = await cookies();

  const storedState = cookieStore.get(names.state)?.value || '';
  const verifier = cookieStore.get(names.verifier)?.value || '';
  const storedNext = cookieStore.get(names.next)?.value || '';

  const provider = getProvider(providerId);
  if (!provider || !isProviderConfigured(provider)) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin));
  }

  const { code, state } = await readCode(request);

  // State is the CSRF guard; the verifier is required for PKCE providers.
  if (!code || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin));
  }
  if (provider.pkce && !verifier) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin));
  }

  const redirectUri = getRedirectUri(provider.id, origin);
  const accessToken = await exchangeCode(provider.id, code, redirectUri, verifier);
  const profile = await fetchProfile(provider.id, accessToken);
  const user = await resolveUser(provider.id, profile);

  const token = createJWT(
    {
      userId: user.id,
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'user',
      remember: false,
    },
    ACCESS_TOKEN_EXPIRY
  );
  await setAuthCookies(token, randomBytes(32).toString('hex'), ACCESS_TOKEN_EXPIRY);

  const destination = isSafeNextPath(storedNext) ? storedNext : '/profile';
  const response = NextResponse.redirect(new URL(destination, origin));
  response.cookies.set(names.state, '', { path: '/', maxAge: 0 });
  response.cookies.set(names.verifier, '', { path: '/', maxAge: 0 });
  response.cookies.set(names.next, '', { path: '/', maxAge: 0 });
  return response;
}

function failRedirect(request: Request, providerId: string): NextResponse {
  const response = NextResponse.redirect(
    new URL('/login?error=oauth_failed', getOrigin(request))
  );
  const names = oauthCookieNames(providerId);
  response.cookies.set(names.state, '', { path: '/', maxAge: 0 });
  response.cookies.set(names.verifier, '', { path: '/', maxAge: 0 });
  response.cookies.set(names.next, '', { path: '/', maxAge: 0 });
  return response;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  try {
    await ensureDatabaseSchema();
    return await handleCallback(request, provider);
  } catch (error) {
    console.error('[oauth] sign-in failed:', error instanceof Error ? error.message : 'unknown error');
    return failRedirect(request, provider);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  try {
    await ensureDatabaseSchema();
    return await handleCallback(request, provider);
  } catch (error) {
    console.error('[oauth] sign-in failed:', error instanceof Error ? error.message : 'unknown error');
    return failRedirect(request, provider);
  }
}
