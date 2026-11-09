import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = ['new', 'quoted', 'sample_sent', 'won', 'closed'];

/**
 * PATCH /api/admin/inquiries/[id]
 * Moves an inquiry through: new -> quoted -> sample_sent -> won | closed.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const status = typeof body?.status === 'string' ? body.status : '';

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing inquiry ID.' }, { status: 400 });
    }
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status.' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const result = await getPool().query(
      `UPDATE inquiries
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, updated_at`,
      [status, id]
    );

    if (!result.rowCount) {
      return NextResponse.json({ success: false, error: 'Inquiry not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      inquiry: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        updatedAt: result.rows[0].updated_at?.toISOString?.() || new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[admin/inquiries] update error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to update inquiry' }, { status: 500 });
  }
}
