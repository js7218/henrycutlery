import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { sendOrderNotificationEmail } from '@/lib/orderEmail';
import { requireAdmin } from '@/lib/adminGuard';

/**
 * POST /api/order/update-status
 * Body: { orderId: string, status: 'paid' | 'shipped' | 'cancelled' }
 *
 * Updates order status and sends email notification when status changes to 'paid'.
 * SECURITY: Only admins can update order status. Regular users cannot mark
 * their own orders as paid or change status to bypass payment verification.
 */
export async function POST(request: Request) {
  try {
    // SECURITY: Only admin can update order status
    const adminResult = await requireAdmin();
    if ('response' in adminResult) {
      return adminResult.response;
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
    console.error('[update-status] error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to update order status' }, { status: 500 });
  }
}
