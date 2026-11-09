import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { sendOrderNotificationEmail, sendCustomerOrderConfirmation, sendCustomerShippedEmail } from '@/lib/orderEmail';
import { requireAdmin } from '@/lib/adminGuard';
import { getAuthUser } from '@/lib/auth';

/**
 * POST /api/order/update-status
 *
 * Two callers share this endpoint:
 *
 * 1. Customer confirms receipt
 *    Body: { orderId: string, action: 'confirm-receipt' }
 *    Only the owner of the order can do this, and only from shipped -> delivered.
 *
 * 2. Admin updates the order
 *    Body: { orderId: string, status: 'paid' | 'shipped' | 'delivered' | 'cancelled',
 *            trackingNumber?: string }
 *    Regular users cannot mark their own orders as paid or change status.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // Customer confirms receipt of a shipped order.
    // ------------------------------------------------------------------
    if (body.action === 'confirm-receipt') {
      return await confirmReceipt(orderId);
    }

    // ------------------------------------------------------------------
    // Admin status update (and optional tracking number).
    // ------------------------------------------------------------------
    const adminResult = await requireAdmin();
    if ('response' in adminResult) {
      return adminResult.response;
    }

    const { status, trackingNumber } = body;

    if (!status) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const allowedStatuses = ['paid', 'shipped', 'cancelled', 'delivered'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    let tracking: string | null = null;
    if (trackingNumber !== undefined && trackingNumber !== null) {
      if (typeof trackingNumber !== 'string') {
        return NextResponse.json({ success: false, error: 'Invalid tracking number' }, { status: 400 });
      }
      tracking = trackingNumber.trim().slice(0, 100);
    }

    await ensureDatabaseSchema();
    const pool = getPool();

    // Get current order (email lives on the user, not on the order row).
    const orderResult = await pool.query(
      `SELECT o.id, o.order_number, o.total_amount, o.status, o.shipping_address, o.items,
              o.user_id, o.created_at, o.payment_method, o.tracking_number, u.email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const previousStatus = order.status;

    const setClauses = ['status = $1', 'updated_at = NOW()'];
    const values: Array<string> = [status];

    if (status === 'shipped') {
      setClauses.push('shipped_at = COALESCE(shipped_at, NOW())');
    }
    if (status === 'delivered') {
      setClauses.push('delivered_at = COALESCE(delivered_at, NOW())');
    }
    if (tracking !== null) {
      values.push(tracking);
      setClauses.push(`tracking_number = $${values.length}`);
    }

    values.push(orderId);
    await pool.query(
      `UPDATE orders SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
      values
    );

    // Send email notification when status changes to 'paid'
    if (status === 'paid' && previousStatus === 'pending') {
      const paymentMethod = order.payment_method || 'bank_transfer';
      try {
        await sendOrderNotificationEmail({
          orderNumber: order.order_number,
          totalAmount: order.total_amount,
          paymentMethod,
          items: order.items,
          shippingAddress: order.shipping_address,
          createdAt: order.created_at?.toISOString?.() || new Date().toISOString(),
        });
      } catch (err) {
        console.error('[update-status] Failed to send payment confirmation email:', err instanceof Error ? err.message : 'Unknown error');
      }

      // Send customer order confirmation email
      if (order.email) {
        try {
          await sendCustomerOrderConfirmation(order.email, {
            orderNumber: order.order_number,
            totalAmount: order.total_amount,
            paymentMethod,
            items: order.items,
            shippingAddress: order.shipping_address,
            createdAt: order.created_at?.toISOString?.() || new Date().toISOString(),
          });
        } catch (err) {
          console.error('[update-status] Failed to send customer confirmation email:', err instanceof Error ? err.message : 'Unknown error');
        }
      }
    }

    // Let the customer know when their order ships, including the tracking number.
    const shippingNow = status === 'shipped' && previousStatus !== 'shipped';
    if (shippingNow && order.email) {
      try {
        await sendCustomerShippedEmail(order.email, {
          orderNumber: order.order_number,
          totalAmount: order.total_amount,
          paymentMethod: order.payment_method || 'bank_transfer',
          items: order.items,
          shippingAddress: order.shipping_address,
          createdAt: order.created_at?.toISOString?.() || new Date().toISOString(),
        }, tracking || order.tracking_number || '');
      } catch (err) {
        console.error('[update-status] Failed to send shipping email:', err instanceof Error ? err.message : 'Unknown error');
      }
    }

    return NextResponse.json({
      success: true,
      previousStatus,
      newStatus: status,
      trackingNumber: tracking ?? undefined,
    });
  } catch (err) {
    console.error('[update-status] error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to update order status' }, { status: 500 });
  }
}

/**
 * Customer-side receipt confirmation. Server-side ownership check prevents
 * horizontal privilege escalation (one customer marking another's order).
 */
async function confirmReceipt(orderId: string) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Please log in.' }, { status: 401 });
  }

  await ensureDatabaseSchema();
  const pool = getPool();

  const result = await pool.query(
    `SELECT id, user_id, status FROM orders WHERE id = $1`,
    [orderId]
  );
  const order = result.rows[0];
  if (!order) {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
  }

  if (order.user_id !== authUser.id) {
    return NextResponse.json({ success: false, error: 'You can only confirm your own orders.' }, { status: 403 });
  }

  if (order.status !== 'shipped') {
    return NextResponse.json(
      { success: false, error: 'Only shipped orders can be confirmed as received.' },
      { status: 409 }
    );
  }

  const updated = await pool.query(
    `UPDATE orders
     SET status = 'delivered', delivered_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'shipped'
     RETURNING id`,
    [orderId]
  );

  if (!updated.rowCount) {
    return NextResponse.json(
      { success: false, error: 'Order status changed. Please refresh and try again.' },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    previousStatus: 'shipped',
    newStatus: 'delivered',
  });
}
