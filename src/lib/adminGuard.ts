import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUserById } from '@/lib/db';
import { isAdminPinConfigured, isAdminPinVerified } from '@/lib/adminPin';

/**
 * Server-side admin guard. We never trust the client role flag - the JWT in
 * the cookie is verified, then the role is looked up again from Postgres so
 * a tampered cookie can't escalate privileges.
 *
 * Returns either a denial NextResponse (401/403) or the verified user.
 */
export async function requireAdmin():
  Promise<{ user: { id: string; email: string; name: string; role: 'admin' } } | { response: NextResponse }> {
  const session = await getAuthUser();
  if (!session) {
    return {
      response: NextResponse.json(
        { success: false, error: '请先登录管理员账号', code: 'AUTH_REQUIRED' },
        { status: 401 }
      ),
    };
  }

  const dbUser = await getUserById(session.id);
  if (!dbUser || dbUser.role !== 'admin') {
    return {
      response: NextResponse.json(
        { success: false, error: '没有管理员权限', code: 'FORBIDDEN' },
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

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: 'admin',
    },
  };
}
