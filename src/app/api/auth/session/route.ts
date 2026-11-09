import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import {
  ACCESS_TOKEN_EXPIRY,
  REMEMBER_ME_EXPIRY,
  clearAuthCookies,
  createJWT,
  getAccessToken,
  getAuthUser,
  setAuthCookies,
  verifyJWT,
} from '@/lib/auth';
import { getUserById } from '@/lib/db';

export async function POST(request: Request) {
  await request.body?.cancel().catch(() => {});
  const response = NextResponse.json(
    { success: false, error: 'Session creation is not available from the client.', code: 'SESSION_POST_DISABLED' },
    { status: 405 }
  );
  response.headers.set('Allow', 'GET, DELETE');
  response.headers.set('Cache-Control', 'no-store');
  return response;
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

  const dbUser = await getUserById(authUser.id);
  if (!dbUser) {
    await clearAuthCookies();
    const response = NextResponse.json(
      { success: false, error: 'User not found', code: 'USER_NOT_FOUND' },
      { status: 401 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // Sliding session: when the access token is close to expiry, re-issue it so
  // an active customer is not signed out 15 minutes after logging in. A quiet
  // browser still expires on its own because no session check is made.
  const token = await getAccessToken();
  const decoded = token ? verifyJWT(token) : null;
  if (decoded && decoded.exp - Math.floor(Date.now() / 1000) < 5 * 60) {
    const maxAge = decoded.remember ? REMEMBER_ME_EXPIRY : ACCESS_TOKEN_EXPIRY;
    const renewed = createJWT(
      {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role === 'admin' ? 'admin' : 'user',
        remember: decoded.remember,
      },
      maxAge
    );
    await setAuthCookies(renewed, randomBytes(32).toString('hex'), maxAge);
  }

  const response = NextResponse.json({
    success: true,
    user: dbUser,
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
