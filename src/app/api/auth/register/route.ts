import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
import { createJWT, setAuthCookies } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { checkAuthAllowed, getClientIp, recordAuthFailure, resetAuthFailures } from '@/lib/authRateLimit';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function safeText(value: unknown, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isValidInternationalPhone(phone: string) {
  return /^\+[1-9]\d{0,3}\s?[0-9][0-9\s().-]{5,30}$/.test(phone);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = safeText(body.name, 100);
    const email = safeText(body.email, 254).toLowerCase();
    const phone = safeText(body.phone, 40);
    const password = typeof body.password === 'string' ? body.password : '';
    const rateKey = `register:${getClientIp(request)}:${email || 'unknown'}`;
    const allowed = checkAuthAllowed(rateKey);

    if (!allowed.allowed) {
      return NextResponse.json(
        { success: false, error: '注册尝试过多，请稍后再试', code: 'AUTH_LOCKED', retryAfterSeconds: allowed.retryAfterSeconds },
        { status: 429 }
      );
    }

    if (!name || !isValidEmail(email) || !isValidInternationalPhone(phone) || password.length < 12) {
      recordAuthFailure(rateKey);
      return NextResponse.json(
        { success: false, error: '注册信息不完整或格式不正确，密码至少12位且包含大小写字母、数字和特殊字符' },
        { status: 400 }
      );
    }

    // Server-side password strength validation (must match client-side rules)
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const weakPasswords = ['12345678', 'password', 'qwerty', 'admin123', 'letmein', '123456789', 'abc123', 'password1'];
    if (!hasLower || !hasUpper || !hasDigit || !hasSpecial || weakPasswords.includes(password.toLowerCase())) {
      recordAuthFailure(rateKey);
      return NextResponse.json(
        { success: false, error: '密码强度不足，请使用至少12位包含大小写字母、数字和特殊字符的组合' },
        { status: 400 }
      );
    }

    await ensureDatabaseSchema();
    const existing = await getPool().query(
      `
        SELECT
          u.id,
          u.password_hash,
          COALESCE((SELECT COUNT(*)::int FROM addresses a WHERE a.user_id = u.id), 0) AS address_count,
          COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id), 0) AS order_count,
          COALESCE(jsonb_array_length(u.favorites), 0) AS favorite_count,
          u.deleted_at
        FROM users u
        WHERE LOWER(u.email) = LOWER($1)
        LIMIT 1
      `,
      [email]
    );

    if (existing.rowCount) {
      const existingUser = existing.rows[0];
      if (existingUser && await verifyPassword(password, existingUser.password_hash)) {
        const dbUser = await getUserById(existingUser.id);
        if (dbUser) {
          const accessToken = createJWT({ userId: dbUser.id, email: dbUser.email, role: dbUser.role || 'user' });
          const refreshToken = randomBytes(32).toString('hex');
          await setAuthCookies(accessToken, refreshToken);
          resetAuthFailures(rateKey);
          const response = NextResponse.json({ success: true, user: dbUser });
          response.headers.set('Cache-Control', 'no-store');
          return response;
        }
      }

      return NextResponse.json(
        { success: false, error: '注册失败，请检查输入信息或稍后重试' },
        { status: 409 }
      );
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);
    const role = 'user';

    const result = await getPool().query(
      `
        INSERT INTO users (id, email, name, phone, password_hash, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, name, phone, role, favorites, created_at
      `,
      [userId, email, name, phone, passwordHash, role]
    );

    const userRow = result.rows[0];
    const accessToken = createJWT({ userId: userRow.id, email: userRow.email, role: userRow.role });
    const refreshToken = randomBytes(32).toString('hex');
    await setAuthCookies(accessToken, refreshToken);
    resetAuthFailures(rateKey);

    const response = NextResponse.json({
      success: true,
      user: await getUserById(userRow.id),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('[register] unhandled error', err);
    const response = NextResponse.json(
      { success: false, error: '注册失败，请稍后再试', code: 'REGISTER_ERROR' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
