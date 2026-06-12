import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUserById } from '@/lib/db';
import {
  clearAdminPinCookie,
  isAdminPinConfigured,
  isAdminPinVerified,
  setAdminPinCookie,
  verifyAdminPin,
} from '@/lib/adminPin';

async function getAdminUser() {
  const session = await getAuthUser();
  if (!session) {
    return { response: NextResponse.json({ success: false, error: 'Please sign in first.' }, { status: 401 }) };
  }

  const user = await getUserById(session.id);
  if (!user || user.role !== 'admin') {
    return { response: NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 403 }) };
  }

  return { user };
}

export async function GET() {
  const result = await getAdminUser();
  if ('response' in result) return result.response;

  return NextResponse.json({
    success: true,
    configured: isAdminPinConfigured(),
    verified: await isAdminPinVerified(result.user.id),
  });
}

export async function POST(request: Request) {
  const result = await getAdminUser();
  if ('response' in result) return result.response;

  if (!isAdminPinConfigured()) {
    return NextResponse.json(
      { success: false, error: 'ADMIN_PANEL_PIN is not configured in Vercel.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const pin = String(body?.pin || '').trim();

  if (!verifyAdminPin(pin)) {
    await clearAdminPinCookie();
    return NextResponse.json(
      { success: false, error: 'Invalid admin PIN.' },
      { status: 403 }
    );
  }

  await setAdminPinCookie(result.user.id);
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  await clearAdminPinCookie();
  return NextResponse.json({ success: true });
}
