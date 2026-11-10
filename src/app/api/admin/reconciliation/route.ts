import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import {
  addPayment,
  deletePayment,
  getLedger,
  getMonthlySummary,
  listPayments,
} from '@/lib/reconciliation';

export const dynamic = 'force-dynamic';

async function loadSnapshot() {
  const [ledger, months, payments] = await Promise.all([
    getLedger(100),
    getMonthlySummary(),
    listPayments(100),
  ]);
  return { ledger, months, payments };
}

export async function GET() {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  return NextResponse.json({ success: true, ...(await loadSnapshot()) });
}

export async function POST(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  const body = await request.json().catch(() => null);
  const payment = await addPayment(body || {});
  if (!payment) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid payment: need an existing order, amount above 0 and a fee of 0 or more.',
      },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true, payment, ...(await loadSnapshot()) });
}

export async function DELETE(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) {
    return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
  }
  const removed = await deletePayment(id);
  if (!removed) {
    return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, ...(await loadSnapshot()) });
}
