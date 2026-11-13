import { NextRequest, NextResponse } from 'next/server';
import { sendNextProductCampaign } from '@/lib/marketing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/new-product-campaign
 *
 * Announces at most one product per run to subscribers who opted in. Products
 * that were already in the catalogue when the feature launched are seeded as
 * announced, so only genuinely new items are emailed. Each subscriber receives
 * a given product at most once.
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
    const result = await sendNextProductCampaign();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error(
      '[marketing/campaign] failed:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Campaign failed' }, { status: 500 });
  }
}
