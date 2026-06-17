import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { sendOrderNotificationEmail, sendTransactionalEmail } from '@/lib/orderEmail';

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  reference: string;
  raw: string[];
}

interface MatchResult {
  transaction: ParsedTransaction;
  orderId: string | null;
  orderNumber: string | null;
  status: 'matched' | 'ambiguous' | 'unmatched';
  reason: string;
}

/**
 * Parse HSBC-style CSV bank statement.
 * Handles common HSBC export formats with Date, Description, Amount, Balance, Reference columns.
 */
function parseBankStatementCSV(csvText: string): ParsedTransaction[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  // Detect header row
  const headerLine = lines[0].toLowerCase();
  const hasHeader = headerLine.includes('date') || headerLine.includes('description') || headerLine.includes('amount');
  const startIndex = hasHeader ? 1 : 0;

  const transactions: ParsedTransaction[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line respecting quoted fields
    const fields = parseCSVLine(line);
    if (fields.length < 3) continue;

    // Try to identify columns
    const dateStr = fields.find(f => /^\d{4}[-/]\d{2}[-/]\d{2}/.test(f.trim())) || fields[0];
    const amountStr = fields.find(f => /^-?\d+\.?\d*$/.test(f.trim().replace(/,/g, ''))) || '';
    // Reference / description: look for text that might contain order number
    const reference = fields.find(f => /AC-\d{8}-\d{3}/i.test(f)) || '';
    const description = fields.find(f => f.length > 5 && !/^\d{4}[-/]\d{2}/.test(f) && !/^-?\d+\.?\d*$/.test(f.replace(/,/g, ''))) || fields[1] || '';

    const amount = parseFloat(amountStr.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) continue; // Only credit (positive) transactions

    transactions.push({
      date: dateStr.trim(),
      description: description.trim(),
      amount,
      reference: reference.trim(),
      raw: fields,
    });
  }

  return transactions;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Match transactions against pending orders.
 * Priority 1: Order number in reference (100% match)
 * Priority 2: Amount + date fuzzy match (within 3 days)
 */
async function matchTransactions(
  transactions: ParsedTransaction[],
  pool: any
): Promise<MatchResult[]> {
  // Get all pending orders
  const ordersResult = await pool.query(
    `SELECT id, order_number, total_amount, status, shipping_address, items, created_at, user_id
     FROM orders WHERE status = 'pending' ORDER BY created_at DESC`
  );
  const pendingOrders: Array<{
    id: string;
    order_number: string;
    total_amount: number;
    status: string;
    shipping_address: unknown;
    items: unknown;
    created_at: Date;
    user_id: string;
  }> = ordersResult.rows;

  const results: MatchResult[] = [];

  for (const tx of transactions) {
    let matched = false;

    // Priority 1: Order number exact match
    const orderNumberMatch = tx.reference.match(/AC-\d{8}-\d{3}/i);
    if (orderNumberMatch) {
      const orderNumber = orderNumberMatch[0].toUpperCase();
      const order = pendingOrders.find((o) => o.order_number === orderNumber);
      if (order) {
        // Verify amount matches (allow small difference for fees/rounding)
        const amountDiff = Math.abs(Number(order.total_amount) - tx.amount);
        if (amountDiff <= 1) {
          results.push({
            transaction: tx,
            orderId: order.id,
            orderNumber: order.order_number,
            status: 'matched',
            reason: 'Order number exact match',
          });
          matched = true;
        } else {
          results.push({
            transaction: tx,
            orderId: order.id,
            orderNumber: order.order_number,
            status: 'ambiguous',
            reason: `Order number matched but amount differs: order=${order.total_amount}, tx=${tx.amount}`,
          });
          matched = true;
        }
      }
    }

    if (matched) continue;

    // Priority 2: Amount + date fuzzy match
    const txDate = new Date(tx.date);
    const matchingOrders = pendingOrders.filter((o) => {
      const orderDate = new Date(o.created_at);
      const daysDiff = Math.abs(txDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
      const amountDiff = Math.abs(Number(o.total_amount) - tx.amount);
      return daysDiff <= 3 && amountDiff <= 1;
    });

    if (matchingOrders.length === 1) {
      results.push({
        transaction: tx,
        orderId: matchingOrders[0].id,
        orderNumber: matchingOrders[0].order_number,
        status: 'matched',
        reason: 'Amount + date fuzzy match',
      });
    } else if (matchingOrders.length > 1) {
      results.push({
        transaction: tx,
        orderId: null,
        orderNumber: null,
        status: 'ambiguous',
        reason: `Multiple orders match amount ${tx.amount} within 3 days`,
      });
    } else {
      results.push({
        transaction: tx,
        orderId: null,
        orderNumber: null,
        status: 'unmatched',
        reason: 'No matching order found',
      });
    }
  }

  return results;
}

/**
 * POST /api/admin/bank-import
 * Upload and process bank statement CSV
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyJWT(token);
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const csvText = await file.text();
    const transactions = parseBankStatementCSV(csvText);

    if (transactions.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid transactions found in CSV' }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const pool = getPool();

    const matchResults = await matchTransactions(transactions, pool);

    // Process matched orders
    const processed: { orderNumber: string; amount: number }[] = [];
    const ambiguous: { amount: number; reason: string }[] = [];
    const unmatched: { amount: number; reason: string }[] = [];
    let totalMatched = 0;
    let totalUnmatched = 0;

    for (const result of matchResults) {
      if (result.status === 'matched' && result.orderId) {
        // Update order status to paid
        await pool.query(
          `UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = $1`,
          [result.orderId]
        );

        // Send payment confirmation email to admin
        try {
          const orderResult = await pool.query(
            `SELECT order_number, total_amount, shipping_address, items, created_at
             FROM orders WHERE id = $1`,
            [result.orderId]
          );
          const order = orderResult.rows[0];
          if (order) {
            await sendOrderNotificationEmail({
              orderNumber: order.order_number,
              totalAmount: Number(order.total_amount),
              paymentMethod: 'bank_transfer',
              items: Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]'),
              shippingAddress: typeof order.shipping_address === 'string'
                ? JSON.parse(order.shipping_address)
                : order.shipping_address,
              createdAt: order.created_at?.toString() || new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error('[bank-import] Failed to send email for order:', result.orderNumber, err);
        }

        processed.push({ orderNumber: result.orderNumber!, amount: result.transaction.amount });
        totalMatched++;
      } else if (result.status === 'ambiguous') {
        ambiguous.push({ amount: result.transaction.amount, reason: result.reason });
        totalUnmatched++;
      } else {
        unmatched.push({ amount: result.transaction.amount, reason: result.reason });
        totalUnmatched++;
      }
    }

    // Send summary email to admin
    try {
      const summaryHtml = `
        <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;">
          <h2>Bank Statement Import Summary</h2>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Total Transactions:</strong> ${transactions.length}</p>
          <p><strong>Auto-Matched:</strong> ${totalMatched}</p>
          <p><strong>Needs Review:</strong> ${totalUnmatched}</p>
          
          ${processed.length > 0 ? `
          <h3>Matched Orders</h3>
          <ul>
            ${processed.map(p => `<li>${p.orderNumber} - $${p.amount.toFixed(2)}</li>`).join('')}
          </ul>
          ` : ''}
          
          ${ambiguous.length > 0 ? `
          <h3>Ambiguous (Needs Manual Review)</h3>
          <ul>
            ${ambiguous.map(a => `<li>$${a.amount.toFixed(2)} - ${a.reason}</li>`).join('')}
          </ul>
          ` : ''}
          
          ${unmatched.length > 0 ? `
          <h3>Unmatched</h3>
          <ul>
            ${unmatched.map(u => `<li>$${u.amount.toFixed(2)} - ${u.reason}</li>`).join('')}
          </ul>
          ` : ''}
        </div>
      `;

      await sendTransactionalEmail({
        to: process.env.ORDER_RECEIVER_EMAIL || 'rjyy_88@qq.com',
        subject: `Bank Import Summary - ${new Date().toLocaleDateString()}`,
        html: summaryHtml,
        text: `Bank Statement Import Summary\nDate: ${new Date().toLocaleDateString()}\nTotal: ${transactions.length}\nMatched: ${totalMatched}\nNeeds Review: ${totalUnmatched}`,
      });
    } catch (err) {
      console.error('[bank-import] Failed to send summary email:', err);
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalTransactions: transactions.length,
        matched: totalMatched,
        needsReview: totalUnmatched,
      },
      processed,
      ambiguous,
      unmatched,
    });

  } catch (err) {
    console.error('[bank-import] error:', err);
    return NextResponse.json({ success: false, error: 'Failed to process bank statement' }, { status: 500 });
  }
}
