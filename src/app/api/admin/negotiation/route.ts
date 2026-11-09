import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/adminGuard';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { getNegotiationSettings } from '@/lib/negotiation';

export const dynamic = 'force-dynamic';

const settingsSchema = z.object({
  enabled: z.boolean(),
  maxDiscountPct: z.number().min(0).max(90),
  floorRatio: z.number().min(0.05).max(1),
  minShippingUsd: z.number().min(0).max(500),
});

/**
 * GET /api/admin/negotiation
 * Returns the current negotiation settings and the last 50 conversations.
 */
export async function GET() {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    await ensureDatabaseSchema();
    const pool = getPool();
    const [settings, rows] = await Promise.all([
      getNegotiationSettings(),
      pool.query(
        `SELECT id, created_at, country_code, quote_usd, final_usd, granted, reply
         FROM shipping_negotiations
         ORDER BY created_at DESC
         LIMIT 50`
      ),
    ]);

    return NextResponse.json({
      success: true,
      settings,
      negotiations: rows.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
        countryCode: row.country_code || '',
        quoteUsd: Number(row.quote_usd || 0),
        finalUsd: row.final_usd !== null && row.final_usd !== undefined ? Number(row.final_usd) : null,
        granted: row.granted === true,
        reply: row.reply || '',
      })),
    });
  } catch (error) {
    console.error(
      '[admin-negotiation] load failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json(
      { success: false, error: 'Failed to load negotiation settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/negotiation
 * Body: { enabled, maxDiscountPct, floorRatio, minShippingUsd }
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid negotiation settings' },
        { status: 400 }
      );
    }

    const { enabled, maxDiscountPct, floorRatio, minShippingUsd } = parsed.data;

    await ensureDatabaseSchema();
    await getPool().query(
      `INSERT INTO negotiation_settings
         (id, enabled, max_discount_pct, floor_ratio, min_shipping_usd, updated_at)
       VALUES ('default', $1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         max_discount_pct = EXCLUDED.max_discount_pct,
         floor_ratio = EXCLUDED.floor_ratio,
         min_shipping_usd = EXCLUDED.min_shipping_usd,
         updated_at = NOW()`,
      [enabled, maxDiscountPct, floorRatio, minShippingUsd]
    );

    return NextResponse.json({ success: true, settings: await getNegotiationSettings() });
  } catch (error) {
    console.error(
      '[admin-negotiation] save failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json(
      { success: false, error: 'Failed to save negotiation settings' },
      { status: 500 }
    );
  }
}
