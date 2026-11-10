import { NextRequest, NextResponse } from 'next/server';
import { COMPLIANCE_DISCLAIMER, getComplianceRule } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

/**
 * GET /api/compliance/rule?country=GB
 *
 * Public, read-only. Fails open: if the lookup breaks, checkout must keep
 * working, so the client simply sees no advisory.
 */
export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country') || '';

  try {
    const rule = await getComplianceRule(country);
    return NextResponse.json(
      {
        success: true,
        rule: rule ? { ...rule, disclaimer: COMPLIANCE_DISCLAIMER } : null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error(
      '[compliance-rule] lookup failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json(
      { success: true, rule: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
