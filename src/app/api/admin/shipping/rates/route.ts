import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/adminGuard';

/**
 * POST /api/admin/shipping/rates
 * Body: { rates: [{ countryCode, countryName, perKgUsd }] }
 */
export async function POST(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const body = await request.json();
    const rates = Array.isArray(body?.rates) ? body.rates : [];
    if (rates.length === 0) {
      return NextResponse.json({ success: false, error: 'No rates provided' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const pool = getPool();

    for (const rate of rates) {
      const code = typeof rate.countryCode === 'string' ? rate.countryCode.trim().toUpperCase() : '';
      const name = typeof rate.countryName === 'string' ? rate.countryName.trim().slice(0, 100) : '';
      const perKg = Number(rate.perKgUsd);
      if (!/^[A-Z]{2}$/.test(code)) continue;
      if (!Number.isFinite(perKg) || perKg <= 0 || perKg > 1000) continue;

      await pool.query(
        `INSERT INTO shipping_rates (country_code, country_name, per_kg_usd, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (country_code)
         DO UPDATE SET country_name = EXCLUDED.country_name,
                       per_kg_usd = EXCLUDED.per_kg_usd,
                       updated_at = NOW()`,
        [code, name || code, perKg]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin-shipping-rates] failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to save rates' }, { status: 500 });
  }
}
