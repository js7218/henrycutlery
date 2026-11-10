'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SampleRequestFormProps {
  productId: string;
  productName: string;
}

const EMPTY = {
  name: '',
  company: '',
  email: '',
  phone: '',
  country: '',
  address: '',
  message: '',
};

export default function SampleRequestForm({ productId, productName }: SampleRequestFormProps) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function update<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/sample-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, productId, productName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to submit');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-surface border border-border rounded-lg p-8 text-center">
        <h2 className="text-xl font-medium mb-2">Request received</h2>
        <p className="text-sm text-gray-400 mb-6">
          Thanks — we will reply by email with the sample price, courier cost and lead time.
          Sample fees are usually credited against your first bulk order.
        </p>
        <Link href="/products" className="text-gold hover:text-goldLight text-sm">
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
      {productName && (
        <div className="text-sm text-gray-400">
          Product: <span className="text-foreground">{productName}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm">
          <span className="block text-sm font-medium text-gray-300 mb-1">Your name *</span>
          <input
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
            maxLength={100}
            className="w-full bg-background border border-border rounded px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-sm font-medium text-gray-300 mb-1">Company</span>
          <input
            value={form.company}
            onChange={(e) => update('company', e.target.value)}
            maxLength={150}
            className="w-full bg-background border border-border rounded px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-sm font-medium text-gray-300 mb-1">Email *</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
            maxLength={200}
            className="w-full bg-background border border-border rounded px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-sm font-medium text-gray-300 mb-1">Phone / WhatsApp</span>
          <input
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            maxLength={50}
            className="w-full bg-background border border-border rounded px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-sm font-medium text-gray-300 mb-1">Country *</span>
          <input
            value={form.country}
            onChange={(e) => update('country', e.target.value)}
            required
            maxLength={80}
            className="w-full bg-background border border-border rounded px-3 py-2"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="block text-sm font-medium text-gray-300 mb-1">Shipping address *</span>
          <input
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            required
            maxLength={500}
            className="w-full bg-background border border-border rounded px-3 py-2"
          />
        </label>
      </div>

      <label className="text-sm block">
        <span className="block text-sm font-medium text-gray-300 mb-1">What do you need?</span>
        <textarea
          value={form.message}
          onChange={(e) => update('message', e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="Sample quantity, customization (logo, sheath, packaging), target market..."
          className="w-full bg-background border border-border rounded px-3 py-2"
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="px-6 py-3 bg-gold text-background rounded-lg font-medium disabled:opacity-50"
      >
        {busy ? 'Sending...' : 'Request sample'}
      </button>
      <p className="text-xs text-gray-500">
        Sample and courier costs are quoted separately. This request does not create an order.
      </p>
    </form>
  );
}
