import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createJWT, setAuthCookies } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { checkAuthAllowed, getClientIp, recordAuthFailure, resetAuthFailures } from '@/lib/authRateLimit';
import { isAdminEmail } from '@/lib/adminEmails';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const rateKey = `login:${getClientIp(request)}:${email || 'unknown'}`;
    const allowed = checkAuthAllowed(rateKey);

    if (!allowed.allowed) {
      return NextResponse.json(
        { success: false, error: '尝试次数过多，请稍后再试', code: 'AUTH_LOCKED', retryAfterSeconds: allowed.retryAfterSeconds },
        { status: 429 }
      );
    }

    if (!isValidEmail(email) || !password) {
      recordAuthFailure(rateKey);
      return NextResponse.json(
        { success: false, error: '邮箱或密码不正确' },
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
      const failure = recordAuthFailure(rateKey);
      if (!failure.allowed) {
        return NextResponse.json(
          { success: false, error: '尝试次数过多，请稍后再试', code: failure.reason, retryAfterSeconds: failure.retryAfterSeconds },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, error: '邮箱或密码不正确' },
        { status: 401 }
      );
    }

    const role = userRow.role === 'admin' || isAdminEmail(userRow.email) ? 'admin' : 'user';
    const accessToken = createJWT({ userId: userRow.id, email: userRow.email, role });
    const refreshToken = randomBytes(32).toString('hex');
    await setAuthCookies(accessToken, refreshToken);
    resetAuthFailures(rateKey);

    const response = NextResponse.json({
      success: true,
      user: await getUserById(userRow.id),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    const response = NextResponse.json(
      { success: false, error: '登录失败，请稍后再试' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
