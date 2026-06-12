import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Admin-only customer search.
 *
 * Query params:
 *   q     - free text matching email / name / phone / order_number / address.detail
 *   limit - max rows to return (default 25, hard cap 100)
 *
 * Returns the user row plus a quick summary of how many addresses and orders
 * the user has so the admin doesn't need to round-trip again.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    await ensureDatabaseSchema();
    const url = new URL(request.url);
    const rawQuery = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(Number(url.searchParams.get('limit') || 25) || 25, 100);

    // Parameterized search. Plain `LIKE` is enough here because we control all
    // input through $1 and never inline the user string into SQL.
    const like = `%${rawQuery.toLowerCase()}%`;

    let userIds: string[] = [];
    if (rawQuery) {
      const orderHit = await getPool().query(
        `
          SELECT DISTINCT user_id
          FROM orders
          WHERE LOWER(order_number) LIKE $1
          LIMIT $2
        `,
        [like, limit]
      );
      const addressHit = await getPool().query(
        `
          SELECT DISTINCT user_id
          FROM addresses
          WHERE LOWER(detail) LIKE $1
             OR LOWER(name)   LIKE $1
             OR LOWER(phone)  LIKE $1
          LIMIT $2
        `,
        [like, limit]
      );
      userIds = [
        ...orderHit.rows.map((r) => r.user_id as string),
        ...addressHit.rows.map((r) => r.user_id as string),
      ].filter(Boolean);
    }

    const result = await getPool().query(
      `
        SELECT
          u.id,
          u.email,
          u.name,
          u.phone,
          u.role,
          u.created_at,
          (SELECT COUNT(*)::int FROM addresses a WHERE a.user_id = u.id) AS address_count,
          (SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id)    AS order_count
        FROM users u
        WHERE u.deleted_at IS NULL
          AND (
            $1 = ''
            OR LOWER(u.email) LIKE $2
            OR LOWER(u.name)  LIKE $2
            OR LOWER(u.phone) LIKE $2
            OR u.id = ANY($3::text[])
          )
        ORDER BY u.created_at DESC
        LIMIT $4
      `,
      [rawQuery, like, userIds, limit]
    );

    const response = NextResponse.json({
      success: true,
      query: rawQuery,
      count: result.rowCount,
      customers: result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name || row.email.split('@')[0],
        phone: row.phone || '',
        role: row.role,
        addressCount: Number(row.address_count || 0),
        orderCount: Number(row.order_count || 0),
        createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      })),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('[admin/customers] failed', err);
    return NextResponse.json(
      { success: false, error: '查询失败，请稍后再试' },
      { status: 500 }
    );
  }
}
