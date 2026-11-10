import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** TEMPORARY. Removed immediately after clearing e2e test accounts. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  await ensureDatabaseSchema();
  const pool = getPool();
  const pattern = '^e2e[._]?test[._]?[0-9]*[a-z]?@fldubai\\.com$';
  const deleted = await pool.query(`DELETE FROM users WHERE email ~ $1 RETURNING email`, [pattern]);

  return NextResponse.json({ success: true, deleted: deleted.rows.map((row) => row.email) });
}
