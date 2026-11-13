import { NextRequest, NextResponse } from 'next/server';
import { unsubscribeByToken } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

/** GET /api/marketing/unsubscribe?token=... — one click, no login needed. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  try {
    const ok = await unsubscribeByToken(token);
    return NextResponse.json(
      ok
        ? { success: true, message: 'You have been removed from the new-arrival list.' }
        : { success: false, message: 'This unsubscribe link is invalid or already used.' },
      { status: ok ? 200 : 400 }
    );
  } catch (err) {
    console.error(
      '[marketing/unsubscribe] failed:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    return NextResponse.json(
      { success: false, message: 'Could not process the request. Please contact us.' },
      { status: 500 }
    );
  }
}
