import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/adminGuard';

/**
 * GET  /api/admin/shipping/tariff-changes  -> pending official-source changes
 * POST /api/admin/shipping/tariff-changes  -> { id, action: 'apply' | 'dismiss' }
 */
export async function GET() {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    await ensureDatabaseSchema();
    const pool = getPool();
    const rows = await pool.query(
      `SELECT id, country_code, current_duty_pct, proposed_duty_pct,
              source_url, note, created_at
       FROM tariff_scan_changes
       WHERE status = 'pending'
       ORDER BY created_at DESC
       LIMIT 50`
    );
    return NextResponse.json({
      success: true,
      changes: rows.rows.map((row) => ({
        id: row.id,
        countryCode: row.country_code,
        currentDutyPct: Number(row.current_duty_pct),
        proposedDutyPct: Number(row.proposed_duty_pct),
        sourceUrl: row.source_url,
        note: row.note,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('[admin-tariff-changes] load failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to load tariff changes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    const action = body?.action === 'apply' ? 'apply' : body?.action === 'dismiss' ? 'dismiss' : '';
    if (!id || !action) {
      return NextResponse.json({ success: false, error: 'id and action are required' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const pool = getPool();
    const change = await pool.query(
      `SELECT id, country_code, proposed_duty_pct
       FROM tariff_scan_changes WHERE id = $1 AND status = 'pending'`,
      [id]
    );
    if (change.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Change not found or already handled' }, { status: 404 });
    }

    if (action === 'apply') {
      const row = change.rows[0];
      await pool.query(
        `UPDATE country_tax_rates
         SET duty_pct = $2, updated_at = NOW()
         WHERE country_code = $1`,
        [row.country_code, Number(row.proposed_duty_pct)]
      );
    }

    await pool.query(
      `UPDATE tariff_scan_changes SET status = $2, resolved_at = NOW() WHERE id = $1`,
      [id, action === 'apply' ? 'applied' : 'dismissed']
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin-tariff-changes] save failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to update tariff change' }, { status: 500 });
  }
}
