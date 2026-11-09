'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { products } from '@/data/products';

interface Rate {
  countryCode: string;
  countryName: string;
  perKgUsd: number;
  updatedAt?: string;
}

export default function ShippingAdminPage() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [savingRates, setSavingRates] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);

  useEffect(() => {
    fetch('/api/shipping/rates')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Failed to load');
        setRates(data.rates || []);
        const map: Record<string, string> = {};
        for (const [id, kg] of Object.entries(data.weights || {})) {
          map[id] = String(kg);
        }
        setWeights(map);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products
      .filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [query]);

  async function saveRates() {
    setSavingRates(true);
    setError('');
    setStatus('');
    try {
      const res = await fetch('/api/admin/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setStatus('Shipping rates saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingRates(false);
    }
  }

  async function saveWeights() {
    setSavingWeights(true);
    setError('');
    setStatus('');
    try {
      const payload = Object.entries(weights)
        .map(([productId, value]) => ({ productId, weightKg: Number(value) }))
        .filter((item) => Number.isFinite(item.weightKg) && item.weightKg > 0);
      const res = await fetch('/api/admin/shipping/weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setStatus('Product weights saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingWeights(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <Link href="/hc-control-2026" className="text-sm text-gold hover:underline">&larr; Back to admin</Link>
          <h1 className="text-2xl font-semibold mt-2">Shipping Settings</h1>
          <p className="text-sm text-gray-400 mt-1">
            Shipping fee = total weight (kg) x per-kg rate of the destination country.
            Update rates when your carrier prices change.
          </p>
        </div>

        {status && <p className="text-sm text-green-400">{status}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-medium mb-1">Per-kg rates (USD)</h2>
              <p className="text-xs text-gray-500">
                Shipping is calculated from each item&apos;s own weight. Items without a weight show as
                &quot;To Be Quoted&quot; at checkout until you fill them in below.
              </p>
            </div>
            <button
              onClick={saveRates}
              disabled={savingRates}
              className="px-4 py-2 bg-gold text-background rounded text-sm font-medium disabled:opacity-50 whitespace-nowrap"
            >
              {savingRates ? 'Saving...' : 'Save rates'}
            </button>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 sticky top-0 bg-surface">
                <tr>
                  <th className="text-left py-2">Country</th>
                  <th className="text-left py-2">Code</th>
                  <th className="text-left py-2">USD / kg</th>
                  <th className="text-left py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate, index) => (
                  <tr key={rate.countryCode} className="border-t border-border">
                    <td className="py-1.5 pr-3">{rate.countryName}</td>
                    <td className="py-1.5 pr-3 text-gray-400">{rate.countryCode}</td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={rate.perKgUsd}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setRates((prev) => prev.map((item, i) => i === index ? { ...item, perKgUsd: value } : item));
                        }}
                        className="w-24 bg-background border border-border rounded px-2 py-1"
                      />
                    </td>
                    <td className="py-1.5 text-gray-500">
                      {rate.updatedAt ? new Date(rate.updatedAt).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Product weights (kg per unit)</h2>
            <button
              onClick={saveWeights}
              disabled={savingWeights}
              className="px-4 py-2 bg-gold text-background rounded text-sm font-medium disabled:opacity-50"
            >
              {savingWeights ? 'Saving...' : 'Save weights'}
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product id or name..."
            className="w-full mb-4 bg-background border border-border rounded px-3 py-2 text-sm"
          />
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 sticky top-0 bg-surface">
                <tr>
                  <th className="text-left py-2">Product</th>
                  <th className="text-left py-2">ID</th>
                  <th className="text-left py-2">kg / unit</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{product.name}</td>
                    <td className="py-1.5 pr-3 text-gray-400">{product.id}</td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={weights[product.id] ?? ''}
                        placeholder="default 0.4"
                        onChange={(e) => setWeights((prev) => ({ ...prev, [product.id]: e.target.value }))}
                        className="w-24 bg-background border border-border rounded px-2 py-1"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Leave blank to use the default 0.4 kg. Saving sends every non-empty value.
          </p>
        </section>
      </div>
    </div>
  );
}
