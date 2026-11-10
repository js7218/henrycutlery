import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/adminGuard';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import {
  deleteMarketSource,
  getAutomationSettings,
  getLatestFx,
  getMarketSummary,
  listMarketSources,
  runMarketCapture,
  saveAutomationSettings,
  upsertMarketSource,
} from '@/lib/shippingMarket';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function loadSnapshot() {
  await ensureDatabaseSchema();
  const pool = getPool();

  const [fx, summary, sources, settings, ratesResult, changesResult] = await Promise.all([
    getLatestFx(),
    getMarketSummary(),
    listMarketSources(),
    getAutomationSettings(),
    pool.query('SELECT * FROM shipping_rates ORDER BY country_code ASC'),
    pool.query('SELECT * FROM shipping_rate_changes ORDER BY changed_at DESC LIMIT 20'),
  ]);

  return {
    fx,
    summary,
    sources,
    settings,
    rates: ratesResult.rows.map((row) => ({
      countryCode: String(row.country_code),
      countryName: String(row.country_name || row.country_code),
      perKgUsd: Number(row.per_kg_usd),
      floorUsdPerKg: row.floor_usd_per_kg == null ? null : Number(row.floor_usd_per_kg),
      updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : '',
    })),
    changes: changesResult.rows.map((row) => ({
      id: String(row.id),
      countryCode: String(row.country_code),
      beforeUsd: row.before_usd === null ? null : Number(row.before_usd),
      afterUsd: Number(row.after_usd),
      source: String(row.source || ''),
      note: String(row.note || ''),
      changedAt: new Date(String(row.changed_at)).toISOString(),
    })),
  };
}

export async function GET() {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    return NextResponse.json({ success: true, ...(await loadSnapshot()) });
  } catch (error) {
    console.error(
      '[admin-shipping-market] load failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 });
  }
}

/** POST /api/admin/shipping-market — add or update a price source. */
export async function POST(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.url !== 'string' || typeof body.countryCode !== 'string') {
      return NextResponse.json(
        { success: false, error: 'countryCode and url are required' },
        { status: 400 }
      );
    }

    const source = await upsertMarketSource({
      id: typeof body.id === 'string' ? body.id : undefined,
      countryCode: body.countryCode,
      label: body.label,
      url: body.url,
      unit: body.unit,
      regex: body.regex,
      enabled: body.enabled,
      notes: body.notes,
    });
    if (!source) {
      return NextResponse.json(
        { success: false, error: 'Invalid country code or unsafe URL' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, source, ...(await loadSnapshot()) });
  } catch (error) {
    console.error(
      '[admin-shipping-market] save failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Failed to save source' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) {
    return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
  }

  const removed = await deleteMarketSource(id);
  if (!removed) {
    return NextResponse.json({ success: false, error: 'Source not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, ...(await loadSnapshot()) });
}

/**
 * PUT /api/admin/shipping-market — run the capture now (same job as the cron).
 */
export async function PUT() {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const result = await runMarketCapture();
    return NextResponse.json({ success: true, ...result, ...(await loadSnapshot()) });
  } catch (error) {
    console.error(
      '[admin-shipping-market] capture failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Capture failed' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/shipping-market
 * Body: { countryCode, perKgUsd, note? } — applies a reviewed rate and logs it.
 */
export async function PATCH(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const body = await request.json().catch(() => null);

    // Automation thresholds (auto-apply switch, quiet and review percentages).
    if (body?.action === 'settings') {
      const saved = await saveAutomationSettings(body);
      if (!saved) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid thresholds: quiet must be 0-50 and review must be between quiet and 100.',
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, ...(await loadSnapshot()) });
    }

    // Cost floor for one country. null clears it.
    if (body?.action === 'floor') {
      const countryCode =
        typeof body?.countryCode === 'string'
          ? body.countryCode.trim().toUpperCase().slice(0, 2)
          : '';
      if (!/^[A-Z]{2}$/.test(countryCode)) {
        return NextResponse.json({ success: false, error: 'Invalid country code' }, { status: 400 });
      }
      const raw = body?.floorUsdPerKg;
      const floor = raw === null || raw === '' ? null : Number(raw);
      if (floor !== null && (!Number.isFinite(floor) || floor < 0.1 || floor > 1000)) {
        return NextResponse.json(
          { success: false, error: 'Floor must be between 0.1 and 1000 USD/kg, or empty to clear.' },
          { status: 400 }
        );
      }

      await ensureDatabaseSchema();
      const updated = await getPool().query(
        `UPDATE shipping_rates SET floor_usd_per_kg = $2, updated_at = NOW() WHERE country_code = $1`,
        [countryCode, floor]
      );
      if (!updated.rowCount) {
        return NextResponse.json(
          { success: false, error: 'Country has no shipping rate yet' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, ...(await loadSnapshot()) });
    }

    const countryCode =
      typeof body?.countryCode === 'string' ? body.countryCode.trim().toUpperCase().slice(0, 2) : '';
    const perKgUsd = Number(body?.perKgUsd);

    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return NextResponse.json({ success: false, error: 'Invalid country code' }, { status: 400 });
    }
    if (!Number.isFinite(perKgUsd) || perKgUsd < 0.5 || perKgUsd > 1000) {
      return NextResponse.json(
        { success: false, error: 'Rate must be between 0.5 and 1000 USD/kg' },
        { status: 400 }
      );
    }

    await ensureDatabaseSchema();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT per_kg_usd, country_name, floor_usd_per_kg FROM shipping_rates WHERE country_code = $1 FOR UPDATE',
        [countryCode]
      );
      const before = existing.rowCount ? Number(existing.rows[0].per_kg_usd) : null;
      const floorUsd =
        existing.rowCount && existing.rows[0].floor_usd_per_kg != null
          ? Number(existing.rows[0].floor_usd_per_kg)
          : null;
      if (floorUsd !== null && perKgUsd < floorUsd) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            success: false,
            error: `Below the cost floor of $${floorUsd.toFixed(2)}/kg. Lower the floor first if this is intentional.`,
          },
          { status: 400 }
        );
      }
      const countryName = existing.rowCount
        ? String(existing.rows[0].country_name || countryCode)
        : countryCode;

      await client.query(
        `INSERT INTO shipping_rates (country_code, country_name, per_kg_usd, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (country_code) DO UPDATE SET per_kg_usd = EXCLUDED.per_kg_usd,
                                                  updated_at = NOW()`,
        [countryCode, countryName, perKgUsd]
      );
      await client.query(
        `INSERT INTO shipping_rate_changes
           (id, country_code, before_usd, after_usd, source, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `c${randomUUID()}`,
          countryCode,
          before,
          perKgUsd,
          String(body?.source || 'admin review').slice(0, 100),
          String(body?.note || '').slice(0, 300),
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true, ...(await loadSnapshot()) });
  } catch (error) {
    console.error(
      '[admin-shipping-market] apply failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Failed to apply rate' }, { status: 500 });
  }
}
