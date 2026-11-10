import { NextRequest, NextResponse } from 'next/server';
import { runMarketCapture } from '@/lib/shippingMarket';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/shipping-market
 *
 * Records today's USD/CNY rate and one price observation per configured
 * carrier/forwarder page. Never writes shipping_rates directly: the owner
 * applies a value from the admin page after reviewing it.
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
    const result = await runMarketCapture();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(
      '[shipping-market] capture failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Capture failed' }, { status: 500 });
  }
}
