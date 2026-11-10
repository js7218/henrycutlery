import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * TEMPORARY. Sets a placeholder cost floor (50% of the current rate) on every
 * country that has none, so automatic price updates cannot crash through an
 * obviously wrong quote. Removed right after the owner-approved run.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  await ensureDatabaseSchema();
  const pool = getPool();
  const result = await pool.query(
    `UPDATE shipping_rates
        SET floor_usd_per_kg = ROUND((per_kg_usd * 0.5)::numeric, 2)
      WHERE floor_usd_per_kg IS NULL
      RETURNING country_code, per_kg_usd, floor_usd_per_kg`
  );

  return NextResponse.json({
    success: true,
    updated: result.rowCount,
    floors: result.rows.map((row) => ({
      countryCode: String(row.country_code),
      rate: Number(row.per_kg_usd),
      floor: Number(row.floor_usd_per_kg),
    })),
  });
}
