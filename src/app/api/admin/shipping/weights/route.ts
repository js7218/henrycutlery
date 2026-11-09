import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/adminGuard';

/**
 * POST /api/admin/shipping/weights
 * Body: { weights: [{ productId, weightKg }] }
 */
export async function POST(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const body = await request.json();
    const weights = Array.isArray(body?.weights) ? body.weights : [];
    if (weights.length === 0) {
      return NextResponse.json({ success: false, error: 'No weights provided' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const pool = getPool();

    for (const item of weights) {
      const productId = typeof item.productId === 'string' ? item.productId.trim().slice(0, 100) : '';
      const kg = Number(item.weightKg);
      if (!productId) continue;
      if (!Number.isFinite(kg) || kg <= 0 || kg > 100) continue;

      await pool.query(
        `INSERT INTO product_weights (product_id, weight_kg, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (product_id)
         DO UPDATE SET weight_kg = EXCLUDED.weight_kg, updated_at = NOW()`,
        [productId, kg]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin-shipping-weights] failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to save weights' }, { status: 500 });
  }
}
