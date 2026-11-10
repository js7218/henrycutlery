import { NextRequest, NextResponse } from 'next/server';
import { runKnowledgeScan } from '@/lib/complianceFeed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/compliance-knowledge
 *
 * Verifies a rotating batch of countries against live search results. The
 * whole list is covered over a few days without exceeding the function limit.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authorization = request.headers.get('authorization');
    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET is not configured' },
      { status: 503 }
    );
  }

  const batch = Number(new URL(request.url).searchParams.get('batch') || 8);

  try {
    const result = await runKnowledgeScan(Number.isFinite(batch) ? batch : 8);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(
      '[compliance-knowledge] failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Verification failed' }, { status: 500 });
  }
}
