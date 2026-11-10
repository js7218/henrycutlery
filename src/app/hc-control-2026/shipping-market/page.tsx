'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface MarketRow {
  countryCode: string;
  low: number;
  median: number;
  high: number;
  count: number;
  capturedAt: string;
}

interface RateRow {
  countryCode: string;
  countryName: string;
  perKgUsd: number;
  updatedAt: string;
}

interface SourceRow {
  id: string;
  countryCode: string;
  label: string;
  url: string;
  unit: 'usd_per_kg' | 'cny_per_kg';
  regex: string;
  enabled: boolean;
  notes: string;
}

interface ChangeRow {
  id: string;
  countryCode: string;
  beforeUsd: number | null;
  afterUsd: number;
  source: string;
  note: string;
  changedAt: string;
}

interface Snapshot {
  fx: { rate: number; source: string; capturedAt: string } | null;
  summary: MarketRow[];
  rates: RateRow[];
  sources: SourceRow[];
  changes: ChangeRow[];
}

const EMPTY_SOURCE = {
  countryCode: '',
  label: '',
  url: '',
  unit: 'usd_per_kg' as 'usd_per_kg' | 'cny_per_kg',
  regex: '',
  notes: '',
};

export default function ShippingMarketAdminPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    fx: null,
    summary: [],
    rates: [],
    sources: [],
    changes: [],
  });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [savingRate, setSavingRate] = useState('');
  const [sourceForm, setSourceForm] = useState({ ...EMPTY_SOURCE });
  const [savingSource, setSavingSource] = useState(false);

  function applySnapshot(data: Partial<Snapshot>) {
    setSnapshot({
      fx: data.fx ?? null,
      summary: data.summary || [],
      rates: data.rates || [],
      sources: data.sources || [],
      changes: data.changes || [],
    });
    const next: Record<string, string> = {};
    for (const rate of data.rates || []) {
      next[rate.countryCode] = String(rate.perKgUsd);
    }
    setInputs(next);
  }

  useEffect(() => {
    fetch('/api/admin/shipping-market')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Failed to load');
        applySnapshot(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const rows = useMemo(() => {
    const map = new Map<string, { rate?: RateRow; market?: MarketRow }>();
    for (const rate of snapshot.rates) map.set(rate.countryCode, { rate });
    for (const market of snapshot.summary) {
      const entry = map.get(market.countryCode) || {};
      entry.market = market;
      map.set(market.countryCode, entry);
    }
    return [...map.entries()]
      .map(([countryCode, value]) => ({ countryCode, ...value }))
      .sort((a, b) => a.countryCode.localeCompare(b.countryCode));
  }, [snapshot]);

  async function runCapture() {
    setRunning(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/shipping-market', { method: 'PUT' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Capture failed');
      applySnapshot(data);
      setStatus(
        `Capture finished: ${data.captured} price(s), ${data.failed} failed. FX ${
          data.fxUsdCny ? data.fxUsdCny.toFixed(4) : 'unavailable'
        }.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capture failed');
    } finally {
      setRunning(false);
    }
  }

  async function applyRate(countryCode: string) {
    const value = Number(inputs[countryCode]);
    setSavingRate(countryCode);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/shipping-market', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode, perKgUsd: value, source: 'admin review' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Apply failed');
      applySnapshot(data);
      setStatus(`${countryCode} rate updated to $${value}/kg.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setSavingRate('');
    }
  }

  async function addSource() {
    setSavingSource(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/shipping-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      applySnapshot(data);
      setSourceForm({ ...EMPTY_SOURCE });
      setStatus('Price source saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingSource(false);
    }
  }

  async function removeSource(id: string) {
    setStatus('');
    setError('');
    try {
      const res = await fetch(`/api/admin/shipping-market?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed');
      applySnapshot(data);
      setStatus('Price source removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <Link href="/hc-control-2026" className="text-sm text-gold hover:underline">
            &larr; Back to admin
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Shipping Rate Monitor</h1>
          <p className="text-sm text-gray-400 mt-1">
            Records the USD/CNY rate and one price per configured source, daily. Nothing changes
            automatically — review a row and press Apply.
          </p>
        </div>

        {status && <p className="text-sm text-green-400">{status}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium mb-1">USD / CNY</h2>
              <p className="text-sm text-gray-400">
                {snapshot.fx
                  ? `${snapshot.fx.rate.toFixed(4)} · ${snapshot.fx.source} · ${new Date(
                      snapshot.fx.capturedAt
                    ).toLocaleString()}`
                  : 'No rate captured yet.'}
              </p>
            </div>
            <button
              onClick={runCapture}
              disabled={running}
              className="px-4 py-2 bg-gold text-background rounded text-sm font-medium disabled:opacity-50"
            >
              {running ? 'Capturing...' : 'Run capture now'}
            </button>
          </div>
        </section>

        <section className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-lg font-medium mb-1">Rates vs market</h2>
          <p className="text-xs text-gray-500 mb-4">
            Market range is the last 24 hours across successful sources. A median below your
            current rate usually means you are pricing above the market.
          </p>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-2">Country</th>
                  <th className="text-left py-2">Your USD/kg</th>
                  <th className="text-left py-2"></th>
                  <th className="text-left py-2">Market (24h)</th>
                  <th className="text-left py-2">Sources</th>
                  <th className="text-left py-2">Captured</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ countryCode, rate, market }) => (
                  <tr key={countryCode} className="border-t border-border">
                    <td className="py-2 pr-3">
                      {countryCode}
                      <span className="text-gray-500"> {rate?.countryName || ''}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={inputs[countryCode] ?? ''}
                        onChange={(e) =>
                          setInputs((prev) => ({ ...prev, [countryCode]: e.target.value }))
                        }
                        className={`w-24 bg-background border rounded px-2 py-1 ${
                          market && Number(inputs[countryCode]) > market.high * 1.5
                            ? 'border-yellow-500/60'
                            : 'border-border'
                        }`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        onClick={() => applyRate(countryCode)}
                        disabled={savingRate === countryCode}
                        className="px-3 py-1 bg-gold text-background rounded text-xs font-medium disabled:opacity-50"
                      >
                        {savingRate === countryCode ? 'Saving...' : 'Apply'}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-gray-300">
                      {market
                        ? `$${market.low.toFixed(2)} – $${market.high.toFixed(2)} (median $${market.median.toFixed(2)})`
                        : '-'}
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{market ? market.count : '-'}</td>
                    <td className="py-2 text-gray-500">
                      {market ? new Date(market.capturedAt).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-lg font-medium mb-1">Price sources</h2>
          <p className="text-xs text-gray-500 mb-4">
            Add a public carrier or forwarder page. The crawler reads it daily and records one
            per-kg price. Leave the regex blank to use the built-in patterns.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <input
              value={sourceForm.countryCode}
              onChange={(e) => setSourceForm((prev) => ({ ...prev, countryCode: e.target.value }))}
              placeholder="Country code, e.g. US"
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            />
            <input
              value={sourceForm.label}
              onChange={(e) => setSourceForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="Label, e.g. Shenzhen forwarder"
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            />
            <input
              value={sourceForm.url}
              onChange={(e) => setSourceForm((prev) => ({ ...prev, url: e.target.value }))}
              placeholder="https://..."
              className="sm:col-span-2 bg-background border border-border rounded px-2 py-1 text-sm"
            />
            <select
              value={sourceForm.unit}
              onChange={(e) =>
                setSourceForm((prev) => ({
                  ...prev,
                  unit: e.target.value === 'cny_per_kg' ? 'cny_per_kg' : 'usd_per_kg',
                }))
              }
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            >
              <option value="usd_per_kg">Page shows USD/kg</option>
              <option value="cny_per_kg">Page shows CNY/kg</option>
            </select>
            <input
              value={sourceForm.regex}
              onChange={(e) => setSourceForm((prev) => ({ ...prev, regex: e.target.value }))}
              placeholder="Optional regex, first group is the price"
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            />
            <button
              onClick={addSource}
              disabled={savingSource || !sourceForm.url || !sourceForm.countryCode}
              className="sm:col-span-2 px-4 py-2 bg-gold text-background rounded text-sm font-medium disabled:opacity-50"
            >
              {savingSource ? 'Saving...' : 'Add source'}
            </button>
          </div>

          <div className="space-y-2">
            {snapshot.sources.map((source) => (
              <div
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-border rounded px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="text-gold">{source.countryCode}</span> {source.label}
                    {!source.enabled && <span className="text-gray-500"> (disabled)</span>}
                  </p>
                  <p className="truncate text-xs text-gray-500">{source.url}</p>
                </div>
                <button
                  onClick={() => removeSource(source.id)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
            {snapshot.sources.length === 0 && (
              <p className="text-sm text-gray-500">
                No sources yet. Add the forwarder pages you want to track.
              </p>
            )}
          </div>
        </section>

        <section className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-lg font-medium mb-3">Recent rate changes</h2>
          <div className="space-y-2 text-sm">
            {snapshot.changes.map((change) => (
              <div key={change.id} className="flex flex-wrap gap-2 text-gray-300">
                <span className="text-gold w-10">{change.countryCode}</span>
                <span>
                  {change.beforeUsd === null ? 'new' : `$${change.beforeUsd.toFixed(2)}`} &rarr; $
                  {change.afterUsd.toFixed(2)}
                </span>
                <span className="text-gray-500">
                  {change.source} · {new Date(change.changedAt).toLocaleString()}
                </span>
              </div>
            ))}
            {snapshot.changes.length === 0 && (
              <p className="text-gray-500">No rate changes recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
