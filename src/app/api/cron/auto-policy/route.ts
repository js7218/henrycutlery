import { NextRequest, NextResponse } from 'next/server';
import {
  autoApplyMarketRates,
  getAutomationSettings,
  saveAutomationSettings,
} from '@/lib/shippingMarket';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * TEMPORARY. Turns the freight auto-update policy on
 * (quiet 5%, review 15%, margin 15%) and runs one apply pass so the owner can
 * see what would change. Removed immediately after use.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const saved = await saveAutomationSettings({
    autoApplyEnabled: true,
    quietPct: 5,
    reviewPct: 15,
    marginPct: 15,
  });
  if (!saved) {
    return NextResponse.json({ success: false, error: 'Invalid settings' }, { status: 400 });
  }

  const outcome = await autoApplyMarketRates();
  return NextResponse.json({ success: true, settings: await getAutomationSettings(), outcome });
}
