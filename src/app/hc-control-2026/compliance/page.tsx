'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type RiskLevel = 'none' | 'medium' | 'high';

interface Rule {
  countryCode: string;
  countryName: string;
  riskLevel: RiskLevel;
  restrictedTypes: string;
  message: string;
  sourceUrl: string;
  enabled: boolean;
  updatedAt: string;
}

interface ScanSource {
  id: string;
  countryCode: string;
  label: string;
  url: string;
  enabled: boolean;
  lastCheckedAt: string;
  lastStatus: string;
}

interface ScanChange {
  id: string;
  countryCode: string;
  oldRisk: string;
  newRisk: string;
  summary: string;
  sourceUrl: string;
  applied: boolean;
  createdAt: string;
}

export default function ComplianceAdminPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [sources, setSources] = useState<ScanSource[]>([]);
  const [changes, setChanges] = useState<ScanChange[]>([]);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    fetch('/api/admin/compliance')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Failed to load');
        setRules(Array.isArray(data.rules) ? data.rules : []);
        setSources(Array.isArray(data.sources) ? data.sources : []);
        setChanges(Array.isArray(data.changes) ? data.changes : []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  async function runScan(mode: 'official' | 'knowledge' = 'official') {
    setScanning(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'knowledge' ? { mode: 'knowledge', batch: 8 } : {}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Scan failed');
      setStatus(
        data.mode === 'knowledge'
          ? `AI verification: ${data.checked} checked, ${data.applied} changed, ${data.skipped} skipped.`
          : `Scan done: ${data.applied} applied, ${data.pending} awaiting review, ${data.skipped} unchanged.`
      );
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setError(data.errors.join(' · '));
      }
      const fresh = await fetch('/api/admin/compliance').then((r) => r.json());
      if (fresh?.success) {
        setRules(Array.isArray(fresh.rules) ? fresh.rules : []);
        setSources(Array.isArray(fresh.sources) ? fresh.sources : []);
        setChanges(Array.isArray(fresh.changes) ? fresh.changes : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  function patch(code: string, updates: Partial<Rule>) {
    setRules((prev) => prev.map((rule) => (rule.countryCode === code ? { ...rule, ...updates } : rule)));
  }

  async function save(rule: Rule) {
    setSaving(rule.countryCode);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/compliance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      patch(rule.countryCode, data.rule);
      setStatus(`${rule.countryName || rule.countryCode} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving('');
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <Link href="/hc-control-2026" className="text-sm text-gold hover:underline">
            &larr; Back to admin
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Import Compliance Notices</h1>
          <p className="text-sm text-gray-400 mt-1">
            Shown at checkout when the shipping country matches. Customers must tick the notice
            before an affected order can proceed. Advisory only — the importer remains responsible.
          </p>
        </div>

        {status && <p className="text-sm text-green-400">{status}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        <section className="bg-surface border border-border rounded-lg p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Automatic scan</h2>
              <p className="text-xs text-gray-400 mt-1">
                Official pages are read daily at 02:00 UTC. A stricter rule is applied
                automatically; a looser one is listed here for your review. "Verify 8 (AI)"
                searches the live web for eight countries and only applies a change when the
                model cites a dated source.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => runScan('official')}
                disabled={scanning}
                className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
              >
                {scanning ? 'Working…' : 'Scan now'}
              </button>
              <button
                onClick={() => runScan('knowledge')}
                disabled={scanning}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Verify 8 (AI)
              </button>
            </div>
          </div>

          <div className="space-y-1 text-xs text-gray-400">
            {sources.length === 0 && <p>No sources configured yet.</p>}
            {sources.map((source) => (
              <div key={source.id}>
                <span className="text-gray-300">{source.countryCode}</span> · {source.label} —{' '}
                {source.lastStatus || 'never checked'}
                {source.lastCheckedAt
                  ? ` (${source.lastCheckedAt.slice(0, 16).replace('T', ' ')} UTC)`
                  : ''}
              </div>
            ))}
          </div>

          {changes.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Recent changes</p>
              {changes.map((change) => (
                <div key={change.id} className="text-xs border border-border rounded p-2 space-y-1">
                  <div>
                    <span className={change.applied ? 'text-green-400' : 'text-yellow-400'}>
                      {change.applied ? 'applied' : 'needs review'}
                    </span>
                    {' · '}
                    {change.countryCode}: {change.oldRisk} → {change.newRisk}
                    {' · '}
                    {change.createdAt.slice(0, 16).replace('T', ' ')} UTC
                  </div>
                  {change.summary && <div className="text-gray-400">{change.summary}</div>}
                  {change.sourceUrl && (
                    <a
                      href={change.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold underline"
                    >
                      source
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-4">
          {rules.map((rule) => (
            <section key={rule.countryCode} className="bg-surface border border-border rounded-lg p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-medium">
                    {rule.countryName} <span className="text-gray-500 text-sm">({rule.countryCode})</span>
                  </h2>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => patch(rule.countryCode, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>
                <button
                  onClick={() => save(rule)}
                  disabled={saving === rule.countryCode}
                  className="px-4 py-2 bg-gold text-background rounded text-sm font-medium disabled:opacity-50"
                >
                  {saving === rule.countryCode ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-gray-400 mb-1">Risk level</span>
                  <select
                    value={rule.riskLevel}
                    onChange={(e) => patch(rule.countryCode, { riskLevel: e.target.value as RiskLevel })}
                    className="w-full bg-background border border-border rounded px-2 py-1"
                  >
                    <option value="none">none (no notice)</option>
                    <option value="medium">medium (yellow notice)</option>
                    <option value="high">high (red notice)</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-gray-400 mb-1">Official source URL</span>
                  <input
                    value={rule.sourceUrl}
                    onChange={(e) => patch(rule.countryCode, { sourceUrl: e.target.value })}
                    className="w-full bg-background border border-border rounded px-2 py-1"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="block text-gray-400 mb-1">Restricted categories</span>
                  <input
                    value={rule.restrictedTypes}
                    onChange={(e) => patch(rule.countryCode, { restrictedTypes: e.target.value })}
                    className="w-full bg-background border border-border rounded px-2 py-1"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="block text-gray-400 mb-1">Customer-facing message</span>
                  <textarea
                    value={rule.message}
                    onChange={(e) => patch(rule.countryCode, { message: e.target.value })}
                    rows={2}
                    className="w-full bg-background border border-border rounded px-2 py-1"
                  />
                </label>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Last updated: {rule.updatedAt ? new Date(rule.updatedAt).toLocaleString() : 'never'}
              </p>
            </section>
          ))}
          {rules.length === 0 && !error && (
            <p className="text-sm text-gray-400">Loading rules...</p>
          )}
        </div>
      </div>
    </div>
  );
}
