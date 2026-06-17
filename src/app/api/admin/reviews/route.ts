import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/reviews?status=pending
 * List reviews for moderation. Defaults to pending so admins can quickly
 * action the moderation queue.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    await ensureDatabaseSchema();
    const url = new URL(request.url);
    const status = (url.searchParams.get('status') || 'pending').toLowerCase();
    const allowed = new Set(['pending', 'approved', 'rejected', 'all']);
    if (!allowed.has(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status.' },
        { status: 400 }
      );
    }

    const result =
      status === 'all'
        ? await getPool().query(
            `SELECT id, product_id, user_id, author_name, rating, content, status,
                    risk_score, risk_reason, created_at
             FROM product_reviews
             ORDER BY created_at DESC
             LIMIT 200`
          )
        : await getPool().query(
            `SELECT id, product_id, user_id, author_name, rating, content, status,
                    risk_score, risk_reason, created_at
             FROM product_reviews
             WHERE status = $1
             ORDER BY created_at DESC
             LIMIT 200`,
            [status]
          );

    return NextResponse.json({
      success: true,
      count: result.rowCount,
      reviews: result.rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        userId: row.user_id,
        author: row.author_name,
        rating: row.rating,
        content: row.content,
        status: row.status,
        riskScore: row.risk_score,
        riskReason: row.risk_reason,
        createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      })),
    });
  } catch (err) {
    console.error('[admin/reviews] list failed', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load reviews.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/reviews
 * Body: { id, action: 'approve' | 'reject' | 'delete' }
 */
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    await ensureDatabaseSchema();
    const body = await request.json().catch(() => null);
    const id = String(body?.id || '').trim();
    const action = String(body?.action || '').toLowerCase();
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing review ID.' },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      await getPool().query(
        `UPDATE product_reviews SET status = 'approved', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } else if (action === 'reject') {
      await getPool().query(
        `UPDATE product_reviews SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } else if (action === 'delete') {
      await getPool().query(`DELETE FROM product_reviews WHERE id = $1`, [id]);
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/reviews] update failed', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update review.' },
      { status: 500 }
    );
  }
}
