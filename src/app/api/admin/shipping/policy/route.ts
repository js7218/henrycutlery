import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/adminGuard';

/**
 * GET/POST /api/admin/shipping/policy
 * Body: { euPaused: boolean }
 *
 * EU deliveries can be switched off without deleting the country rows, so the
 * rates stay intact while GPSR responsible-person details are still missing.
 */
async function readEuPaused(): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT eu_paused FROM shipping_policy WHERE id = 'default'`
  );
  return Boolean(result.rows[0]?.eu_paused);
}

export async function GET() {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    await ensureDatabaseSchema();
    return NextResponse.json({ success: true, euPaused: await readEuPaused() });
  } catch (error) {
    console.error('[admin-shipping-policy] load failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to load shipping policy' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const body = await request.json();
    if (typeof body?.euPaused !== 'boolean') {
      return NextResponse.json({ success: false, error: 'euPaused must be true or false' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const pool = getPool();
    await pool.query(
      `INSERT INTO shipping_policy (id, eu_paused, updated_at)
       VALUES ('default', $1, NOW())
       ON CONFLICT (id)
       DO UPDATE SET eu_paused = EXCLUDED.eu_paused, updated_at = NOW()`,
      [body.euPaused]
    );

    return NextResponse.json({ success: true, euPaused: body.euPaused });
  } catch (error) {
    console.error('[admin-shipping-policy] save failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to save shipping policy' }, { status: 500 });
  }
}
