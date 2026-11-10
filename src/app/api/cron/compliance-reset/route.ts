import { NextRequest, NextResponse } from 'next/server';
import { updateComplianceRule } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

// One-off cleanup: these rows were applied by an earlier scan that accepted
// blog / third-country sources. Temporary route — removed after it runs.
const RESET: Record<string, string> = {
  IT: 'Italy',
  ES: 'Spain',
  AT: 'Austria',
  DK: 'Denmark',
  NO: 'Norway',
  GR: 'Greece',
  RU: 'Russia',
  PK: 'Pakistan',
};

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET missing' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const reset: string[] = [];
  for (const [countryCode, countryName] of Object.entries(RESET)) {
    const rule = await updateComplianceRule({
      countryCode,
      countryName,
      riskLevel: 'none',
      restrictedTypes: '',
      message: '',
      sourceUrl: '',
      enabled: true,
      manualOverride: false,
    });
    if (rule) reset.push(countryCode);
  }

  return NextResponse.json({ success: true, reset });
}
