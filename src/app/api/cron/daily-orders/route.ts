import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { sendTransactionalEmail, getAdminNotifyEmails } from '@/lib/orderEmail';
import { formatPrice } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

type DailyOrderRow = {
  order_number: string;
  total_amount: string | number;
  status: string;
  payment_method: string;
  created_at: Date;
};

/**
 * GET /api/cron/daily-orders
 *
 * Summarises the previous calendar day (Asia/Shanghai) and emails the owner.
 * Triggered by Vercel Cron at 09:00 Shanghai time (01:00 UTC).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authorization = request.headers.get('authorization');
    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET is not configured' },
      { status: 503 }
    );
  }

  try {
    await ensureDatabaseSchema();

    // Previous day boundaries in Asia/Shanghai.
    const shanghaiNow = new Date(Date.now() + SHANGHAI_OFFSET_MS);
    const startOfTodayShanghai = Date.UTC(
      shanghaiNow.getUTCFullYear(),
      shanghaiNow.getUTCMonth(),
      shanghaiNow.getUTCDate()
    );
    const startMs = startOfTodayShanghai - SHANGHAI_OFFSET_MS - 24 * 60 * 60 * 1000;
    const endMs = startOfTodayShanghai - SHANGHAI_OFFSET_MS;
    const start = new Date(startMs);
    const end = new Date(endMs);
    const dayLabel = new Date(startMs + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);

    const result = await getPool().query<DailyOrderRow>(
      `SELECT order_number, total_amount, status, payment_method, created_at
       FROM orders
       WHERE created_at >= $1 AND created_at < $2
       ORDER BY created_at ASC`,
      [start, end]
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        date: dayLabel,
        count: 0,
        message: 'No orders yesterday; summary email skipped.',
      });
    }

    const validOrders = rows.filter((row) => row.status !== 'cancelled');
    const totalAmount = validOrders.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const paidCount = rows.filter((row) => ['paid', 'shipped', 'delivered'].includes(row.status)).length;
    const pendingCount = rows.filter((row) => row.status === 'pending').length;
    const cancelledCount = rows.filter((row) => row.status === 'cancelled').length;

    const orderRows = rows.map((row) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${row.order_number}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(Number(row.total_amount || 0))}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${row.status}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${row.payment_method}</td>
      </tr>
    `).join('');

    const text = [
      `Adam Cutlery daily order summary - ${dayLabel}`,
      '',
      `Orders: ${rows.length}`,
      `Gross total (excluding cancelled): ${formatPrice(totalAmount)}`,
      `Paid/shipped/delivered: ${paidCount}`,
      `Pending payment: ${pendingCount}`,
      `Cancelled: ${cancelledCount}`,
      '',
      'Orders:',
      ...rows.map((row) => `${row.order_number} | ${formatPrice(Number(row.total_amount || 0))} | ${row.status} | ${row.payment_method}`),
    ].join('\n');

    const html = `
      <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;">
        <h2 style="margin:0 0 12px;">Adam Cutlery Daily Summary - ${dayLabel}</h2>
        <p><strong>Orders:</strong> ${rows.length}</p>
        <p><strong>Gross total (excluding cancelled):</strong> ${formatPrice(totalAmount)}</p>
        <p><strong>Paid / shipped / delivered:</strong> ${paidCount}</p>
        <p><strong>Pending payment:</strong> ${pendingCount}</p>
        <p><strong>Cancelled:</strong> ${cancelledCount}</p>

        <h3 style="margin-top:20px;">Orders</h3>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <thead>
            <tr>
              <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Order</th>
              <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Amount</th>
              <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Status</th>
              <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Payment</th>
            </tr>
          </thead>
          <tbody>${orderRows}</tbody>
        </table>
      </div>
    `;

    const mailResult = await sendTransactionalEmail({
      to: getAdminNotifyEmails(),
      subject: `Adam Cutlery Daily Summary - ${dayLabel}`,
      text,
      html,
    });

    return NextResponse.json({
      success: true,
      date: dayLabel,
      count: rows.length,
      totalAmount,
      paidCount,
      pendingCount,
      cancelledCount,
      email: mailResult,
    });
  } catch (err) {
    console.error('[cron/daily-orders] error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to build daily summary' }, { status: 500 });
  }
}
