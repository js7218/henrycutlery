import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { sendOrderNotificationEmail } from '@/lib/orderEmail';

/**
 * POST /api/order/update-status
 * Body: { orderId: string, status: 'paid' | 'shipped' | 'cancelled' }
 *
 * Updates order status and sends email notification when status changes to 'paid'.
 * This is called when payment is confirmed (e.g., admin marks order as paid).
 */
export async function POST(request: Request) {
  try {
    // Verify authentication
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyJWT(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'Session expired' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId, status } = body;

    if (!orderId || !status) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const allowedStatuses = ['paid', 'shipped', 'cancelled', 'delivered'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const pool = getPool();

    // Get current order
    const orderResult = await pool.query(
      `SELECT id, order_number, total_amount, status, shipping_address, items, user_id, email
       FROM orders WHERE id = $1`,
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Check authorization: only the order owner or admin can update
    if (payload.role !== 'admin' && order.user_id !== payload.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const previousStatus = order.status;

    // Update order status
    await pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, orderId]
    );

    // Send email notification when status changes to 'paid'
    if (status === 'paid' && previousStatus === 'pending') {
      try {
        await sendOrderNotificationEmail({
          orderNumber: order.order_number,
          totalAmount: order.total_amount,
          paymentMethod: 'bank_transfer',
          items: order.items,
          shippingAddress: order.shipping_address,
          createdAt: order.created_at?.toString() || new Date().toISOString(),
        });
      } catch (err) {
        console.error('[update-status] Failed to send payment confirmation email:', err);
      }
    }

    return NextResponse.json({
      success: true,
      previousStatus,
      newStatus: status,
    });
  } catch (err) {
    console.error('[update-status] error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update order status' }, { status: 500 });
  }
}
