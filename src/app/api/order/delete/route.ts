import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

const DELETABLE_STATUSES = ['pending', 'cancelled', 'delivered'];

/**
 * DELETE /api/order/delete
 * Body: { orderId: string }
 *
 * Lets a customer clean up their own order history. Only orders that are
 * awaiting payment, cancelled, or already delivered can be removed; paid and
 * shipped orders stay until the transaction is complete.
 */
export async function DELETE(request: Request) {
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

    const result = await pool.query(
      `DELETE FROM orders
       WHERE id = $1 AND user_id = $2 AND status = ANY($3::text[])
       RETURNING id`,
      [orderId, authUser.id, DELETABLE_STATUSES]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Order not found, or it can no longer be deleted.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[order/delete] error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to delete order.' }, { status: 500 });
  }
}
