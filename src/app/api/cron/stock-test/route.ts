import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * TEMPORARY. Lets the test run force a low stock value for one product so the
 * out-of-stock branch can be exercised, then restore the placeholder. Removed
 * right after the run.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const product = url.searchParams.get('product') || '';
  if (!/^[a-z0-9-]{3,60}$/.test(product)) {
    return NextResponse.json({ success: false, error: 'invalid product' }, { status: 400 });
  }

  await ensureDatabaseSchema();
  const pool = getPool();

  if (action === 'set') {
    const stock = Number(url.searchParams.get('stock'));
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
      return NextResponse.json({ success: false, error: 'invalid stock' }, { status: 400 });
    }
    const updated = await pool.query(
      'UPDATE product_stock SET stock = $2, updated_at = NOW() WHERE product_id = $1 RETURNING stock',
      [product, stock]
    );
    return NextResponse.json({ success: true, action, product, stock: updated.rows[0]?.stock ?? null });
  }

  if (action === 'restore') {
    const updated = await pool.query(
      'UPDATE product_stock SET stock = 999999, updated_at = NOW() WHERE product_id = $1 RETURNING stock',
      [product]
    );
    return NextResponse.json({ success: true, action, product, stock: updated.rows[0]?.stock ?? null });
  }

  const row = await pool.query('SELECT stock FROM product_stock WHERE product_id = $1', [product]);
  return NextResponse.json({ success: true, product, stock: row.rows[0]?.stock ?? null });
}
