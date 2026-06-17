import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createJWT, setAuthCookies } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { verifyCode } from '@/lib/verificationCode';
import { checkAuthAllowed, getClientIp, recordAuthFailure, resetAuthFailures } from '@/lib/authRateLimit';
import { sendTransactionalEmail } from '@/lib/orderEmail';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidInternationalPhone(phone: string) {
  return /^\+[1-9]\d{0,3}\s?[0-9][0-9\s().-]{5,30}$/.test(phone);
}

/**
 * POST /api/auth/login-with-code
 * Body: { type: 'email' | 'phone', identifier: string, code: string }
 *
 * Login with verification code. Validates the code, then logs the user in.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = body.type === 'phone' ? 'phone' : 'email';
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const clientIp = getClientIp(request);
    const ipRateKey = `login-code-ip:${clientIp}`;
    const idRateKey = `login-code-id:${identifier || 'unknown'}`;
    const ipAllowed = checkAuthAllowed(ipRateKey);
    const idAllowed = checkAuthAllowed(idRateKey);

    if (!ipAllowed.allowed || !idAllowed.allowed) {
      const retryAfterSeconds = Math.max(
        ipAllowed.retryAfterSeconds || 0,
        idAllowed.retryAfterSeconds || 0
      );
      return NextResponse.json(
        { success: false, error: 'Too many attempts, please try again later', code: 'AUTH_LOCKED', retryAfterSeconds },
        { status: 429 }
      );
    }

    // Validate inputs
    if (type === 'email') {
      if (!isValidEmail(identifier)) {
        recordAuthFailure(ipRateKey);
        recordAuthFailure(idRateKey);
        return NextResponse.json(
          { success: false, error: 'Incorrect email or verification code' },
          { status: 401 }
        );
      }
    } else {
      if (!isValidInternationalPhone(identifier)) {
        recordAuthFailure(ipRateKey);
        recordAuthFailure(idRateKey);
        return NextResponse.json(
          { success: false, error: 'Incorrect phone number or verification code' },
          { status: 401 }
        );
      }
    }

    if (!code || !/^\d{6}$/.test(code)) {
      recordAuthFailure(ipRateKey);
      recordAuthFailure(idRateKey);
      return NextResponse.json(
        { success: false, error: 'Invalid verification code format' },
        { status: 400 }
      );
    }

    await ensureDatabaseSchema();

    // Verify the code
    const verifyResult = await verifyCode(identifier, type, code);
    if (!verifyResult.valid) {
      recordAuthFailure(ipRateKey);
      recordAuthFailure(idRateKey);
      return NextResponse.json(
        { success: false, error: verifyResult.error || 'Incorrect verification code' },
        { status: 401 }
      );
    }

    // Find user by identifier
    let userQuery: string;
    let userParams: string[];
    if (type === 'email') {
      userQuery = `SELECT id, email, name, phone, password_hash, role, favorites, created_at FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1`;
      userParams = [identifier];
    } else {
      userQuery = `SELECT id, email, name, phone, password_hash, role, favorites, created_at FROM users WHERE REPLACE(phone, ' ', '') = REPLACE(REGEXP_REPLACE($1::text, '^\\+\\d{1,4}[\\s-]*', ''), ' ', '') AND deleted_at IS NULL LIMIT 1`;
      userParams = [identifier];
    }

    const result = await getPool().query(userQuery, userParams);
    const userRow = result.rows[0];

    if (!userRow) {
      recordAuthFailure(ipRateKey);
      recordAuthFailure(idRateKey);
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 401 }
      );
    }

    const role = userRow.role === 'admin' ? 'admin' : 'user';
    const accessToken = createJWT({ userId: userRow.id, email: userRow.email, role });
    const refreshToken = randomBytes(32).toString('hex');
    await setAuthCookies(accessToken, refreshToken);
    resetAuthFailures(ipRateKey);
    resetAuthFailures(idRateKey);

    // Record login history for multi-device detection
    const userAgent = request.headers.get('user-agent') || '';
    await getPool().query(
      `INSERT INTO login_history (id, user_id, ip, user_agent, login_method, created_at)
       VALUES ($1, $2, $3, $4, 'code', NOW())`,
      [crypto.randomUUID(), userRow.id, clientIp, userAgent]
    );

    // Check for new device/location and send alert
    await checkAndSendLoginAlert(userRow.id, clientIp, userAgent, userRow.email, userRow.phone);

    const response = NextResponse.json({
      success: true,
      user: await getUserById(userRow.id),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('[login-with-code] error', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Login failed, please try again later' },
      { status: 500 }
    );
  }
}

/**
 * Check if this is a new device/location and send security alert
 */
async function checkAndSendLoginAlert(
  userId: string,
  ip: string,
  userAgent: string,
  email: string,
  phone: string
): Promise<void> {
  try {
    // Get recent login history (last 30 days)
    const historyResult = await getPool().query(
      `SELECT ip, user_agent, created_at
       FROM login_history
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    // If this is the first login or same IP/UA, no alert needed
    if (historyResult.rows.length <= 1) return;

    const recentLogins = historyResult.rows.slice(1); // Exclude current login
    const isKnownDevice = recentLogins.some(
      (row) => row.ip === ip || row.user_agent === userAgent
    );

    if (!isKnownDevice) {
      // Mark as new device
      await getPool().query(
        `UPDATE login_history SET is_new_device = TRUE
         WHERE user_id = $1 AND ip = $2 AND user_agent = $3
         ORDER BY created_at DESC LIMIT 1`,
        [userId, ip, userAgent]
      );

      // Send email alert
      await sendTransactionalEmail({
        to: email,
        subject: 'Adam Cutlery - New Device Login Alert',
        html: `
          <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;max-width:480px;margin:0 auto;">
            <h2 style="color:#d32f2f;margin:0 0 12px;">New Device Login Alert</h2>
            <p>Your account was just logged in from a new device.</p>
            <table style="width:100%;background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;">
              <tr><td style="padding:4px 0;"><strong>IP Address:</strong></td><td>${ip}</td></tr>
              <tr><td style="padding:4px 0;"><strong>Device:</strong></td><td>${userAgent.slice(0, 100)}...</td></tr>
              <tr><td style="padding:4px 0;"><strong>Time:</strong></td><td>${new Date().toLocaleString('en-US')}</td></tr>
            </table>
            <p>If this was not you, please change your password immediately.</p>
          </div>
        `,
        text: `New device login alert: IP ${ip}, time ${new Date().toLocaleString('en-US')}. If this was not you, please change your password immediately.`,
      });

      // Mark alert as sent
      await getPool().query(
        `UPDATE login_history SET alert_sent = TRUE
         WHERE user_id = $1 AND ip = $2 AND user_agent = $3
         ORDER BY created_at DESC LIMIT 1`,
        [userId, ip, userAgent]
      );
    }
  } catch (err) {
    console.error('[login-alert] error', err instanceof Error ? err.message : 'Unknown error');
    // Don't fail login if alert fails
  }
}
