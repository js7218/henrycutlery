'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminHint from '@/components/admin/AdminHint';

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
  floorUsdPerKg: number | null;
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

interface BillRow {
  id: string;
  countryCode: string;
  weightKg: number;
  billedUsd: number;
  channel: string;
  shippedAt: string | null;
  note: string;
  createdAt: string;
}

interface CalibrationRow {
  countryCode: string;
  actualPerKgUsd: number;
  weightKg: number;
  billedUsd: number;
  count: number;
  lastShippedAt: string | null;
}

interface Snapshot {
  fx: { rate: number; source: string; capturedAt: string } | null;
  summary: MarketRow[];
  rates: RateRow[];
  sources: SourceRow[];
  bills: BillRow[];
  calibration: CalibrationRow[];
  settings: { autoApplyEnabled: boolean; quietPct: number; reviewPct: number; marginPct: number };
  changes: ChangeRow[];
}

interface AutoApplyResult {
  enabled: boolean;
  applied: Array<{ countryCode: string; before: number; after: number; pct: number }>;
  skipped: Array<{ countryCode: string; reason: string }>;
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
    bills: [],
    calibration: [],
    settings: { autoApplyEnabled: false, quietPct: 5, reviewPct: 15, marginPct: 20 },
    changes: [],
  });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [floorInputs, setFloorInputs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [savingRate, setSavingRate] = useState('');
  const [savingFloor, setSavingFloor] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [billForm, setBillForm] = useState({
    countryCode: '',
    weightKg: '',
    billedUsd: '',
    channel: '',
    shippedAt: '',
    note: '',
  });
  const [sourceForm, setSourceForm] = useState({ ...EMPTY_SOURCE });
  const [savingSource, setSavingSource] = useState(false);

  function applySnapshot(data: Partial<Snapshot>) {
    setSnapshot({
      fx: data.fx ?? null,
      summary: data.summary || [],
      rates: data.rates || [],
      sources: data.sources || [],
      bills: data.bills || [],
      calibration: data.calibration || [],
      settings:
        data.settings || { autoApplyEnabled: false, quietPct: 5, reviewPct: 15, marginPct: 20 },
      changes: data.changes || [],
    });
    const next: Record<string, string> = {};
    const nextFloors: Record<string, string> = {};
    for (const rate of data.rates || []) {
      next[rate.countryCode] = String(rate.perKgUsd);
      nextFloors[rate.countryCode] =
        rate.floorUsdPerKg === null ? '' : String(rate.floorUsdPerKg);
    }
    setInputs(next);
    setFloorInputs(nextFloors);
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

  const calibrationByCountry = useMemo(
    () => new Map(snapshot.calibration.map((row) => [row.countryCode, row])),
    [snapshot.calibration]
  );

  async function runCapture() {
    setRunning(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/shipping-market', { method: 'PUT' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Capture failed');
      applySnapshot(data);
      const auto = data.autoApply as AutoApplyResult | undefined;
      const appliedText =
        auto && auto.applied.length > 0
          ? ` Auto-applied ${auto.applied.length}: ${auto.applied
              .map((item) => `${item.countryCode} $${item.before.toFixed(2)}→$${item.after.toFixed(2)}`)
              .join(', ')}.`
          : auto?.enabled
            ? ' Auto-apply is on, but nothing moved within the review threshold.'
            : '';
      setStatus(
        `Capture finished: ${data.captured} price(s), ${data.failed} failed. FX ${
          data.fxUsdCny ? data.fxUsdCny.toFixed(4) : 'unavailable'
        }.${appliedText}`
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

  async function saveFloor(countryCode: string) {
    const raw = (floorInputs[countryCode] ?? '').trim();
    setSavingFloor(countryCode);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/shipping-market', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'floor',
          countryCode,
          floorUsdPerKg: raw === '' ? null : Number(raw),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Floor update failed');
      applySnapshot(data);
      setStatus(raw === '' ? `${countryCode} floor cleared.` : `${countryCode} floor set to $${raw}/kg.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Floor update failed');
    } finally {
      setSavingFloor('');
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/shipping-market', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'settings',
          autoApplyEnabled: snapshot.settings.autoApplyEnabled,
          quietPct: snapshot.settings.quietPct,
          reviewPct: snapshot.settings.reviewPct,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Settings update failed');
      applySnapshot(data);
      setStatus('Automation settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settings update failed');
    } finally {
      setSavingSettings(false);
    }
  }

  async function addBill() {
    setSavingBill(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/shipping-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bill', ...billForm }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Bill save failed');
      applySnapshot(data);
      setBillForm({
        countryCode: '',
        weightKg: '',
        billedUsd: '',
        channel: '',
        shippedAt: '',
        note: '',
      });
      setStatus(`Bill recorded for ${data.bill.countryCode}. Calibration updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bill save failed');
    } finally {
      setSavingBill(false);
    }
  }

  async function removeBill(id: string) {
    setStatus('');
    setError('');
    try {
      let res = await fetch(`/api/admin/shipping-market?type=bill&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      let data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        // Fall back to POST: some proxies strip the DELETE verb and the request
        // never reaches the route handler.
        res = await fetch('/api/admin/shipping-market', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_bill', id }),
        });
        data = await res.json().catch(() => null);
      }
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      }
      applySnapshot(data);
      setStatus('Bill deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
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
            Records the USD/CNY rate and one price per configured source, daily. Automatic updates
            are off by default; when enabled, moves inside the review threshold are applied and
            logged, larger moves stay for manual review, and nothing can go below its cost floor.
          </p>
        </div>

        <AdminHint section="rate">
          这一页每天自动记录市场运价，并算出建议价。打开自动更新后：小幅波动自动改价并写日志，大幅波动挂起等你审，
          任何价格都不会跌破保底价。你只需要处理标着“待审”的行。
        </AdminHint>

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
          <h2 className="text-lg font-medium mb-1">Automation</h2>
          <p className="text-xs text-gray-500 mb-4">
            When enabled, the daily capture applies the market median only while the move stays
            inside the review threshold. Anything larger waits for you, and no update may land
            below the cost floor set for that country.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={snapshot.settings.autoApplyEnabled}
                onChange={(e) =>
                  setSnapshot((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, autoApplyEnabled: e.target.checked },
                  }))
                }
              />
              Auto-apply within threshold
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">Quiet up to (%)</span>
              <input
                type="text"
                inputMode="decimal"
                value={snapshot.settings.quietPct}
                onChange={(e) =>
                  setSnapshot((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, quietPct: Number(e.target.value) },
                  }))
                }
                className="w-20 bg-background border border-border rounded px-2 py-1"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">Review above (%)</span>
              <input
                type="text"
                inputMode="decimal"
                value={snapshot.settings.reviewPct}
                onChange={(e) =>
                  setSnapshot((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, reviewPct: Number(e.target.value) },
                  }))
                }
                className="w-20 bg-background border border-border rounded px-2 py-1"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">Bill margin (%)</span>
              <input
                type="text"
                inputMode="decimal"
                value={snapshot.settings.marginPct}
                onChange={(e) =>
                  setSnapshot((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, marginPct: Number(e.target.value) },
                  }))
                }
                className="w-20 bg-background border border-border rounded px-2 py-1"
              />
            </label>
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="px-4 py-2 bg-gold text-background rounded text-sm font-medium disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save automation'}
            </button>
          </div>
        </section>

        <section className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-lg font-medium mb-1">Rates vs market</h2>
          <p className="text-xs text-gray-500 mb-4">
            Market range is the last 24 hours across successful sources. A median below your
            current rate usually means you are pricing above the market. Suggested is the top of
            that range plus 15% for fuel and delivery; clicking it only fills the box, nothing is
            saved until you press Apply.
          </p>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-2">Country</th>
                  <th className="text-left py-2">Your USD/kg</th>
                  <th className="text-left py-2"></th>
                  <th className="text-left py-2">Cost floor</th>
                  <th className="text-left py-2"></th>
                  <th className="text-left py-2">Market (24h)</th>
                  <th className="text-left py-2">Suggested</th>
                  <th className="text-left py-2">Drift</th>
                  <th className="text-left py-2">Actual cost/kg</th>
                  <th className="text-left py-2">Sources</th>
                  <th className="text-left py-2">Captured</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ countryCode, rate, market }) => {
                  const calibration = calibrationByCountry.get(countryCode);
                  const drift =
                    market && rate && rate.perKgUsd > 0
                      ? ((market.median - rate.perKgUsd) / rate.perKgUsd) * 100
                      : null;
                  const needsReview =
                    drift !== null && Math.abs(drift) > snapshot.settings.reviewPct;
                  // Sell above the market's upper edge so no quote undercuts us;
                  // 15% covers fuel surcharges and residential delivery that
                  // public quotes usually leave out. Clicking only fills the
                  // input — nothing is saved until Apply is pressed.
                  const suggested = market ? Math.round(market.high * 1.15 * 100) / 100 : null;
                  return (
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
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={floorInputs[countryCode] ?? ''}
                          onChange={(e) =>
                            setFloorInputs((prev) => ({ ...prev, [countryCode]: e.target.value }))
                          }
                          placeholder="none"
                          className="w-20 bg-background border border-border rounded px-2 py-1"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => saveFloor(countryCode)}
                          disabled={savingFloor === countryCode}
                          className="px-2 py-1 border border-border rounded text-xs text-gray-300 disabled:opacity-50"
                        >
                          {savingFloor === countryCode ? '...' : 'Set'}
                        </button>
                      </td>
                      <td className="py-2 pr-3 text-gray-300">
                        {market
                          ? `$${market.low.toFixed(2)} – $${market.high.toFixed(2)} (median $${market.median.toFixed(2)})`
                          : '-'}
                      </td>
                      <td className="py-2 pr-3">
                        {suggested === null ? (
                          <span className="text-gray-500">-</span>
                        ) : (
                          <button
                            onClick={() =>
                              setInputs((prev) => ({ ...prev, [countryCode]: String(suggested) }))
                            }
                            title="Fill the rate box with this suggestion. Press Apply to save it."
                            className="px-2 py-1 border border-gold/40 text-gold rounded text-xs hover:bg-gold/10"
                          >
                            ${suggested.toFixed(2)}
                          </button>
                        )}
                      </td>
                      <td className={`py-2 pr-3 ${needsReview ? 'text-red-400' : 'text-gray-400'}`}>
                        {drift === null
                          ? '-'
                          : `${drift > 0 ? '+' : ''}${drift.toFixed(1)}%${needsReview ? ' review' : ''}`}
                      </td>
                      <td className="py-2 pr-3 text-gray-300">
                        {calibration
                          ? `$${calibration.actualPerKgUsd.toFixed(2)} (${calibration.count})`
                          : '-'}
                      </td>
                      <td className="py-2 pr-3 text-gray-500">{market ? market.count : '-'}</td>
                      <td className="py-2 text-gray-500">
                        {market ? new Date(market.capturedAt).toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-lg font-medium mb-1">Forwarder bills (calibration)</h2>
          <p className="text-xs text-gray-500 mb-4">
            Record what the forwarder actually charged for a shipment. Real bills take priority
            over public estimates: the suggested rate becomes actual cost per kg plus the bill
            margin, and auto-apply uses it instead of the market median.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-4">
            <input
              value={billForm.countryCode}
              onChange={(e) => setBillForm((prev) => ({ ...prev, countryCode: e.target.value }))}
              placeholder="US"
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            />
            <input
              value={billForm.weightKg}
              onChange={(e) => setBillForm((prev) => ({ ...prev, weightKg: e.target.value }))}
              placeholder="Weight kg"
              inputMode="decimal"
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            />
            <input
              value={billForm.billedUsd}
              onChange={(e) => setBillForm((prev) => ({ ...prev, billedUsd: e.target.value }))}
              placeholder="Billed USD"
              inputMode="decimal"
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            />
            <input
              value={billForm.channel}
              onChange={(e) => setBillForm((prev) => ({ ...prev, channel: e.target.value }))}
              placeholder="Channel"
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={billForm.shippedAt}
              onChange={(e) => setBillForm((prev) => ({ ...prev, shippedAt: e.target.value }))}
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            />
            <button
              onClick={addBill}
              disabled={savingBill}
              className="px-4 py-2 bg-gold text-background rounded text-sm font-medium disabled:opacity-50"
            >
              {savingBill ? 'Saving...' : 'Add bill'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="text-left py-2">Country</th>
                  <th className="text-left py-2">Weight</th>
                  <th className="text-left py-2">Billed</th>
                  <th className="text-left py-2">USD/kg</th>
                  <th className="text-left py-2">Channel</th>
                  <th className="text-left py-2">Shipped</th>
                  <th className="text-left py-2"></th>
                </tr>
              </thead>
              <tbody>
                {snapshot.bills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-gray-500">
                      No bills yet. Add the first one after a test shipment.
                    </td>
                  </tr>
                ) : (
                  snapshot.bills.map((bill) => (
                    <tr key={bill.id} className="border-t border-border">
                      <td className="py-2 pr-3">{bill.countryCode}</td>
                      <td className="py-2 pr-3 text-gray-300">{bill.weightKg.toFixed(3)} kg</td>
                      <td className="py-2 pr-3 text-gray-300">${bill.billedUsd.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-gray-300">
                        ${bill.weightKg > 0 ? (bill.billedUsd / bill.weightKg).toFixed(2) : '-'}
                      </td>
                      <td className="py-2 pr-3 text-gray-400">{bill.channel || '-'}</td>
                      <td className="py-2 pr-3 text-gray-400">{bill.shippedAt || '-'}</td>
                      <td className="py-2">
                        <button
                          onClick={() => removeBill(bill.id)}
                          className="px-2 py-1 border border-border rounded text-xs text-gray-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
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
