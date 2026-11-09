import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { createVerificationCode, type VerificationPurpose } from '@/lib/verificationCode';
import { sendTransactionalEmail } from '@/lib/orderEmail';
import { sendSMS } from '@/lib/sms';
import { getClientIp } from '@/lib/authRateLimit';
import { consumeRateLimit } from '@/lib/rateLimit';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidInternationalPhone(phone: string) {
  return /^\+[1-9]\d{0,3}\s?[0-9][0-9\s().-]{5,30}$/.test(phone);
}

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_LIMIT = 3;
const PHONE_LIMIT = 3;
const IP_LIMIT = 10;

function parsePurpose(value: unknown): VerificationPurpose {
  if (value === 'register' || value === 'reset') return value;
  return 'login';
}

/**
 * POST /api/auth/send-code
 * Body: { type: 'email' | 'phone', identifier: string, purpose?: 'login' | 'register' | 'reset' }
 *
 * Sends a 6-digit verification code by email (SMTP) or SMS (Twilio).
 *
 * Rate limits (database-backed, shared across serverless instances):
 *   - same email/phone: max 3 per hour
 *   - same IP: max 10 per hour
 *
 * purpose=register: the code is sent even when the account does not exist yet.
 * If the account already exists we return a clear "already registered" error.
 * purpose=login/reset: codes are only sent to registered accounts, which stops
 * attackers from using the endpoint to bomb arbitrary phone numbers.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = body.type === 'phone' ? 'phone' : 'email';
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
    const purpose = parsePurpose(body.purpose);
    const ip = getClientIp(request);

    // Validate identifier before touching any counters.
    if (type === 'email') {
      if (!isValidEmail(identifier)) {
        return NextResponse.json(
          { success: false, error: 'Invalid email format' },
          { status: 400 }
        );
      }
    } else {
      if (!isValidInternationalPhone(identifier)) {
        return NextResponse.json(
          { success: false, error: 'Invalid phone format. Please include country code' },
          { status: 400 }
        );
      }
    }

    await ensureDatabaseSchema();

    // Three-dimensional rate limiting: identifier, channel, and source IP.
    const identifierKey = `send-code:${type}:${identifier}`;
    const ipKey = `send-code:ip:${ip}`;
    const identifierLimit = type === 'email' ? EMAIL_LIMIT : PHONE_LIMIT;

    const [identifierLimitResult, ipLimitResult] = await Promise.all([
      consumeRateLimit(identifierKey, identifierLimit, RATE_WINDOW_MS),
      consumeRateLimit(ipKey, IP_LIMIT, RATE_WINDOW_MS),
    ]);

    if (!identifierLimitResult.allowed || !ipLimitResult.allowed) {
      const retryAfterSeconds = Math.max(
        identifierLimitResult.retryAfterSeconds,
        ipLimitResult.retryAfterSeconds
      );
      return NextResponse.json(
        { success: false, error: 'Too many requests, please try again later', retryAfterSeconds },
        { status: 429 }
      );
    }

    // Look up whether this identifier belongs to an account.
    const userResult = await getPool().query(
      type === 'email'
        ? `SELECT id, email, phone FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1`
        : `SELECT id, email, phone FROM users WHERE REPLACE(phone, ' ', '') = REPLACE(REGEXP_REPLACE($1::text, '^\\+\\d{1,3}[\\s-]+', ''), ' ', '') AND deleted_at IS NULL LIMIT 1`,
      [identifier]
    );
    const userRow = userResult.rows[0];

    if (purpose === 'register') {
      // Registration codes are only useful for new accounts. If the account
      // already exists, tell the customer to sign in or reset instead of
      // silently sending another code.
      if (userRow) {
        return NextResponse.json(
          {
            success: false,
            code: type === 'email' ? 'EMAIL_ALREADY_REGISTERED' : 'PHONE_ALREADY_REGISTERED',
            error: type === 'email'
              ? 'This email is already registered. Please sign in or reset your password.'
              : 'This phone number is already registered. Please sign in or reset your password.',
          },
          { status: 409 }
        );
      }
    } else if (!userRow) {
      // Login/reset codes: never send to identifiers without an account.
      // Return a generic success to avoid leaking which accounts exist.
      return NextResponse.json({ success: true, message: 'Verification code sent' }, { status: 200 });
    }

    const codeResult = await createVerificationCode(identifier, type, ip, purpose);
    if (!codeResult) {
      return NextResponse.json(
        { success: false, error: 'Please wait 60 seconds before requesting another code' },
        { status: 429 }
      );
    }

    const { code } = codeResult;

    if (type === 'email') {
      const emailResult = await sendTransactionalEmail({
        to: identifier,
        subject: purpose === 'register'
          ? 'Adam Cutlery - Verify Your Email'
          : 'Adam Cutlery - Login Verification Code',
        html: `
          <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;max-width:480px;margin:0 auto;">
            <h2 style="margin:0 0 12px;">${purpose === 'register' ? 'Verify Your Email' : 'Login Verification Code'}</h2>
            <p>Hello,</p>
            <p>${purpose === 'register'
              ? 'Your verification code to finish creating your Adam Cutlery account is:'
              : 'You are trying to log in to your Adam Cutlery account. Your verification code is:'}</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:4px;padding:16px;background:#f5f5f5;border-radius:8px;text-align:center;margin:16px 0;">${code}</p>
            <p>This code will expire in <strong>10 minutes</strong>. Do not share it with anyone.</p>
            <p style="color:#999;font-size:12px;margin-top:24px;">If you did not request this, please ignore this email.</p>
          </div>
        `,
        text: `Verification code: ${code}, expires in 10 minutes. If you did not request this, please ignore.`,
      });

      if (!emailResult.sent && !emailResult.skipped) {
        return NextResponse.json(
          { success: false, error: 'Failed to send email, please try again later' },
          { status: 500 }
        );
      }
    } else {
      const smsResult = await sendSMS(identifier, `Your Adam Cutlery verification code is: ${code}. Valid for 10 minutes.`);
      if (!smsResult.success) {
        return NextResponse.json(
          { success: false, error: 'SMS service is not configured. Please contact support or use email login.' },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({ success: true, message: 'Verification code sent', expiresIn: 600 }, { status: 200 });
  } catch (err) {
    console.error('[send-code] error', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Failed to send, please try again later' },
      { status: 500 }
    );
  }
}
