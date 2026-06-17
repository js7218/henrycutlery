import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createJWT, setAuthCookies } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { createVerificationCode } from '@/lib/verificationCode';
import { sendTransactionalEmail } from '@/lib/orderEmail';
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
 * For phone: returns code in response (since no SMS gateway configured).
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
        { success: false, error: '发送过于频繁，请稍后再试', retryAfterSeconds: allowed.retryAfterSeconds },
        { status: 429 }
      );
    }

    // Validate identifier
    if (type === 'email') {
      if (!isValidEmail(identifier)) {
        recordAuthFailure(rateKey);
        return NextResponse.json(
          { success: false, error: '邮箱格式不正确' },
          { status: 400 }
        );
      }
    } else {
      if (!isValidInternationalPhone(identifier)) {
        recordAuthFailure(rateKey);
        return NextResponse.json(
          { success: false, error: '手机号格式不正确，请包含国家区号' },
          { status: 400 }
        );
      }
    }

    await ensureDatabaseSchema();

    // Check if user exists
    let userQuery: string;
    let userParams: string[];
    if (type === 'email') {
      userQuery = `SELECT id, email, name, phone FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1`;
      userParams = [identifier];
    } else {
      userQuery = `SELECT id, email, name, phone FROM users WHERE phone = $1 AND deleted_at IS NULL LIMIT 1`;
      userParams = [identifier];
    }

    const userResult = await getPool().query(userQuery, userParams);
    const userRow = userResult.rows[0];

    // SECURITY: Always return success even if user doesn't exist to prevent enumeration
    // But don't actually send code if user doesn't exist
    if (!userRow) {
      // Return fake success to prevent user enumeration
      return NextResponse.json(
        { success: true, message: '验证码已发送，请查收', expiresIn: 60 },
        { status: 200 }
      );
    }

    // Create verification code
    const codeResult = await createVerificationCode(identifier, type, ip);
    if (!codeResult) {
      return NextResponse.json(
        { success: false, error: '发送过于频繁，请60秒后再试' },
        { status: 429 }
      );
    }

    const { code, expiresAt } = codeResult;

    // Send code
    if (type === 'email') {
      const emailResult = await sendTransactionalEmail({
        to: identifier,
        subject: 'Adam Cutlery - 登录验证码',
        html: `
          <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;max-width:480px;margin:0 auto;">
            <h2 style="margin:0 0 12px;">登录验证码</h2>
            <p>您好，</p>
            <p>您正在尝试登录 Adam Cutlery 账户。您的验证码是：</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:4px;padding:16px;background:#f5f5f5;border-radius:8px;text-align:center;margin:16px 0;">${code}</p>
            <p>此验证码将在 <strong>1 分钟</strong> 后过期，请勿泄露给他人。</p>
            <p style="color:#999;font-size:12px;margin-top:24px;">如非本人操作，请忽略此邮件。</p>
          </div>
        `,
        text: `登录验证码：${code}，1分钟后过期。如非本人操作请忽略。`,
      });

      if (!emailResult.sent && !emailResult.skipped) {
        return NextResponse.json(
          { success: false, error: '邮件发送失败，请稍后再试' },
          { status: 500 }
        );
      }
    }

    // For phone, we return the code in response (no SMS gateway configured)
    // In production, integrate with SMS provider (Twilio, AWS SNS, etc.)
    const response: Record<string, unknown> = {
      success: true,
      message: '验证码已发送，请查收',
      expiresIn: 60,
    };

    // DEV ONLY: include code in response for phone login testing
    // REMOVE IN PRODUCTION - integrate real SMS gateway
    if (type === 'phone') {
      response.code = code;
      response._devNote = 'SMS gateway not configured. Code included for testing only.';
    }

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[send-code] error', err);
    return NextResponse.json(
      { success: false, error: '发送失败，请稍后再试' },
      { status: 500 }
    );
  }
}
