import { NextRequest, NextResponse } from 'next/server';
import { runFreightQuoteScan } from '@/lib/freightQuoteScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/freight-quotes?batch=6&countries=US,GB
 * Captures public per-kg parcel quotes for a rotating batch of destinations.
 * Read-only: it never changes a shipping rate.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET is not configured' },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const batch = Number(url.searchParams.get('batch') || 6);
  const only = (url.searchParams.get('countries') || '')
    .split(',')
    .map((code) => code.trim().toUpperCase().slice(0, 2))
    .filter((code) => /^[A-Z]{2}$/.test(code));

  try {
    const result = await runFreightQuoteScan(Number.isFinite(batch) ? batch : 6, only);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(
      '[freight-quotes] failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Capture failed' }, { status: 500 });
  }
}
