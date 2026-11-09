import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/adminGuard';

/**
 * POST /api/admin/shipping/settings
 * Body: { defaultItemWeightKg, packagingKg }
 */
export async function POST(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const body = await request.json();
    const defaultWeight = Number(body?.defaultItemWeightKg);
    const packaging = Number(body?.packagingKg);

    if (!Number.isFinite(defaultWeight) || defaultWeight <= 0 || defaultWeight > 100) {
      return NextResponse.json({ success: false, error: 'Invalid default item weight' }, { status: 400 });
    }
    if (!Number.isFinite(packaging) || packaging < 0 || packaging > 100) {
      return NextResponse.json({ success: false, error: 'Invalid packaging weight' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const pool = getPool();
    await pool.query(
      `INSERT INTO shipping_settings (id, default_item_weight_kg, packaging_kg, updated_at)
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id)
       DO UPDATE SET default_item_weight_kg = EXCLUDED.default_item_weight_kg,
                     packaging_kg = EXCLUDED.packaging_kg,
                     updated_at = NOW()`,
      [defaultWeight, packaging]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin-shipping-settings] failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to save settings' }, { status: 500 });
  }
}
