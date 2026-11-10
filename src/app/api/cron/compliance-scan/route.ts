import { NextRequest, NextResponse } from 'next/server';
import { runComplianceScan } from '@/lib/complianceFeed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/compliance-scan
 *
 * Reads the configured official pages once a day. A stricter rule is applied
 * automatically; a looser one is stored for the owner to confirm.
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

  try {
    const result = await runComplianceScan();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(
      '[compliance-scan] failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Scan failed' }, { status: 500 });
  }
}
