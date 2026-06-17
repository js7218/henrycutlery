import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createJWT, setAuthCookies } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { checkAuthAllowed, getClientIp, recordAuthFailure, resetAuthFailures } from '@/lib/authRateLimit';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function getRetryAfterSeconds(result: ReturnType<typeof checkAuthAllowed> | ReturnType<typeof recordAuthFailure>) {
  return 'retryAfterSeconds' in result && result.retryAfterSeconds ? result.retryAfterSeconds : 0;
}

function failureReason(result: ReturnType<typeof recordAuthFailure>) {
  return 'reason' in result ? result.reason : undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const clientIp = getClientIp(request);
    const ipRateKey = `login-ip:${clientIp}`;
    const emailRateKey = `login-email:${email || 'unknown'}`;
    const ipAllowed = checkAuthAllowed(ipRateKey);
    const emailAllowed = checkAuthAllowed(emailRateKey);

    if (!ipAllowed.allowed || !emailAllowed.allowed) {
      const retryAfterSeconds = Math.max(
        getRetryAfterSeconds(ipAllowed),
        getRetryAfterSeconds(emailAllowed)
      );
      return NextResponse.json(
        { success: false, error: 'Too many attempts, please try again later.', code: 'AUTH_LOCKED', retryAfterSeconds },
        { status: 429 }
      );
    }

    if (!isValidEmail(email) || !password) {
      recordAuthFailure(ipRateKey);
      recordAuthFailure(emailRateKey);
      return NextResponse.json(
        { success: false, error: 'Incorrect email or password.' },
        { status: 401 }
      );
    }

    await ensureDatabaseSchema();
    const result = await getPool().query(
      `
        SELECT id, email, name, phone, password_hash, role, favorites, created_at
        FROM users
        WHERE email = $1 AND deleted_at IS NULL
        LIMIT 1
      `,
      [email]
    );

    const userRow = result.rows[0];
    if (!userRow || !(await verifyPassword(password, userRow.password_hash))) {
      const ipFailure = recordAuthFailure(ipRateKey);
      const emailFailure = recordAuthFailure(emailRateKey);
      if (!ipFailure.allowed || !emailFailure.allowed) {
        const retryAfterSeconds = Math.max(
          getRetryAfterSeconds(ipFailure),
          getRetryAfterSeconds(emailFailure)
        );
        return NextResponse.json(
          { success: false, error: 'Too many attempts, please try again later.', code: failureReason(ipFailure) || failureReason(emailFailure), retryAfterSeconds },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'Incorrect email or password' },
        { status: 401 }
      );
    }

    const role = userRow.role === 'admin' ? 'admin' : 'user';
    const accessToken = createJWT({ userId: userRow.id, email: userRow.email, role });
    const refreshToken = randomBytes(32).toString('hex');
    await setAuthCookies(accessToken, refreshToken);
    resetAuthFailures(ipRateKey);
    resetAuthFailures(emailRateKey);

    const response = NextResponse.json({
      success: true,
      user: await getUserById(userRow.id),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    const response = NextResponse.json(
      { success: false, error: 'Login failed, please try again later.' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
