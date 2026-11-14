import { NextRequest, NextResponse } from 'next/server';
import { runTariffScan } from '@/lib/tariffScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/tariff-scan
 *
 * Weekly check of the US and UK official tariff feeds for HS 8211.92/8211.93.
 * Changes are queued for owner approval; nothing is applied automatically.
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
    const result = await runTariffScan();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(
      '[tariff-scan] failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Tariff scan failed' }, { status: 500 });
  }
}
