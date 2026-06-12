import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { hashPassword } from '@/lib/password';

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
    const body = await request.json().catch(() => null);
    const token = String(body?.token || '').trim();
    const password = String(body?.password || '');
    if (!token || !password) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: '密码至少 8 位' },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(token);
    const tokenResult = await getPool().query(
      `SELECT id, user_id, expires_at, used_at
         FROM password_resets
        WHERE token_hash = $1
        LIMIT 1`,
      [tokenHash]
    );
    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      return NextResponse.json(
        { success: false, error: '链接无效' },
        { status: 400 }
      );
    }
    if (tokenRow.used_at) {
      return NextResponse.json(
        { success: false, error: '链接已被使用' },
        { status: 400 }
      );
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: '链接已过期，请重新申请' },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(password);

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, tokenRow.user_id]
      );
      await client.query(
        `UPDATE password_resets SET used_at = NOW() WHERE id = $1`,
        [tokenRow.id]
      );
      await client.query('COMMIT');
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
