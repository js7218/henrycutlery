import { NextRequest, NextResponse } from 'next/server';
import { subscribeToMarketing } from '@/lib/marketing';
import { consumeRateLimit } from '@/lib/rateLimit';
import { ensureDatabaseSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/marketing/subscribe
 * Records an explicit opt-in for new-arrival emails.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 200) : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }
    if (body?.consent !== true) {
      return NextResponse.json(
        { success: false, error: 'Please confirm that you want to receive new-arrival emails.' },
        { status: 400 }
      );
    }

    await ensureDatabaseSchema();
    const forwarded = request.headers.get('x-forwarded-for') || '';
    const ip = forwarded.split(',')[0].trim() || 'unknown';
    const limit = await consumeRateLimit(`marketing:subscribe:${ip}`, 5, 60 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const result = await subscribeToMarketing({
      email,
      source: typeof body?.source === 'string' ? body.source : 'popup',
      ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({
      success: true,
      email: result.email,
      alreadySubscribed: result.alreadySubscribed,
      message: result.alreadySubscribed
        ? 'You are already on the list.'
        : 'Thanks — we will email you when something new arrives.',
    });
  } catch (err) {
    console.error(
      '[marketing/subscribe] failed:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    return NextResponse.json(
      { success: false, error: 'Could not save your email. Please try again.' },
      { status: 500 }
    );
  }
}
