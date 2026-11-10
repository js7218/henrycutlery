/**
 * GET /api/order/pi?id=<orderId>
 *
 * Returns a printable Proforma Invoice for one order. HTML only, so the
 * customer can use the browser's "Print to PDF" without any PDF dependency.
 * Only the owner of the order (or an admin) may read it.
 */

import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { customerOrderNumberFields, paymentReferenceFor } from '@/lib/orderView';

export const dynamic = 'force-dynamic';

interface OrderItemRow {
  productId?: string;
  productName?: string;
  price?: number;
  quantity?: number;
}

interface ShippingAddressRow {
  name?: string;
  phone?: string;
  province?: string;
  city?: string;
  district?: string;
  detail?: string;
  country?: string;
  countryCode?: string;
  shippingFee?: number;
  shippingQuoted?: boolean;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function bankDetails() {
  return {
    accountName:
      process.env.BANK_ACCOUNT_NAME || process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'Adam Cutlery',
    accountNumber:
      process.env.BANK_ACCOUNT_NUMBER || process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || '',
    bankName: process.env.BANK_NAME || process.env.NEXT_PUBLIC_BANK_NAME || 'HSBC',
    bankAddress: process.env.BANK_ADDRESS || process.env.NEXT_PUBLIC_BANK_ADDRESS || '',
    swift: process.env.BANK_SWIFT || process.env.NEXT_PUBLIC_BANK_SWIFT || '',
  };
}

function addressLines(address: ShippingAddressRow): string[] {
  return [
    address.name,
    address.detail,
    [address.district, address.city].filter(Boolean).join(', '),
    [address.province, address.country || address.countryCode].filter(Boolean).join(', '),
    address.phone,
  ]
    .map((line) => String(line || '').trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const session = await getAuthUser();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Please sign in first.' }, { status: 401 });
  }

  const orderId = new URL(request.url).searchParams.get('id') || '';
  if (!orderId) {
    return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
  }

  await ensureDatabaseSchema();
  const result = await getPool().query(
    `SELECT id, user_id, order_number, items, total_amount, status, shipping_address,
            payment_method, created_at
       FROM orders
      WHERE id = $1`,
    [orderId]
  );
  const row = result.rows[0];
  if (!row) {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
  }

  if (row.user_id !== session.id) {
    const viewer = await getUserById(session.id);
    if (!viewer || viewer.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Not allowed' }, { status: 403 });
    }
  }

  const items: OrderItemRow[] = Array.isArray(row.items) ? row.items : [];
  const address: ShippingAddressRow = row.shipping_address || {};
  const identical = customerOrderNumberFields(String(row.order_number), String(row.status));
  const piNumber = `PI-${identical.orderNumber || identical.paymentReference || paymentReferenceFor(String(row.order_number))}`;
  const issuedAt = new Date().toISOString().slice(0, 10);
  const goodsTotal = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  const shippingFee =
    typeof address.shippingFee === 'number' && address.shippingFee > 0 ? address.shippingFee : 0;
  const shippingQuoted = Boolean(address.shippingQuoted);
  const total = Number(row.total_amount || 0);
  const bank = bankDetails();
  const tradeTerms = process.env.PI_TRADE_TERMS || 'To be confirmed by Adam Cutlery';
  const paymentTerms = process.env.PI_PAYMENT_TERMS || 'To be confirmed by Adam Cutlery';

  const itemRows = items
    .map((item) => {
      const quantity = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      return `<tr>
        <td>${escapeHtml(item.productName || item.productId || 'Item')}</td>
        <td class="num">${quantity}</td>
        <td class="num">${money(price)}</td>
        <td class="num">${money(price * quantity)}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(piNumber)} · Adam Cutlery</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #111; background: #f5f5f5; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; padding: 40px; border: 1px solid #ddd; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: .08em; }
  .muted { color: #666; font-size: 13px; }
  .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 18px; }
  .meta { text-align: right; font-size: 13px; line-height: 1.7; }
  .parties { display: flex; gap: 40px; margin: 24px 0; font-size: 13px; }
  .parties > div { flex: 1; }
  .parties h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #666; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border-bottom: 1px solid #e5e5e5; padding: 9px 8px; text-align: left; vertical-align: top; }
  th { background: #111; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 14px; margin-left: auto; width: 320px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .grand { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 15px; }
  .block { margin-top: 28px; font-size: 13px; line-height: 1.7; }
  .block h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #666; margin: 0 0 6px; }
  .note { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #666; line-height: 1.6; }
  .actions { max-width: 820px; margin: 0 auto 16px; display: flex; justify-content: flex-end; gap: 8px; }
  .actions button { padding: 9px 18px; border: 1px solid #111; background: #111; color: #fff; border-radius: 6px; cursor: pointer; font-size: 13px; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: 0; padding: 0; } .actions { display: none; } }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="sheet">
    <div class="head">
      <div>
        <h1>ADAM CUTLERY</h1>
        <div class="muted">Damascus &amp; custom knives · B2B</div>
        <div class="muted">info@adamcutlery.com</div>
      </div>
      <div class="meta">
        <div><strong>PROFORMA INVOICE</strong></div>
        <div>No. ${escapeHtml(piNumber)}</div>
        <div>Date: ${escapeHtml(issuedAt)}</div>
        <div>Status: ${escapeHtml(row.status)}</div>
      </div>
    </div>

    <div class="parties">
      <div>
        <h2>Bill to</h2>
        ${addressLines({ ...address, detail: address.detail, phone: undefined })
          .map((line) => `<div>${escapeHtml(line)}</div>`)
          .join('') || '<div>—</div>'}
      </div>
      <div>
        <h2>Ship to</h2>
        ${addressLines(address)
          .map((line) => `<div>${escapeHtml(line)}</div>`)
          .join('') || '<div>—</div>'}
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${itemRows || '<tr><td colspan="4">No items</td></tr>'}</tbody>
    </table>

    <div class="totals">
      <div><span>Goods subtotal</span><span>${money(goodsTotal)}</span></div>
      <div><span>Shipping</span><span>${shippingQuoted ? 'To be quoted' : money(shippingFee)}</span></div>
      <div class="grand"><span>Total</span><span>${money(total)}</span></div>
    </div>

    <div class="block">
      <h2>Terms</h2>
      <div>Trade terms: ${escapeHtml(tradeTerms)}</div>
      <div>Payment terms: ${escapeHtml(paymentTerms)}</div>
      <div>Validity: 7 days from the issue date.</div>
      <div>Documents: Commercial Invoice and Packing List accompany the shipment.</div>
    </div>

    <div class="block">
      <h2>Bank details</h2>
      <div>Account name: ${escapeHtml(bank.accountName)}${/adam cutlery/i.test(bank.accountName) ? '' : ' (registered company behind Adam Cutlery)'}</div>
      <div>Account number: ${escapeHtml(bank.accountNumber || 'Contact us for details')}</div>
      <div>Bank: ${escapeHtml(bank.bankName)}${bank.bankAddress ? ` · ${escapeHtml(bank.bankAddress)}` : ''}</div>
      ${bank.swift ? `<div>SWIFT: ${escapeHtml(bank.swift)}</div>` : ''}
      <div>Payment reference: ${escapeHtml(identical.paymentReference || identical.orderNumber)}</div>
    </div>

    <div class="note">
      This proforma invoice is issued for payment and customs preparation. It is not a tax
      invoice. Final freight, duties and taxes depend on the destination country and the
      shipping method confirmed by Adam Cutlery.
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
