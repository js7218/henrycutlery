import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUserById } from '@/lib/db';
import { isAdminPinConfigured, isAdminPinVerified } from '@/lib/adminPin';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// ============================================================================
// Admin IP Whitelist
// ============================================================================

function getAdminIPWhitelist(): string[] {
  const env = process.env.ADMIN_IP_WHITELIST || '';
  return env
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);
}

export function isAdminIPWhitelisted(ip: string): boolean {
  const whitelist = getAdminIPWhitelist();
  if (whitelist.length === 0) {
    // If no whitelist is configured, allow all IPs (fallback to TOTP)
    return false;
  }
  return whitelist.includes(ip);
}

// ============================================================================
// TOTP (Time-based One-Time Password) Implementation
// Uses a simplified HOTP/TOTP algorithm compatible with authenticator apps
// ============================================================================

const TOTP_DIGITS = 6;
const TOTP_STEP = 30; // 30-second window
const TOTP_ALGORITHM = 'sha1';

function base32Decode(encoded: string): Buffer {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of encoded.toUpperCase().replace(/=+$/, '')) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function base32Encode(buffer: Buffer): string {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let encoded = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    encoded += base32Chars[parseInt(bits.slice(i, i + 5), 2)];
  }
  // Pad to multiple of 8
  while (encoded.length % 8 !== 0) {
    encoded += '=';
  }
  return encoded;
}

function generateTOTPSecret(): string {
  return base32Encode(randomBytes(20));
}

function generateTOTP(secret: string, timestamp: number = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / TOTP_STEP);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = createHmac(TOTP_ALGORITHM, key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (code % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, '0');
  return otp;
}

function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  if (!/^[0-9]{6}$/.test(token)) return false;

  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const expected = generateTOTP(secret, now + i * TOTP_STEP * 1000);
    if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

function getTOTPSecretEnvKey(userId: string): string {
  return `ADMIN_TOTP_SECRET_${userId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function getTOTPBackupCodesEnvKey(userId: string): string {
  return `ADMIN_TOTP_BACKUP_${userId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export function generateAdminTOTPSecret(userId: string): { secret: string; qrCodeUri: string } {
  const secret = generateTOTPSecret();
  // In production, store this securely (e.g., encrypted in database or env var)
  // For now, we return it for the caller to store
  const issuer = 'AdamCutlery';
  const accountName = `admin@${userId}`;
  const qrCodeUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;

  return { secret, qrCodeUri };
}

export function verifyAdminTOTP(userId: string, token: string): boolean {
  const envKey = getTOTPSecretEnvKey(userId);
  const secret = process.env[envKey];
  if (!secret) return false;
  return verifyTOTP(secret, token);
}

export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

// In-memory store for verified TOTP sessions (use Redis in production)
const totpVerifiedSessions = new Map<string, { verifiedAt: number; expiresAt: number }>();
const TOTP_SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export async function setAdminTOTPSession(userId: string): Promise<void> {
  const now = Date.now();
  totpVerifiedSessions.set(userId, {
    verifiedAt: now,
    expiresAt: now + TOTP_SESSION_DURATION_MS,
  });
}

export async function clearAdminTOTPSession(userId: string): Promise<void> {
  totpVerifiedSessions.delete(userId);
}

export async function isAdminTOTPVerified(userId: string): Promise<boolean> {
  const session = totpVerifiedSessions.get(userId);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    totpVerifiedSessions.delete(userId);
    return false;
  }
  return true;
}

// ============================================================================
// Admin Guard with MFA & IP Whitelist
// ============================================================================

/**
 * Server-side admin guard with MFA and IP whitelist.
 * We never trust the client role flag - the JWT in the cookie is verified,
 * then the role is looked up again from Postgres so a tampered cookie can't
 * escalate privileges.
 *
 * Returns either a denial NextResponse (401/403) or the verified user.
 */
export async function requireAdmin():
  Promise<{ user: { id: string; email: string; name: string; role: 'admin' } } | { response: NextResponse }> {
  const session = await getAuthUser();
  if (!session) {
    return {
      response: NextResponse.json(
        { success: false, error: 'Please log in with an admin account first', code: 'AUTH_REQUIRED' },
        { status: 401 }
      ),
    };
  }

  const dbUser = await getUserById(session.id);
  if (!dbUser || dbUser.role !== 'admin') {
    return {
      response: NextResponse.json(
        { success: false, error: 'Admin privileges required', code: 'FORBIDDEN' },
        { status: 403 }
      ),
    };
  }

  if (!isAdminPinConfigured()) {
    return {
      response: NextResponse.json(
        { success: false, error: 'Admin PIN is not configured.', code: 'ADMIN_PIN_NOT_CONFIGURED' },
        { status: 403 }
      ),
    };
  }

  if (!(await isAdminPinVerified(dbUser.id))) {
    return {
      response: NextResponse.json(
        { success: false, error: 'Admin PIN verification required.', code: 'ADMIN_PIN_REQUIRED' },
        { status: 403 }
      ),
    };
  }

  // Check IP whitelist and TOTP
  // In middleware context, we can't easily get IP here, so TOTP check is done
  // via a separate endpoint. The requireAdmin function checks if TOTP is verified.
  if (!(await isAdminTOTPVerified(dbUser.id))) {
    return {
      response: NextResponse.json(
        { success: false, error: 'Admin MFA (TOTP) verification required.', code: 'ADMIN_TOTP_REQUIRED' },
        { status: 403 }
      ),
    };
  }

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: 'admin',
    },
  };
}

/**
 * Check if admin access is allowed for a request, considering IP whitelist.
 * If IP is whitelisted, TOTP is optional. If not, TOTP is required.
 */
export async function checkAdminAccess(
  userId: string,
  clientIp: string
): Promise<{ allowed: boolean; requiresTOTP: boolean; reason?: string }> {
  if (isAdminIPWhitelisted(clientIp)) {
    return { allowed: true, requiresTOTP: false };
  }

  const totpVerified = await isAdminTOTPVerified(userId);
  if (!totpVerified) {
    return { allowed: false, requiresTOTP: true, reason: 'IP_NOT_WHITELISTED_TOTP_REQUIRED' };
  }

  return { allowed: true, requiresTOTP: true };
}

// ============================================================================
// Exports
// ============================================================================

export const adminGuard = {
  requireAdmin,
  checkAdminAccess,
  isAdminIPWhitelisted,
  generateAdminTOTPSecret,
  verifyAdminTOTP,
  setAdminTOTPSession,
  clearAdminTOTPSession,
  isAdminTOTPVerified,
  generateBackupCodes,
};

export default adminGuard;
