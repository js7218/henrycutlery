import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { sendTransactionalEmail } from '@/lib/orderEmail';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const TOKEN_TTL_MS = 30 * 60 * 1000;
const recentRequests = new Map<string, number[]>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  const list = (recentRequests.get(key) || []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );
  if (list.length >= RATE_LIMIT_MAX) {
    recentRequests.set(key, list);
    return false;
  }
  list.push(now);
  recentRequests.set(key, list);
  return true;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * POST /api/auth/forgot-password
 * Body: { email, phone? }
 *
 * Always returns success in the response body (even if email/phone don't
 * match) so attackers can't enumerate which accounts exist.
 *
 * If the (email, phone) tuple matches a real account we:
 *   1. Generate a one-time random token (returned only via email link).
 *   2. Store ONLY its sha256 hash in DB.
 *   3. Email the link to the user. We never SMS, and we never send the new
 *      password in plaintext - the user picks a new one after clicking.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const body = await request.json().catch(() => null);
    const email = String(body?.email || '').trim().toLowerCase();
    const phone = String(body?.phone || '').trim();
    if (!email) {
      return NextResponse.json(
        { success: false, error: '请输入邮箱' },
        { status: 400 }
      );
    }

    if (!rateLimit(ip)) {
      // Stay vague to avoid telling abusers that the IP is being throttled.
      return NextResponse.json({ success: true });
    }

    const userResult = await getPool().query(
      `SELECT id, email, phone FROM users
        WHERE LOWER(email) = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [email]
    );
    const user = userResult.rows[0];

    // If we have a user AND (the user supplied no phone OR the phone matches),
    // proceed. Phone is optional but, when given, must match the saved one.
    const phoneOk =
      !phone || (user && user.phone && user.phone.trim() === phone);

    if (user && phoneOk) {
      // Invalidate any previous active reset tokens for this user.
      await getPool().query(
        `UPDATE password_resets
            SET used_at = NOW()
          WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [user.id]
      );

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

      await getPool().query(
        `INSERT INTO password_resets (id, user_id, token_hash, expires_at, ip)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), user.id, tokenHash, expiresAt, ip]
      );

      const baseUrl =
        process.env.SITE_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        'http://localhost:3000';
      const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

      const html = `
        <p>你好,</p>
        <p>我们收到了你账号 <strong>${escapeHtml(user.email)}</strong> 的密码重置请求。</p>
        <p>请在 <strong>30 分钟内</strong> 点击下面的链接设置新密码:</p>
        <p><a href="${resetUrl}">${escapeHtml(resetUrl)}</a></p>
        <p>如果不是你本人发起,可以忽略此邮件,密码不会变化。</p>
        <p>为了你的账号安全,我们不会通过任何渠道把密码原文发给你。</p>
      `;

      try {
        await sendTransactionalEmail({
          to: user.email,
          subject: 'Adam Cutlery 密码重置链接',
          html,
        });
      } catch (mailErr) {
        console.error('[forgot-password] mail send failed', mailErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[forgot-password] failed', err);
    // Still return success-shaped response to avoid leaking implementation.
    return NextResponse.json({ success: true });
  }
}
