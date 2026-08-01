import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
import { createJWT, setAuthCookies } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { checkAuthAllowed, getClientIp, resetAuthFailures } from '@/lib/authRateLimit';

/**
 * Google OAuth callback.
 * Receives a Google ID token (credential), verifies it with Google's servers,
 * then either logs in an existing user or creates a new account.
 *
 * POST /api/auth/oauth/google
 * Body: { credential: string }  — the Google ID token from GIS
 */

interface GoogleUserInfo {
  sub: string;      // Google's unique user ID
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

async function verifyGoogleToken(credential: string): Promise<GoogleUserInfo | null> {
  try {
    // Verify with Google's tokeninfo endpoint
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (!res.ok) return null;

    const data = await res.json();

    // Validate required fields
    if (!data.sub || !data.email || !data.email_verified) return null;

    // Validate audience (must match our Google Client ID)
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && data.aud !== clientId) {
      console.warn('[oauth/google] audience mismatch', { expected: clientId, got: data.aud });
      return null;
    }

    return {
      sub: data.sub,
      email: data.email.toLowerCase(),
      email_verified: data.email_verified === 'true' || data.email_verified === true,
      name: data.name || data.email.split('@')[0],
      picture: data.picture || undefined,
      given_name: data.given_name || undefined,
      family_name: data.family_name || undefined,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const credential = typeof body.credential === 'string' ? body.credential : '';
    const clientIp = getClientIp(request);
    const rateKey = `oauth-google:${clientIp}`;

    // Rate limiting
    const allowed = checkAuthAllowed(rateKey);
    if (!allowed.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts, please try again later.' },
        { status: 429 },
      );
    }

    if (!credential) {
      return NextResponse.json(
        { success: false, error: 'Missing Google credential.' },
        { status: 400 },
      );
    }

    // Verify the Google token
    const googleUser = await verifyGoogleToken(credential);
    if (!googleUser) {
      return NextResponse.json(
        { success: false, error: 'Google verification failed. Please try again.' },
        { status: 401 },
      );
    }

    await ensureDatabaseSchema();

    // Check if user already exists by email
    const existing = await getPool().query(
      `SELECT id, email, name, phone, role, favorites, created_at FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1`,
      [googleUser.email],
    );

    let user: { id: string; email: string; name: string; role: string; phone?: string; favorites?: string[]; created_at?: string };

    if (existing.rowCount && existing.rows[0]) {
      // Existing user — log them in
      const row = existing.rows[0];
      user = {
        id: row.id,
        email: row.email,
        name: row.name || googleUser.name,
        role: row.role || 'user',
        phone: row.phone || undefined,
        favorites: row.favorites || [],
        created_at: row.created_at,
      };
    } else {
      // New user — create account
      const userId = randomUUID();
      const displayName = googleUser.name || googleUser.email.split('@')[0];

      const result = await getPool().query(
        `INSERT INTO users (id, email, name, phone, password_hash, role, oauth_provider, oauth_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, email, name, phone, role, favorites, created_at`,
        [
          userId,
          googleUser.email,
          displayName,
          '', // no phone from Google
          '', // no password for OAuth users
          'user',
          'google',
          googleUser.sub,
        ],
      );

      const row = result.rows[0];
      user = {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        phone: row.phone || undefined,
        favorites: row.favorites || [],
        created_at: row.created_at,
      };
    }

    // Create JWT and set cookies
    const accessToken = createJWT({ userId: user.id, email: user.email, role: user.role as 'user' | 'admin' });
    const refreshToken = randomBytes(32).toString('hex');
    await setAuthCookies(accessToken, refreshToken);
    resetAuthFailures(rateKey);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        favorites: user.favorites,
        createdAt: user.created_at,
      },
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('[oauth/google] unhandled error', err instanceof Error ? err.message : 'Unknown error');
    const response = NextResponse.json(
      { success: false, error: 'OAuth login failed. Please try again later.' },
      { status: 500 },
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}