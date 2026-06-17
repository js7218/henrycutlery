/**
 * Verification Code System
 * - 6-digit numeric codes for phone/email login
 * - 1-minute expiry
 * - Max 3 attempts per code
 * - Rate limit: 1 request per 60 seconds per identifier
 */

import crypto from 'crypto';
import { getPool } from './db';

const CODE_TTL_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 3;
const RATE_LIMIT_MS = 60 * 1000; // 1 request per minute

// In-memory rate limiter for code generation
const codeRateLimits = new Map<string, number>();

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random() * 900000));
}

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const last = codeRateLimits.get(identifier);
  if (last && now - last < RATE_LIMIT_MS) {
    return false;
  }
  codeRateLimits.set(identifier, now);
  return true;
}

export async function createVerificationCode(
  identifier: string,
  type: 'email' | 'phone',
  ip: string
): Promise<{ code: string; expiresAt: Date } | null> {
  if (!checkRateLimit(identifier)) {
    return null; // Rate limited
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const id = crypto.randomUUID();

  const pool = getPool();

  // Invalidate any existing unused codes for this identifier
  await pool.query(
    `UPDATE verification_codes SET used_at = NOW() WHERE ${type} = $1 AND used_at IS NULL`,
    [identifier]
  );

  // Insert new code
  await pool.query(
    `INSERT INTO verification_codes (id, ${type}, code_hash, purpose, expires_at, ip)
     VALUES ($1, $2, $3, 'login', $4, $5)`,
    [id, identifier, codeHash, expiresAt, ip]
  );

  return { code, expiresAt };
}

export async function verifyCode(
  identifier: string,
  type: 'email' | 'phone',
  code: string
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  const codeHash = hashCode(code);
  const pool = getPool();

  const result = await pool.query(
    `SELECT id, user_id, code_hash, expires_at, used_at, attempts
     FROM verification_codes
     WHERE ${type} = $1 AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [identifier]
  );

  const row = result.rows[0];
  if (!row) {
    return { valid: false, error: '验证码无效或已过期' };
  }

  // Check expiry
  if (new Date(row.expires_at) < new Date()) {
    await pool.query(
      `UPDATE verification_codes SET used_at = NOW() WHERE id = $1`,
      [row.id]
    );
    return { valid: false, error: '验证码已过期，请重新获取' };
  }

  // Check max attempts
  if (row.attempts >= MAX_ATTEMPTS) {
    await pool.query(
      `UPDATE verification_codes SET used_at = NOW() WHERE id = $1`,
      [row.id]
    );
    return { valid: false, error: '验证码错误次数过多，请重新获取' };
  }

  // Increment attempts
  await pool.query(
    `UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`,
    [row.id]
  );

  // Verify code
  if (row.code_hash !== codeHash) {
    return { valid: false, error: '验证码不正确' };
  }

  // Mark as used
  await pool.query(
    `UPDATE verification_codes SET used_at = NOW() WHERE id = $1`,
    [row.id]
  );

  return { valid: true, userId: row.user_id };
}

export async function cleanupExpiredCodes(): Promise<void> {
  const pool = getPool();
  await pool.query(
    `DELETE FROM verification_codes WHERE expires_at < NOW() - INTERVAL '1 hour'`
  );
}
