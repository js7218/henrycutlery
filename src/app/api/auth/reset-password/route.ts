import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { checkSensitiveAllowed, getClientIp, recordSensitiveFailure, resetSensitiveFailures } from '@/lib/sensitiveRateLimit';

export const dynamic = 'force-dynamic';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 *
 * Looks up the (still-active, unused, unexpired) reset token, swaps in the
 * new password, marks the token as used. We do this in a transaction so a
 * crash in the middle won't leave the token half-consumed.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const ip = getClientIp(request);
    const body = await request.json().catch(() => null);
    const token = String(body?.token || '').trim();
    const password = String(body?.password || '');
    const limitKey = `reset-password:${ip}:${token ? hashToken(token).slice(0, 16) : 'missing'}`;
    const allowed = checkSensitiveAllowed(limitKey);

    if (!allowed.allowed) {
      return NextResponse.json(
        { success: false, error: '请求过于频繁，请稍后再试', retryAfterSeconds: allowed.retryAfterSeconds },
        { status: 429 }
      );
    }

    if (!token || !password) {
      recordSensitiveFailure(limitKey, { maxFailures: 8, windowMs: 15 * 60 * 1000, lockMs: 30 * 60 * 1000 });
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }
    if (password.length < 12 || password.length > 128) {
      recordSensitiveFailure(limitKey, { maxFailures: 8, windowMs: 15 * 60 * 1000, lockMs: 30 * 60 * 1000 });
      return NextResponse.json(
        { success: false, error: '密码必须为 12-128 位，且包含大小写字母、数字和特殊字符' },
        { status: 400 }
      );
    }

    // Server-side password strength validation
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const weakPasswords = ['12345678', 'password', 'qwerty', 'admin123', 'letmein', '123456789', 'abc123', 'password1'];
    if (!hasLower || !hasUpper || !hasDigit || !hasSpecial || weakPasswords.includes(password.toLowerCase())) {
      recordSensitiveFailure(limitKey, { maxFailures: 8, windowMs: 15 * 60 * 1000, lockMs: 30 * 60 * 1000 });
      return NextResponse.json(
        { success: false, error: '密码强度不足，请使用至少12位包含大小写字母、数字和特殊字符的组合' },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(token);
    const newHash = await hashPassword(password);

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const tokenResult = await client.query(
        `UPDATE password_resets
            SET used_at = NOW()
          WHERE token_hash = $1
            AND used_at IS NULL
            AND expires_at > NOW()
          RETURNING user_id`,
        [tokenHash]
      );
      const tokenRow = tokenResult.rows[0];
      if (!tokenRow) {
        await client.query('ROLLBACK');
        recordSensitiveFailure(limitKey, { maxFailures: 8, windowMs: 15 * 60 * 1000, lockMs: 30 * 60 * 1000 });
        return NextResponse.json(
          { success: false, error: '链接无效或已过期' },
          { status: 400 }
        );
      }
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, tokenRow.user_id]
      );
      await client.query('COMMIT');
      resetSensitiveFailures(limitKey);
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[reset-password] failed', err);
    return NextResponse.json(
      { success: false, error: '重置失败，请稍后再试' },
      { status: 500 }
    );
  }
}
