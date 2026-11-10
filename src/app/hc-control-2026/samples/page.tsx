'use client';

import { useEffect, useState } from 'react';

interface SampleRequest {
  id: string;
  productId: string;
  productName: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  message: string;
  status: string;
  createdAt: string;
}

const STATUSES = ['new', 'contacted', 'sent', 'closed'];

export default function SamplesAdminPage() {
  const [samples, setSamples] = useState<SampleRequest[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    fetch('/api/admin/samples')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Failed to load');
        setSamples(Array.isArray(data.samples) ? data.samples : []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  async function changeStatus(id: string, next: string) {
    setSaving(id);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin/samples', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Update failed');
      setSamples((prev) => prev.map((item) => (item.id === id ? data.sample : item)));
      setStatus('Status updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving('');
    }
  }

  async function removeSample(id: string) {
    setStatus('');
    setError('');
    try {
      const res = await fetch(`/api/admin/samples?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      }
      setSamples((prev) => prev.filter((item) => item.id !== id));
      setStatus('Sample request deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 text-foreground">
      <h1 className="text-2xl font-bold mb-2">Sample requests</h1>
      <p className="text-sm text-gray-500 mb-6">
        Buyers who asked for a physical sample. Reply by email with the sample price, courier
        cost and lead time, then update the status here.
      </p>

      {status && <p className="text-sm text-green-400 mb-3">{status}</p>}
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {samples.length === 0 ? (
        <p className="text-sm text-gray-500">No sample requests yet.</p>
      ) : (
        <div className="space-y-3">
          {samples.map((sample) => (
            <div key={sample.id} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {sample.name}
                    {sample.company ? ` · ${sample.company}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(sample.createdAt).toLocaleString()} · {sample.country}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={sample.status}
                    onChange={(e) => changeStatus(sample.id, e.target.value)}
                    disabled={saving === sample.id}
                    className="bg-background border border-border rounded px-2 py-1 text-sm"
                  >
                    {STATUSES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeSample(sample.id)}
                    className="text-xs text-gray-500 hover:text-red-400 border border-border rounded px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-300">
                <p>
                  <span className="text-gray-500">Product:</span>{' '}
                  {sample.productName || sample.productId || '—'}
                </p>
                <p>
                  <span className="text-gray-500">Email:</span> {sample.email}
                </p>
                <p>
                  <span className="text-gray-500">Phone:</span> {sample.phone || '—'}
                </p>
                <p>
                  <span className="text-gray-500">Address:</span> {sample.address}
                </p>
              </div>

              {sample.message && (
                <p className="mt-2 text-sm text-gray-400 whitespace-pre-wrap">{sample.message}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
