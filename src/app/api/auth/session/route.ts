import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createJWT, setAuthCookies, clearAuthCookies, getAuthUser } from '@/lib/auth';

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

    const response = NextResponse.json({ success: true });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    const response = NextResponse.json(
      { success: false, error: 'Failed to create login session', code: 'SESSION_FAILED' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    const response = NextResponse.json(
      { success: false, error: 'Not authenticated', code: 'NOT_AUTHENTICATED' },
      { status: 401 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const response = NextResponse.json({
    success: true,
    user: {
      id: authUser.id,
      email: authUser.email,
      name: authUser.email.split('@')[0],
      role: authUser.role === 'admin' ? 'admin' : 'user',
      addresses: [],
      orders: [],
      favorites: [],
      createdAt: new Date().toISOString(),
    },
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function DELETE() {
  await clearAuthCookies();
  const response = NextResponse.json({ success: true });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
