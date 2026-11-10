import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
import { createJWT, setAuthCookies } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { verifyCode } from '@/lib/verificationCode';
import { checkAuthAllowed, getClientIp, recordAuthFailure, resetAuthFailures } from '@/lib/authRateLimit';
import { WEAK_PASSWORD_SET } from '@/data/weakPasswords';

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
    const body = await request.json().catch(() => ({}));
    const name = safeText(body.name, 100);
    const email = safeText(body.email, 254).toLowerCase();
    const phone = safeText(body.phone, 40);
    // Normalize phone: strip country code prefix (e.g., "+86 ") so we store just the local number.
    // A separator is required so numbers sent without one (e.g. "+8613800000001")
    // are not truncated into a wrong local number.
    const normalizedPhone = phone.replace(/^\+\d{1,3}[\s-]+/, '');
    const password = typeof body.password === 'string' ? body.password : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const rateKey = `register:${getClientIp(request)}:${email || 'unknown'}`;
    const allowed = checkAuthAllowed(rateKey);

    if (!allowed.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many registration attempts, please try again later', code: 'AUTH_LOCKED', retryAfterSeconds: allowed.retryAfterSeconds },
        { status: 429 }
      );
    }

    if (!name || !isValidEmail(email) || !isValidInternationalPhone(phone) || password.length < 12) {
      recordAuthFailure(rateKey);
      return NextResponse.json(
        { success: false, error: 'Invalid registration information. Password must be at least 12 characters with uppercase, lowercase, numbers and special characters' },
        { status: 400 }
      );
    }

    // Server-side password strength validation (must match client-side rules)
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    if (!hasLower || !hasUpper || !hasDigit || !hasSpecial || WEAK_PASSWORD_SET.has(password.toLowerCase())) {
      recordAuthFailure(rateKey);
      return NextResponse.json(
        { success: false, error: 'Password is too weak. Use at least 12 characters with uppercase, lowercase, numbers and special characters' },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(code)) {
      recordAuthFailure(rateKey);
      return NextResponse.json(
        { success: false, code: 'INVALID_CODE', error: 'Please enter the 6-digit verification code sent to your email' },
        { status: 400 }
      );
    }

    await ensureDatabaseSchema();

    // Email ownership must be proven before a new account is created.
    const verifyResult = await verifyCode(email, 'email', code, 'register');
    if (!verifyResult.valid) {
      recordAuthFailure(rateKey);
      return NextResponse.json(
        { success: false, code: 'INVALID_CODE', error: verifyResult.error || 'Verification code is invalid or has expired' },
        { status: 400 }
      );
    }

    const existing = await getPool().query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (existing.rowCount) {
      return NextResponse.json(
        {
          success: false,
          code: 'EMAIL_ALREADY_REGISTERED',
          error: 'This email is already registered. Please sign in or reset your password.',
        },
        { status: 409 }
      );
    }

    // Check phone number duplication (compare normalized form)
    const phoneCountResult = await getPool().query(
      `SELECT COUNT(*)::int as count FROM users WHERE REPLACE(phone, ' ', '') = REPLACE($1, ' ', '') AND deleted_at IS NULL`,
      [normalizedPhone]
    );
    const phoneCount = phoneCountResult.rows[0]?.count || 0;
    if (phoneCount >= 3) {
      return NextResponse.json(
        { success: false, error: 'This phone number has reached the maximum of 3 accounts' },
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
      [userId, email, name, normalizedPhone, passwordHash, role]
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
    console.error('[register] unhandled error', err instanceof Error ? err.message : 'Unknown error');
    const response = NextResponse.json(
      { success: false, error: 'Registration failed. Please try again later', code: 'REGISTER_ERROR' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
