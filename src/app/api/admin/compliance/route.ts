import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { listComplianceRules, updateComplianceRule } from '@/lib/compliance';
import { listScanChanges, listScanSources, runComplianceScan, runKnowledgeScan } from '@/lib/complianceFeed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/admin/compliance — every rule plus the automatic scan state. */
export async function GET() {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const [rules, sources, changes] = await Promise.all([
      listComplianceRules(),
      listScanSources(),
      listScanChanges(20),
    ]);
    return NextResponse.json({ success: true, rules, sources, changes });
  } catch (error) {
    console.error(
      '[admin-compliance] list failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Failed to load rules' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/compliance
 * Body: { countryCode, countryName?, riskLevel, restrictedTypes?, message?, sourceUrl?, enabled? }
 */
export async function PUT(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.countryCode !== 'string') {
      return NextResponse.json({ success: false, error: 'countryCode is required' }, { status: 400 });
    }

    const rule = await updateComplianceRule({
      countryCode: body.countryCode,
      countryName: body.countryName,
      riskLevel: body.riskLevel,
      restrictedTypes: body.restrictedTypes,
      message: body.message,
      sourceUrl: body.sourceUrl,
      enabled: body.enabled,
    });
    if (!rule) {
      return NextResponse.json({ success: false, error: 'Invalid country code' }, { status: 400 });
    }

    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error(
      '[admin-compliance] save failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Failed to save rule' }, { status: 500 });
  }
}

/** POST /api/admin/compliance — runs a scan now; body { mode: 'knowledge' } verifies a country batch. */
export async function POST(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  const body = await request.json().catch(() => null);

  try {
    if (body?.mode === 'knowledge') {
      const batch = Number(body?.batch);
      const result = await runKnowledgeScan(Number.isFinite(batch) ? batch : 8);
      return NextResponse.json({ success: true, mode: 'knowledge', ...result });
    }

    const result = await runComplianceScan();
    return NextResponse.json({ success: true, mode: 'official', ...result });
  } catch (error) {
    console.error(
      '[admin-compliance] scan failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Scan failed' }, { status: 500 });
  }
}
