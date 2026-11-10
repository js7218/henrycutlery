import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export interface OrderPayment {
  id: string;
  orderId: string;
  amountUsd: number;
  feeUsd: number;
  method: string;
  reference: string;
  receivedAt: string | null;
  note: string;
  createdAt: string;
}

export interface LedgerRow {
  orderId: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  goodsUsd: number;
  shippingUsd: number;
  shippingQuoted: boolean;
  expectedUsd: number;
  receivedUsd: number;
  feeUsd: number;
  varianceUsd: number;
  paymentCount: number;
}

export interface MonthRow {
  month: string;
  orders: number;
  expectedUsd: number;
  receivedUsd: number;
  shippingRevenueUsd: number;
  shippingCostUsd: number;
  varianceUsd: number;
  shippingVarianceUsd: number;
}

function mapPayment(row: Record<string, unknown>): OrderPayment {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    amountUsd: Number(row.amount_usd),
    feeUsd: Number(row.fee_usd),
    method: String(row.method || ''),
    reference: String(row.reference || ''),
    receivedAt: row.received_at ? new Date(String(row.received_at)).toISOString().slice(0, 10) : null,
    note: String(row.note || ''),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function listPayments(limit = 200): Promise<OrderPayment[]> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    'SELECT * FROM order_payments ORDER BY created_at DESC LIMIT $1',
    [Math.min(Math.max(limit, 1), 500)]
  );
  return result.rows.map(mapPayment);
}

export async function addPayment(input: {
  orderId?: unknown;
  amountUsd?: unknown;
  feeUsd?: unknown;
  method?: unknown;
  reference?: unknown;
  receivedAt?: unknown;
  note?: unknown;
}): Promise<OrderPayment | null> {
  const orderId = String(input.orderId || '').trim().slice(0, 120);
  const amountUsd = Number(input.amountUsd);
  const feeUsd = input.feeUsd === undefined || input.feeUsd === '' ? 0 : Number(input.feeUsd);
  if (!orderId || !Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 1_000_000) {
    return null;
  }
  if (!Number.isFinite(feeUsd) || feeUsd < 0 || feeUsd > 100_000) return null;

  await ensureDatabaseSchema();
  const pool = getPool();
  const order = await pool.query('SELECT id FROM orders WHERE id = $1', [orderId]);
  if (!order.rowCount) return null;

  const receivedAt =
    typeof input.receivedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.receivedAt)
      ? input.receivedAt
      : null;

  const result = await pool.query(
    `INSERT INTO order_payments
       (id, order_id, amount_usd, fee_usd, method, reference, received_at, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      `p${randomUUID()}`,
      orderId,
      Math.round(amountUsd * 100) / 100,
      Math.round(feeUsd * 100) / 100,
      String(input.method || '').slice(0, 50),
      String(input.reference || '').slice(0, 120),
      receivedAt,
      String(input.note || '').slice(0, 300),
    ]
  );
  return result.rowCount ? mapPayment(result.rows[0]) : null;
}

export async function deletePayment(id: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const result = await getPool().query('DELETE FROM order_payments WHERE id = $1', [id]);
  return Boolean(result.rowCount);
}

export async function getLedger(limit = 100): Promise<LedgerRow[]> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    `SELECT o.id,
            o.order_number,
            o.status,
            o.created_at,
            o.total_amount,
            COALESCE((o.shipping_address->>'shippingFee')::numeric, 0) AS shipping_fee,
            COALESCE((o.shipping_address->>'shippingQuoted')::boolean, false) AS shipping_quoted,
            COALESCE(p.received, 0) AS received,
            COALESCE(p.fees, 0) AS fees,
            COALESCE(p.payment_count, 0) AS payment_count
       FROM orders o
       LEFT JOIN (
         SELECT order_id,
                SUM(amount_usd) AS received,
                SUM(fee_usd) AS fees,
                COUNT(*)::int AS payment_count
           FROM order_payments
          GROUP BY order_id
       ) p ON p.order_id = o.id
      WHERE o.status <> 'cancelled'
      ORDER BY o.created_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 500)]
  );

  return result.rows.map((row) => {
    const expectedUsd = Number(row.total_amount || 0);
    const receivedUsd = Number(row.received || 0);
    const shippingUsd = Number(row.shipping_fee || 0);
    return {
      orderId: String(row.id),
      orderNumber: String(row.order_number || ''),
      status: String(row.status || ''),
      createdAt: new Date(String(row.created_at)).toISOString(),
      goodsUsd: Math.round((expectedUsd - shippingUsd) * 100) / 100,
      shippingUsd,
      shippingQuoted: Boolean(row.shipping_quoted),
      expectedUsd,
      receivedUsd,
      feeUsd: Number(row.fees || 0),
      varianceUsd: Math.round((receivedUsd - expectedUsd) * 100) / 100,
      paymentCount: Number(row.payment_count || 0),
    };
  });
}

export async function getMonthlySummary(): Promise<MonthRow[]> {
  await ensureDatabaseSchema();
  const pool = getPool();

  const [ordersResult, billsResult] = await Promise.all([
    pool.query(
      `SELECT to_char(date_trunc('month', o.created_at), 'YYYY-MM') AS month,
              COUNT(*)::int AS orders,
              SUM(o.total_amount) AS expected,
              SUM(COALESCE(p.received, 0)) AS received,
              SUM(COALESCE((o.shipping_address->>'shippingFee')::numeric, 0)) AS shipping_revenue
         FROM orders o
         LEFT JOIN (
           SELECT order_id, SUM(amount_usd) AS received
             FROM order_payments
            GROUP BY order_id
         ) p ON p.order_id = o.id
        WHERE o.status <> 'cancelled'
          AND o.created_at > NOW() - INTERVAL '12 months'
        GROUP BY 1
        ORDER BY 1 DESC`
    ),
    pool.query(
      `SELECT to_char(date_trunc('month', COALESCE(shipped_at, created_at::date)), 'YYYY-MM') AS month,
              SUM(billed_usd) AS cost
         FROM shipping_bills
        WHERE created_at > NOW() - INTERVAL '12 months'
        GROUP BY 1`
    ),
  ]);

  const costByMonth = new Map<string, number>(
    billsResult.rows.map((row) => [String(row.month), Number(row.cost || 0)])
  );

  return ordersResult.rows.map((row) => {
    const month = String(row.month);
    const expectedUsd = Number(row.expected || 0);
    const receivedUsd = Number(row.received || 0);
    const shippingRevenueUsd = Number(row.shipping_revenue || 0);
    const shippingCostUsd = costByMonth.get(month) || 0;
    return {
      month,
      orders: Number(row.orders || 0),
      expectedUsd,
      receivedUsd,
      shippingRevenueUsd,
      shippingCostUsd,
      varianceUsd: Math.round((receivedUsd - expectedUsd) * 100) / 100,
      shippingVarianceUsd: Math.round((shippingRevenueUsd - shippingCostUsd) * 100) / 100,
    };
  });
}
