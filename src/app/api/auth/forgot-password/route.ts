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

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '').replace(/^00/, '+');
}

function phoneMatches(registered: string, submitted: string): boolean {
  const a = normalizePhone(registered);
  const b = normalizePhone(submitted);
  if (!a || !b) return false;
  if (a === b) return true;
  const aDigits = a.replace(/\D/g, '');
  const bDigits = b.replace(/\D/g, '');
  return aDigits.length >= 6 && bDigits.length >= 6 && aDigits.slice(-10) === bDigits.slice(-10);
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
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const body = await request.json().catch(() => null);
    const email = String(body?.email || '').trim().toLowerCase();
    const phone = String(body?.phone || '').trim();
    if (!email || !phone) {
      return NextResponse.json(
        { success: false, error: 'Please enter both email and phone number.' },
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

    // Phone is mandatory and must exactly match the registered phone for the
    // account; otherwise we silently respond success to avoid leaking info.
    const phoneOk = !!(user && user.phone && phoneMatches(user.phone, phone));

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
        <p>Hello,</p>
        <p>We received a password reset request for your account <strong>${escapeHtml(user.email)}</strong>.</p>
        <p>Please click the link below to set a new password within <strong>30 minutes</strong>:</p>
        <p><a href="${resetUrl}">${escapeHtml(resetUrl)}</a></p>
        <p>If you did not initiate this request, you can ignore this email and your password will remain unchanged.</p>
        <p>For your account security, we will never send your password in plaintext through any channel.</p>
      `;

      try {
        await sendTransactionalEmail({
          to: user.email,
          subject: 'Adam Cutlery Password Reset Link',
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
