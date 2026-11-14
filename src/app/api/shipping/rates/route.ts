import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

/**
 * GET /api/shipping/rates
 * Public read-only configuration used by checkout to estimate shipping.
 */
export async function GET() {
  try {
    await ensureDatabaseSchema();
    const pool = getPool();
    const [rates, weights, taxes] = await Promise.all([
      pool.query(
        `SELECT country_code, country_name, per_kg_usd, updated_at
         FROM shipping_rates ORDER BY country_name ASC`
      ),
      pool.query(`SELECT product_id, weight_kg FROM product_weights`),
      pool.query(
        `SELECT country_code, duty_pct, vat_pct, tax_included, updated_at
         FROM country_tax_rates`
      ),
    ]);

    const weightMap: Record<string, number> = {};
    for (const row of weights.rows) {
      weightMap[row.product_id] = Number(row.weight_kg);
    }

    const taxMap: Record<string, { dutyPct: number; vatPct: number; taxIncluded: boolean; updatedAt: string }> = {};
    for (const row of taxes.rows) {
      taxMap[row.country_code] = {
        dutyPct: Number(row.duty_pct),
        vatPct: Number(row.vat_pct),
        taxIncluded: Boolean(row.tax_included),
        updatedAt: row.updated_at,
      };
    }

    return NextResponse.json(
      {
        success: true,
        defaultItemWeightKg: null,
        packagingKg: null,
        settingsUpdatedAt: null,
        rates: rates.rows.map((row) => ({
          countryCode: row.country_code,
          countryName: row.country_name,
          perKgUsd: Number(row.per_kg_usd),
          updatedAt: row.updated_at,
          dutyPct: taxMap[row.country_code]?.dutyPct ?? 0,
          vatPct: taxMap[row.country_code]?.vatPct ?? 0,
          taxIncluded: taxMap[row.country_code]?.taxIncluded ?? false,
          taxUpdatedAt: taxMap[row.country_code]?.updatedAt ?? null,
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
