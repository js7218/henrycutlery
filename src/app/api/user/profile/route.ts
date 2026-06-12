import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getPool, getUserById } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { detectInputThreat } from '@/lib/inputThreatCheck';
import {
  checkSensitiveAllowed,
  getClientIp,
  recordSensitiveFailure,
  resetSensitiveFailures,
} from '@/lib/sensitiveRateLimit';

function cleanText(value: unknown, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validName(name: string) {
  return name.length >= 2 && name.length <= 100;
}

function validPhone(phone: string) {
  return phone === '' || /^[0-9+\-\s()]{6,20}$/.test(phone);
}

export async function PATCH(request: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Please sign in first.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body.action, 40);
    const ip = getClientIp(request);

    if (action === 'profile') {
      const name = cleanText(body.name, 100);
      const phone = cleanText(body.phone, 20);
      const nameThreat = detectInputThreat(name);
      const phoneThreat = detectInputThreat(phone);

      if (!validName(name)) {
        return NextResponse.json(
          { success: false, error: 'Username must be 2-100 characters.' },
          { status: 400 }
        );
      }

      if (!nameThreat.safe || !phoneThreat.safe) {
        return NextResponse.json(
          { success: false, error: 'Account information contains unsafe content.' },
          { status: 400 }
        );
      }

      if (!validPhone(phone)) {
        return NextResponse.json(
          { success: false, error: 'Please enter a valid phone number.' },
          { status: 400 }
        );
      }

      await getPool().query(
        'UPDATE users SET name = $1, phone = $2, updated_at = NOW() WHERE id = $3 AND deleted_at IS NULL',
        [name, phone, authUser.id]
      );

      return NextResponse.json({ success: true, user: await getUserById(authUser.id) });
    }

    if (action === 'password') {
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      const limitKey = `password-change:${authUser.id}:${ip}`;
      const allowed = checkSensitiveAllowed(limitKey);

      if (!allowed.allowed) {
        return NextResponse.json(
          { success: false, error: 'Too many failed password attempts. Please try again later.', retryAfterSeconds: allowed.retryAfterSeconds },
          { status: 429 }
        );
      }

      if (!currentPassword || newPassword.length < 8 || newPassword.length > 128) {
        return NextResponse.json(
          { success: false, error: 'Please enter the current password and a new password of 8-128 characters.' },
          { status: 400 }
        );
      }

      const currentThreat = detectInputThreat(currentPassword);
      const newThreat = detectInputThreat(newPassword);
      if (!currentThreat.safe || !newThreat.safe) {
        recordSensitiveFailure(limitKey, {
          maxFailures: 8,
          windowMs: 15 * 60 * 1000,
          lockMs: 15 * 60 * 1000,
        });
        return NextResponse.json(
          { success: false, error: 'Password contains unsafe content.' },
          { status: 400 }
        );
      }

      const result = await getPool().query(
        'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [authUser.id]
      );
      const row = result.rows[0];

      if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
        const failure = recordSensitiveFailure(limitKey, {
          maxFailures: 8,
          windowMs: 15 * 60 * 1000,
          lockMs: 15 * 60 * 1000,
        });
        if (!failure.allowed) {
          return NextResponse.json(
            { success: false, error: 'Too many failed password attempts. Please try again later.', retryAfterSeconds: failure.retryAfterSeconds },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { success: false, error: 'Current password is incorrect.' },
          { status: 401 }
        );
      }

      const newHash = await hashPassword(newPassword);
      await getPool().query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
        [newHash, authUser.id]
      );
      resetSensitiveFailures(limitKey);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Invalid update action.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Profile update failed.' },
      { status: 500 }
    );
  }
}
