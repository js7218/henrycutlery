'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { products } from '@/data/products';
import AdminHint from '@/components/admin/AdminHint';

interface Rate {
  countryCode: string;
  countryName: string;
  // Kept as a string while editing so typing "0.3" does not lose the dot or
  // jump to -1 via the number input's spinner.
  perKgUsd: string;
  updatedAt?: string;
}

interface NegotiationSettingsForm {
  enabled: boolean;
  maxDiscountPct: string;
  floorRatio: string;
  minShippingUsd: string;
}

interface NegotiationLog {
  id: string;
  createdAt: string;
  countryCode: string;
  quoteUsd: number;
  finalUsd: number | null;
  granted: boolean;
  reply: string;
}

export default function ShippingAdminPage() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [savingRates, setSavingRates] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);
  const [negotiation, setNegotiation] = useState<NegotiationSettingsForm>({
    enabled: true,
    maxDiscountPct: '30',
    floorRatio: '0.7',
    minShippingUsd: '5',
  });
  const [negotiations, setNegotiations] = useState<NegotiationLog[]>([]);
  const [savingNegotiation, setSavingNegotiation] = useState(false);
  const [negotiationStatus, setNegotiationStatus] = useState('');
  const [negotiationError, setNegotiationError] = useState('');

  const missingWeightCount = useMemo(
    () => products.filter((product) => !weights[product.id]).length,
    [weights]
  );

  useEffect(() => {
    fetch('/api/shipping/rates')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Failed to load');
        const loaded: Rate[] = (data.rates || []).map((rate: Rate) => ({
          ...rate,
          perKgUsd: String(rate.perKgUsd),
        }));
        setRates(loaded);
        const map: Record<string, string> = {};
        for (const [id, kg] of Object.entries(data.weights || {})) {
          map[id] = String(kg);
        }
        setWeights(map);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    fetch('/api/admin/negotiation')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Failed to load');
        const settings = data.settings || {};
        setNegotiation({
          enabled: settings.enabled !== false,
          maxDiscountPct: String(settings.maxDiscountPct ?? 30),
          floorRatio: String(settings.floorRatio ?? 0.7),
          minShippingUsd: String(settings.minShippingUsd ?? 5),
        });
        setNegotiations(Array.isArray(data.negotiations) ? data.negotiations : []);
      })
      .catch((err) => setNegotiationError(err instanceof Error ? err.message : 'Failed to load'));
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
      const invalid = rates.find((rate) => {
        const value = Number(rate.perKgUsd);
        return !Number.isFinite(value) || value <= 0;
      });
      if (invalid) {
        setError(`Enter a valid USD/kg rate for ${invalid.countryName || invalid.countryCode}.`);
        return;
      }
      const res = await fetch('/api/admin/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rates: rates.map((rate) => ({ ...rate, perKgUsd: Number(rate.perKgUsd) })),
        }),
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
      const invalid = Object.entries(weights).find(([, value]) => {
        if (String(value).trim() === '') return false;
        const kg = Number(value);
        return !Number.isFinite(kg) || kg <= 0;
      });
      if (invalid) {
        setError(`Enter a valid weight in kg for ${invalid[0]}.`);
        return;
      }
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

  async function saveNegotiation() {
    setSavingNegotiation(true);
    setNegotiationError('');
    setNegotiationStatus('');
    try {
      const maxDiscountPct = Number(negotiation.maxDiscountPct);
      const floorRatio = Number(negotiation.floorRatio);
      const minShippingUsd = Number(negotiation.minShippingUsd);
      if (!Number.isFinite(maxDiscountPct) || maxDiscountPct < 0 || maxDiscountPct > 90) {
        setNegotiationError('Max discount must be between 0 and 90.');
        return;
      }
      if (!Number.isFinite(floorRatio) || floorRatio < 0.05 || floorRatio > 1) {
        setNegotiationError('Floor ratio must be between 0.05 and 1.');
        return;
      }
      if (!Number.isFinite(minShippingUsd) || minShippingUsd < 0 || minShippingUsd > 500) {
        setNegotiationError('Minimum shipping must be between 0 and 500.');
        return;
      }
      const res = await fetch('/api/admin/negotiation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: negotiation.enabled,
          maxDiscountPct,
          floorRatio,
          minShippingUsd,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setNegotiationStatus('Negotiation settings saved.');
    } catch (err) {
      setNegotiationError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingNegotiation(false);
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

        <AdminHint section="shipping">
          运费 = 订单总重量（kg）× 目的国的每公斤单价。货代涨价就改这里的单价，客户结账立刻按新价算。
          下面的产品重量也要填真实值，否则运费会算少。
        </AdminHint>

        {status && <p className="text-sm text-green-400">{status}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {missingWeightCount > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-300">
            {missingWeightCount} product{missingWeightCount === 1 ? '' : 's'} still use the default 0.4 kg.
            Shipping is calculated anyway; enter the real weight below for accurate freight.
          </div>
        )}

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-medium mb-1">Per-kg rates (USD)</h2>
              <p className="text-xs text-gray-500">
                Shipping is calculated from each item&apos;s own weight (default 0.4 kg when blank).
                Type any decimal, e.g. 0.3, 1 or 0.25.
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
                        type="text"
                        inputMode="decimal"
                        value={rate.perKgUsd}
                        onChange={(e) => {
                          const value = e.target.value;
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
                        type="text"
                        inputMode="decimal"
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

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-medium mb-1">Shipping negotiation (AI)</h2>
              <p className="text-xs text-gray-500">
                The assistant may lower the shipping fee, never below max(quote x floor ratio,
                minimum shipping, quote x (1 - max discount)). Product prices are never negotiable.
              </p>
            </div>
            <button
              onClick={saveNegotiation}
              disabled={savingNegotiation}
              className="px-4 py-2 bg-gold text-background rounded text-sm font-medium disabled:opacity-50 whitespace-nowrap"
            >
              {savingNegotiation ? 'Saving...' : 'Save'}
            </button>
          </div>

          {negotiationStatus && <p className="text-sm text-green-400 mb-3">{negotiationStatus}</p>}
          {negotiationError && <p className="text-sm text-red-400 mb-3">{negotiationError}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={negotiation.enabled}
                onChange={(e) => setNegotiation((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              Enable negotiation
            </label>
            <div className="text-sm">
              <label className="block text-gray-400 mb-1" htmlFor="negotiation-max-discount">
                Max discount %
              </label>
              <input
                id="negotiation-max-discount"
                type="text"
                inputMode="decimal"
                value={negotiation.maxDiscountPct}
                onChange={(e) => setNegotiation((prev) => ({ ...prev, maxDiscountPct: e.target.value }))}
                className="w-28 bg-background border border-border rounded px-2 py-1"
              />
            </div>
            <div className="text-sm">
              <label className="block text-gray-400 mb-1" htmlFor="negotiation-floor-ratio">
                Floor ratio (0-1, e.g. 0.7)
              </label>
              <input
                id="negotiation-floor-ratio"
                type="text"
                inputMode="decimal"
                value={negotiation.floorRatio}
                onChange={(e) => setNegotiation((prev) => ({ ...prev, floorRatio: e.target.value }))}
                className="w-28 bg-background border border-border rounded px-2 py-1"
              />
            </div>
            <div className="text-sm">
              <label className="block text-gray-400 mb-1" htmlFor="negotiation-min-shipping">
                Minimum shipping USD
              </label>
              <input
                id="negotiation-min-shipping"
                type="text"
                inputMode="decimal"
                value={negotiation.minShippingUsd}
                onChange={(e) => setNegotiation((prev) => ({ ...prev, minShippingUsd: e.target.value }))}
                className="w-28 bg-background border border-border rounded px-2 py-1"
              />
            </div>
          </div>

          <h3 className="text-sm font-medium mb-2">Last 10 negotiations</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-2">Time</th>
                  <th className="text-left py-2">Country</th>
                  <th className="text-left py-2">Quote → Final</th>
                  <th className="text-left py-2">Granted</th>
                </tr>
              </thead>
              <tbody>
                {negotiations.slice(0, 10).map((log) => (
                  <tr key={log.id} className="border-t border-border">
                    <td className="py-1.5 pr-3 text-gray-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-400">{log.countryCode || '-'}</td>
                    <td className="py-1.5 pr-3">
                      ${log.quoteUsd.toFixed(2)}
                      {' → '}
                      {log.finalUsd === null ? '-' : `$${log.finalUsd.toFixed(2)}`}
                    </td>
                    <td className="py-1.5 pr-3">{log.granted ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {negotiations.length === 0 && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={4}>
                      No negotiations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
