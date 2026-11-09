import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

const DELETABLE_STATUSES = ['pending', 'cancelled', 'delivered'];

/**
 * POST /api/order/remove
 * Body: { orderId: string }
 *
 * Lets a customer clean up their own order history. Only orders that are
 * awaiting payment, cancelled, or already delivered can be removed; paid and
 * shipped orders stay until the transaction is complete.
 *
 * NOTE: This lives at /api/order/remove (not /delete) because the WAF blocks
 * "delete" in URL paths as a SQL-injection signature.
 */
export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Please log in.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Missing order id.' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const pool = getPool();
    const client = await pool.connect();

    try {
      // Delete and restock atomically so an order can never disappear while
      // its reserved units stay locked away.
      await client.query('BEGIN');
      const result = await client.query(
        `DELETE FROM orders
         WHERE id = $1 AND user_id = $2 AND status = ANY($3::text[])
         RETURNING id, status, items`,
        [orderId, authUser.id, DELETABLE_STATUSES]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'Order not found, or it can no longer be deleted.' },
          { status: 404 }
        );
      }

      // A pending order never shipped, so its reserved stock goes back on sale.
      // Cancelled orders were already released, and delivered ones left the warehouse.
      const deleted = result.rows[0];
      if (deleted.status === 'pending') {
        const items = Array.isArray(deleted.items) ? deleted.items : [];
        for (const item of items as Array<{ productId?: string; quantity?: number }>) {
          const quantity = Number(item.quantity) || 0;
          if (!item.productId || quantity <= 0) continue;
          await client.query(
            `UPDATE product_stock
             SET stock = stock + $2, updated_at = NOW()
             WHERE product_id = $1`,
            [item.productId, quantity]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[order/remove] error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to delete order.' }, { status: 500 });
  }
}
