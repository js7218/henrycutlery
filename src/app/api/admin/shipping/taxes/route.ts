import { NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/adminGuard';

/**
 * POST /api/admin/shipping/taxes
 * Body: { taxes: [{ countryCode, countryName, dutyPct, vatPct, taxIncluded }] }
 *
 * Percentages are estimates shown to the customer at checkout. They are not
 * charged by the store unless taxIncluded is true (DDP).
 */
export async function POST(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  try {
    const body = await request.json();
    const taxes = Array.isArray(body?.taxes) ? body.taxes : [];
    if (taxes.length === 0) {
      return NextResponse.json({ success: false, error: 'No tax rates provided' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const pool = getPool();

    for (const tax of taxes) {
      const code = typeof tax.countryCode === 'string' ? tax.countryCode.trim().toUpperCase() : '';
      const name = typeof tax.countryName === 'string' ? tax.countryName.trim().slice(0, 100) : '';
      const duty = Number(tax.dutyPct);
      const vat = Number(tax.vatPct);
      if (!/^[A-Z]{2}$/.test(code)) continue;
      if (!Number.isFinite(duty) || duty < 0 || duty > 100) continue;
      if (!Number.isFinite(vat) || vat < 0 || vat > 100) continue;

      await pool.query(
        `INSERT INTO country_tax_rates
           (country_code, country_name, duty_pct, vat_pct, tax_included, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (country_code)
         DO UPDATE SET country_name = EXCLUDED.country_name,
                       duty_pct = EXCLUDED.duty_pct,
                       vat_pct = EXCLUDED.vat_pct,
                       tax_included = EXCLUDED.tax_included,
                       updated_at = NOW()`,
        [code, name || code, duty, vat, Boolean(tax.taxIncluded)]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin-shipping-taxes] failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to save tax rates' }, { status: 500 });
  }
}
