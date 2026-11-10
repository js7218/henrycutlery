import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  await ensureDatabaseSchema();
  const pool = getPool();

  const [stock, weights, samples, rates, orders] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE stock >= 999999)::int AS placeholder,
              COUNT(*) FILTER (WHERE stock = 0)::int AS sold_out
         FROM product_stock`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE weight_kg <= 0)::int AS missing
         FROM product_weights`
    ),
    pool.query(`SELECT COUNT(*)::int AS pending FROM sample_requests WHERE status = 'new'`),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE floor_usd_per_kg IS NULL)::int AS missing_floor
         FROM shipping_rates`
    ),
    pool.query(`SELECT MAX(created_at) AS last_order FROM orders`),
  ]);

  const totalSku = Number(stock.rows[0]?.total || 0);
  const placeholderStock = Number(stock.rows[0]?.placeholder || 0);
  const weightTotal = Number(weights.rows[0]?.total || 0);
  const rateTotal = Number(rates.rows[0]?.total || 0);

  return NextResponse.json({
    success: true,
    health: {
      totalSku,
      placeholderStock,
      soldOutSku: Number(stock.rows[0]?.sold_out || 0),
      weightTotal,
      missingWeightSku: Math.max(0, totalSku - weightTotal) + Number(weights.rows[0]?.missing || 0),
      pendingSamples: Number(samples.rows[0]?.pending || 0),
      rateCountries: rateTotal,
      missingFloorCountries: Number(rates.rows[0]?.missing_floor || 0),
      lastOrderAt: orders.rows[0]?.last_order ? new Date(String(orders.rows[0].last_order)).toISOString() : null,
    },
  });
}
