import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { DEFAULT_ITEM_WEIGHT_KG } from '@/lib/shipping';

/**
 * GET /api/shipping/rates
 * Public read-only configuration used by checkout to estimate shipping.
 */
export async function GET() {
  try {
    await ensureDatabaseSchema();
    const pool = getPool();
    const [rates, weights] = await Promise.all([
      pool.query(
        `SELECT country_code, country_name, per_kg_usd, updated_at
         FROM shipping_rates ORDER BY country_name ASC`
      ),
      pool.query(`SELECT product_id, weight_kg FROM product_weights`),
    ]);

    const weightMap: Record<string, number> = {};
    for (const row of weights.rows) {
      weightMap[row.product_id] = Number(row.weight_kg);
    }

    return NextResponse.json(
      {
        success: true,
        defaultItemWeightKg: DEFAULT_ITEM_WEIGHT_KG,
        rates: rates.rows.map((row) => ({
          countryCode: row.country_code,
          countryName: row.country_name,
          perKgUsd: Number(row.per_kg_usd),
          updatedAt: row.updated_at,
        })),
        weights: weightMap,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[shipping-rates] failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to load shipping rates' }, { status: 500 });
  }
}
