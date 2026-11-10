import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { getMarketSummary } from '@/lib/shippingMarket';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * TEMPORARY. Applies the market-based suggestion (24h high x 1.15) to the
 * countries named in ?countries=US,GB,AU, writing a change-log row each time.
 * Removed right after the owner-approved run.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const codes = (new URL(request.url).searchParams.get('countries') || '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code));
  if (codes.length === 0) {
    return NextResponse.json({ success: false, error: 'countries is required' }, { status: 400 });
  }

  await ensureDatabaseSchema();
  const summary = new Map((await getMarketSummary()).map((row) => [row.countryCode, row]));
  const pool = getPool();
  const applied: Array<{ countryCode: string; before: number | null; after: number }> = [];
  const skipped: Array<{ countryCode: string; reason: string }> = [];

  for (const code of codes) {
    const market = summary.get(code);
    if (!market) {
      skipped.push({ countryCode: code, reason: 'no quote in the last 24h' });
      continue;
    }
    const suggested = Math.round(market.high * 1.15 * 100) / 100;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT per_kg_usd, floor_usd_per_kg FROM shipping_rates WHERE country_code = $1 FOR UPDATE',
        [code]
      );
      const before = existing.rowCount ? Number(existing.rows[0].per_kg_usd) : null;
      const floor =
        existing.rowCount && existing.rows[0].floor_usd_per_kg != null
          ? Number(existing.rows[0].floor_usd_per_kg)
          : null;
      if (floor !== null && suggested < floor) {
        await client.query('ROLLBACK');
        skipped.push({ countryCode: code, reason: `below cost floor $${floor}` });
        continue;
      }

      await client.query(
        `INSERT INTO shipping_rates (country_code, country_name, per_kg_usd, updated_at)
         VALUES ($1, COALESCE((SELECT country_name FROM shipping_rates WHERE country_code = $1), $1), $2, NOW())
         ON CONFLICT (country_code) DO UPDATE SET per_kg_usd = EXCLUDED.per_kg_usd, updated_at = NOW()`,
        [code, suggested]
      );
      await client.query(
        `INSERT INTO shipping_rate_changes (id, country_code, before_usd, after_usd, source, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `c${randomUUID()}`,
          code,
          before,
          suggested,
          'market suggestion',
          `24h high $${market.high.toFixed(2)} x 1.15 (${market.count} source${market.count === 1 ? '' : 's'})`,
        ]
      );
      await client.query('COMMIT');
      applied.push({ countryCode: code, before, after: suggested });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      skipped.push({
        countryCode: code,
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    } finally {
      client.release();
    }
  }

  return NextResponse.json({ success: true, applied, skipped });
}
