import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createJWT, setAuthCookies, clearAuthCookies } from '@/lib/auth';

type SessionPayload = {
  userId?: string;
  email?: string;
  role?: 'user' | 'admin';
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SessionPayload;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body.role === 'admin' ? 'admin' : 'user';

    if (!userId || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid login session', code: 'INVALID_SESSION' },
        { status: 400 }
      );
    }

    const accessToken = createJWT({ userId, email, role });
    const refreshToken = randomBytes(32).toString('hex');
    await setAuthCookies(accessToken, refreshToken);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to create login session', code: 'SESSION_FAILED' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  await clearAuthCookies();
  return NextResponse.json({ success: true });
}
