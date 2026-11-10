'use client';

import { useEffect, useState } from 'react';

interface LedgerRow {
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

interface MonthRow {
  month: string;
  orders: number;
  expectedUsd: number;
  receivedUsd: number;
  shippingRevenueUsd: number;
  shippingCostUsd: number;
  varianceUsd: number;
  shippingVarianceUsd: number;
}

interface PaymentRow {
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

interface Snapshot {
  ledger: LedgerRow[];
  months: MonthRow[];
  payments: PaymentRow[];
}

const EMPTY_FORM = {
  amountUsd: '',
  feeUsd: '',
  method: '',
  reference: '',
  receivedAt: '',
  note: '',
};

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function ReconciliationPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ ledger: [], months: [], payments: [] });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/reconciliation')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Failed to load');
        setSnapshot({
          ledger: data.ledger || [],
          months: data.months || [],
          payments: data.payments || [],
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  function applySnapshot(data: Partial<Snapshot>) {
    setSnapshot({
      ledger: data.ledger || [],
      months: data.months || [],
      payments: data.payments || [],
    });
  }

  async function addPayment(orderId: string) {
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      applySnapshot(data);
      setForm({ ...EMPTY_FORM });
      setEditing('');
      setStatus('Payment recorded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function removePayment(id: string) {
    if (!window.confirm('Delete this payment?')) return;
    setStatus('');
    setError('');
    try {
      const res = await fetch(`/api/admin/reconciliation?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed');
      applySnapshot(data);
      setStatus('Payment deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 text-foreground">
      <h1 className="text-2xl font-bold mb-2">Reconciliation</h1>
      <p className="text-sm text-gray-500 mb-6">
        Compare what each order should collect, what actually arrived, and what the forwarder
        charged for freight. Variance is received minus expected.
      </p>

      {status && <p className="text-sm text-green-400 mb-3">{status}</p>}
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      <section className="bg-surface border border-border rounded-lg p-5 mb-6">
        <h2 className="text-lg font-medium mb-3">Monthly</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left py-2">Month</th>
                <th className="text-right py-2">Orders</th>
                <th className="text-right py-2">Expected</th>
                <th className="text-right py-2">Received</th>
                <th className="text-right py-2">Order variance</th>
                <th className="text-right py-2">Freight in</th>
                <th className="text-right py-2">Freight cost</th>
                <th className="text-right py-2">Freight variance</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.months.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-gray-500">
                    No orders in the last 12 months.
                  </td>
                </tr>
              ) : (
                snapshot.months.map((row) => (
                  <tr key={row.month} className="border-t border-border">
                    <td className="py-2">{row.month}</td>
                    <td className="py-2 text-right text-gray-300">{row.orders}</td>
                    <td className="py-2 text-right text-gray-300">{money(row.expectedUsd)}</td>
                    <td className="py-2 text-right text-gray-300">{money(row.receivedUsd)}</td>
                    <td
                      className={`py-2 text-right ${row.varianceUsd < -0.01 ? 'text-red-400' : 'text-gray-300'}`}
                    >
                      {money(row.varianceUsd)}
                    </td>
                    <td className="py-2 text-right text-gray-300">{money(row.shippingRevenueUsd)}</td>
                    <td className="py-2 text-right text-gray-300">{money(row.shippingCostUsd)}</td>
                    <td
                      className={`py-2 text-right ${row.shippingVarianceUsd < -0.01 ? 'text-red-400' : 'text-gray-300'}`}
                    >
                      {money(row.shippingVarianceUsd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-surface border border-border rounded-lg p-5 mb-6">
        <h2 className="text-lg font-medium mb-3">Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left py-2">Order</th>
                <th className="text-right py-2">Goods</th>
                <th className="text-right py-2">Freight</th>
                <th className="text-right py-2">Expected</th>
                <th className="text-right py-2">Received</th>
                <th className="text-right py-2">Variance</th>
                <th className="text-left py-2"></th>
              </tr>
            </thead>
            <tbody>
              {snapshot.ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-gray-500">
                    No orders yet.
                  </td>
                </tr>
              ) : (
                snapshot.ledger.map((row) => (
                  <tr key={row.orderId} className="border-t border-border align-top">
                    <td className="py-2 pr-3">
                      <div>{row.orderNumber.slice(0, 18)}</div>
                      <div className="text-xs text-gray-500">
                        {row.status} · {new Date(row.createdAt).toLocaleDateString()} ·{' '}
                        {row.paymentCount} payment(s)
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-300">{money(row.goodsUsd)}</td>
                    <td className="py-2 pr-3 text-right text-gray-300">
                      {row.shippingQuoted ? 'TBD' : money(row.shippingUsd)}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-300">{money(row.expectedUsd)}</td>
                    <td className="py-2 pr-3 text-right text-gray-300">{money(row.receivedUsd)}</td>
                    <td
                      className={`py-2 pr-3 text-right ${row.varianceUsd < -0.01 ? 'text-red-400' : 'text-gray-300'}`}
                    >
                      {money(row.varianceUsd)}
                    </td>
                    <td className="py-2">
                      {editing === row.orderId ? (
                        <div className="space-y-2 min-w-[260px]">
                          <input
                            value={form.amountUsd}
                            onChange={(e) => setForm((p) => ({ ...p, amountUsd: e.target.value }))}
                            placeholder="Amount USD"
                            inputMode="decimal"
                            className="w-full bg-background border border-border rounded px-2 py-1"
                          />
                          <input
                            value={form.feeUsd}
                            onChange={(e) => setForm((p) => ({ ...p, feeUsd: e.target.value }))}
                            placeholder="Bank fee USD"
                            inputMode="decimal"
                            className="w-full bg-background border border-border rounded px-2 py-1"
                          />
                          <input
                            value={form.method}
                            onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}
                            placeholder="Method (HSBC, WeChat...)"
                            className="w-full bg-background border border-border rounded px-2 py-1"
                          />
                          <input
                            value={form.reference}
                            onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
                            placeholder="Reference"
                            className="w-full bg-background border border-border rounded px-2 py-1"
                          />
                          <input
                            type="date"
                            value={form.receivedAt}
                            onChange={(e) => setForm((p) => ({ ...p, receivedAt: e.target.value }))}
                            className="w-full bg-background border border-border rounded px-2 py-1"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => addPayment(row.orderId)}
                              disabled={saving}
                              className="px-3 py-1 bg-gold text-background rounded text-xs font-medium disabled:opacity-50"
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => {
                                setEditing('');
                                setForm({ ...EMPTY_FORM });
                              }}
                              className="px-3 py-1 border border-border rounded text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditing(row.orderId);
                            setForm({ ...EMPTY_FORM });
                          }}
                          className="px-3 py-1 border border-border rounded text-xs text-gray-300"
                        >
                          Add payment
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-lg font-medium mb-3">Recorded payments</h2>
        {snapshot.payments.length === 0 ? (
          <p className="text-sm text-gray-500">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="text-left py-2">Received</th>
                  <th className="text-right py-2">Amount</th>
                  <th className="text-right py-2">Fee</th>
                  <th className="text-left py-2">Method</th>
                  <th className="text-left py-2">Reference</th>
                  <th className="text-left py-2"></th>
                </tr>
              </thead>
              <tbody>
                {snapshot.payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-border">
                    <td className="py-2">{payment.receivedAt || payment.createdAt.slice(0, 10)}</td>
                    <td className="py-2 text-right text-gray-300">{money(payment.amountUsd)}</td>
                    <td className="py-2 text-right text-gray-300">{money(payment.feeUsd)}</td>
                    <td className="py-2 text-gray-400">{payment.method || '-'}</td>
                    <td className="py-2 text-gray-400">{payment.reference || '-'}</td>
                    <td className="py-2">
                      <button
                        onClick={() => removePayment(payment.id)}
                        className="px-2 py-1 border border-border rounded text-xs text-gray-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
