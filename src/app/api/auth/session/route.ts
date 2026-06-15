import { NextResponse } from 'next/server';
import { clearAuthCookies, getAuthUser } from '@/lib/auth';
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
