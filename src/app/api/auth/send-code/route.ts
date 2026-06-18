import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createJWT, setAuthCookies } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { createVerificationCode } from '@/lib/verificationCode';
import { sendTransactionalEmail } from '@/lib/orderEmail';
import { sendSMS } from '@/lib/sms';
import { checkAuthAllowed, getClientIp, recordAuthFailure } from '@/lib/authRateLimit';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidInternationalPhone(phone: string) {
  return /^\+[1-9]\d{0,3}\s?[0-9][0-9\s().-]{5,30}$/.test(phone);
}

/**
 * POST /api/auth/send-code
 * Body: { type: 'email' | 'phone', identifier: string }
 *
 * Sends a 6-digit verification code to the user's email or phone.
 * For email: sends via SMTP.
 * For phone: sends via Twilio SMS.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = body.type === 'phone' ? 'phone' : 'email';
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
    const ip = getClientIp(request);
    const rateKey = `send-code:${ip}:${identifier || 'unknown'}`;
    const allowed = checkAuthAllowed(rateKey);

    if (!allowed.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests, please try again later', retryAfterSeconds: allowed.retryAfterSeconds },
        { status: 429 }
      );
    }

    // Validate identifier
    if (type === 'email') {
      if (!isValidEmail(identifier)) {
        recordAuthFailure(rateKey);
        return NextResponse.json(
          { success: false, error: 'Invalid email format' },
          { status: 400 }
        );
      }
    } else {
      if (!isValidInternationalPhone(identifier)) {
        recordAuthFailure(rateKey);
        return NextResponse.json(
          { success: false, error: 'Invalid phone format. Please include country code' },
          { status: 400 }
        );
      }
    }

    await ensureDatabaseSchema();

    // Create verification code BEFORE checking user existence
    // This ensures the code is available for phone-type dev responses even if user doesn't exist
    const codeResult = await createVerificationCode(identifier, type, ip);
    if (!codeResult) {
      return NextResponse.json(
        { success: false, error: 'Please wait 60 seconds before requesting another code' },
        { status: 429 }
      );
    }

    const { code, expiresAt } = codeResult;

    // Check if user exists
    let userQuery: string;
    let userParams: string[];
    if (type === 'email') {
      userQuery = `SELECT id, email, name, phone FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1`;
      userParams = [identifier];
    } else {
      userQuery = `SELECT id, email, name, phone FROM users WHERE REPLACE(phone, ' ', '') = REPLACE(REGEXP_REPLACE($1::text, '^\\+\\d{1,4}[\\s-]*', ''), ' ', '') AND deleted_at IS NULL LIMIT 1`;
      userParams = [identifier];
    }

    const userResult = await getPool().query(userQuery, userParams);
    const userRow = userResult.rows[0];

    // SECURITY: Always return success even if user doesn't exist to prevent enumeration
    // But don't actually send email if user doesn't exist
    if (!userRow) {
      if (type === 'phone') {
        const smsResult = await sendSMS(identifier, `Your Adam Cutlery verification code is: ${code}. Valid for 1 minute.`);
        if (!smsResult.success) {
          return NextResponse.json(
            { success: false, error: 'SMS service is not configured. Please contact support or use email login.' },
            { status: 503 }
          );
        }
      }
      // For email type, return fake success to prevent user enumeration
      return NextResponse.json({ success: true, message: 'Verification code sent' }, { status: 200 });
    }

    // Send code
    if (type === 'email') {
      const emailResult = await sendTransactionalEmail({
        to: identifier,
        subject: 'Adam Cutlery - Login Verification Code',
        html: `
          <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;max-width:480px;margin:0 auto;">
            <h2 style="margin:0 0 12px;">Login Verification Code</h2>
            <p>Hello,</p>
            <p>You are trying to log in to your Adam Cutlery account. Your verification code is:</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:4px;padding:16px;background:#f5f5f5;border-radius:8px;text-align:center;margin:16px 0;">${code}</p>
            <p>This code will expire in <strong>1 minute</strong>. Do not share it with anyone.</p>
            <p style="color:#999;font-size:12px;margin-top:24px;">If you did not request this, please ignore this email.</p>
          </div>
        `,
        text: `Login verification code: ${code}, expires in 1 minute. If you did not request this, please ignore.`,
      });

      if (!emailResult.sent && !emailResult.skipped) {
        return NextResponse.json(
          { success: false, error: 'Failed to send email, please try again later' },
          { status: 500 }
        );
      }
    }

    // Send code via SMS for phone type
    if (type === 'phone') {
      const smsResult = await sendSMS(identifier, `Your Adam Cutlery verification code is: ${code}. Valid for 1 minute.`);
      if (!smsResult.success) {
        return NextResponse.json(
          { success: false, error: 'SMS service is not configured. Please contact support or use email login.' },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({ success: true, message: 'Verification code sent', expiresIn: 60 }, { status: 200 });
  } catch (err) {
    console.error('[send-code] error', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Failed to send, please try again later' },
      { status: 500 }
    );
  }
}
