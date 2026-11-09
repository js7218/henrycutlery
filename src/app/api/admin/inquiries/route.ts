import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/inquiries?status=all
 * Lists bulk-order inquiries for manual follow-up.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    await ensureDatabaseSchema();
    const url = new URL(request.url);
    const status = (url.searchParams.get('status') || 'all').toLowerCase();
    const allowed = new Set(['new', 'quoted', 'sample_sent', 'won', 'closed', 'all']);
    if (!allowed.has(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status.' }, { status: 400 });
    }

    const result =
      status === 'all'
        ? await getPool().query(
            `SELECT id, user_id, contact_name, contact_email, contact_phone, company,
                    items, total_amount, expected_delivery, customization, notes, reason,
                    status, created_at, updated_at
             FROM inquiries
             ORDER BY created_at DESC
             LIMIT 200`
          )
        : await getPool().query(
            `SELECT id, user_id, contact_name, contact_email, contact_phone, company,
                    items, total_amount, expected_delivery, customization, notes, reason,
                    status, created_at, updated_at
             FROM inquiries
             WHERE status = $1
             ORDER BY created_at DESC
             LIMIT 200`,
            [status]
          );

    return NextResponse.json({
      success: true,
      count: result.rowCount,
      inquiries: result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        company: row.company,
        items: Array.isArray(row.items) ? row.items : [],
        totalAmount: Number(row.total_amount || 0),
        expectedDelivery: row.expected_delivery,
        customization: row.customization,
        notes: row.notes,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
        updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
      })),
    });
  } catch (err) {
    console.error('[admin/inquiries] list error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to load inquiries' }, { status: 500 });
  }
}
