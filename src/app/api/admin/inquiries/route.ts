import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import type { CompanyCheck, CompanyCheckStatus } from '@/lib/companyLookup';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const COMPANY_CHECK_STATUSES: CompanyCheckStatus[] = ['verified', 'uncertain', 'not_found', 'skipped'];

/**
 * Stored as JSON text; tolerate legacy rows that are empty or invalid.
 */
function parseCompanyCheck(value: unknown): CompanyCheck | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value) as Partial<CompanyCheck>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!COMPANY_CHECK_STATUSES.includes(parsed.status as CompanyCheckStatus)) return null;

    return {
      status: parsed.status as CompanyCheckStatus,
      note: typeof parsed.note === 'string' ? parsed.note : '',
      sources: Array.isArray(parsed.sources)
        ? parsed.sources.filter((source): source is string => typeof source === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

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
                    company_check, status, created_at, updated_at
             FROM inquiries
             ORDER BY created_at DESC
             LIMIT 200`
          )
        : await getPool().query(
            `SELECT id, user_id, contact_name, contact_email, contact_phone, company,
                    items, total_amount, expected_delivery, customization, notes, reason,
                    company_check, status, created_at, updated_at
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
        startDate: row.start_date,
        expectedDelivery: row.expected_delivery,
        customization: row.customization,
        notes: row.notes,
        reason: row.reason,
        companyCheck: parseCompanyCheck(row.company_check),
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
