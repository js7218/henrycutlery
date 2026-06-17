import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Admin-only detail view: addresses + orders for a single customer.
 * The customer ID comes from the URL path so we can keep it fully
 * parameterized.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing user ID.' },
        { status: 400 }
      );
    }

    await ensureDatabaseSchema();
    const userResult = await getPool().query(
      `SELECT id, email, name, phone, role, created_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (userResult.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: 'User does not exist.' },
        { status: 404 }
      );
    }
    const user = userResult.rows[0];

    const [addressResult, orderResult] = await Promise.all([
      getPool().query(
        `SELECT id, name, phone, province, city, district, detail, is_default
         FROM addresses
         WHERE user_id = $1
         ORDER BY is_default DESC, created_at DESC`,
        [id]
      ),
      getPool().query(
        `SELECT id, order_number, total_amount, status, payment_method, created_at
         FROM orders
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [id]
      ),
    ]);

    const response = NextResponse.json({
      success: true,
      customer: {
        id: user.id,
        email: user.email,
        name: user.name || user.email.split('@')[0],
        phone: user.phone || '',
        role: user.role,
        createdAt: user.created_at?.toISOString?.() || new Date().toISOString(),
      },
      addresses: addressResult.rows,
      orders: orderResult.rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        totalAmount: Number(row.total_amount),
        status: row.status,
        paymentMethod: row.payment_method,
        createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      })),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('[admin/customers/:id] failed', err);
    return NextResponse.json(
      { success: false, error: 'Query failed.' },
      { status: 500 }
    );
  }
}
