import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * TEMPORARY. Hard-deletes the disposable end-to-end test accounts
 * (e2etest…@fldubai.com / e2e.test…@fldubai.com). Orders and addresses are
 * removed through ON DELETE CASCADE. Removed right after use.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  await ensureDatabaseSchema();
  const pool = getPool();

  const found = await pool.query(
    `SELECT id, email FROM users WHERE email ~ '^(e2etest|e2e\\.test)[0-9]*@fldubai\\.com$'`
  );
  const deleted = await pool.query(
    `DELETE FROM users WHERE email ~ '^(e2etest|e2e\\.test)[0-9]*@fldubai\\.com$' RETURNING email`
  );

  return NextResponse.json({
    success: true,
    matched: found.rows.map((row) => row.email),
    deleted: deleted.rows.map((row) => row.email),
  });
}
