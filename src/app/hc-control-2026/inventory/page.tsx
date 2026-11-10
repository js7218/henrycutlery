'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { products } from '@/data/products';

export default function InventoryAdminPage() {
  const [stock, setStock] = useState<Record<string, string>>({});
  const [savedStock, setSavedStock] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkValue, setBulkValue] = useState('');

  useEffect(() => {
    fetch('/api/admin/inventory')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Failed to load inventory');
        const map: Record<string, string> = {};
        for (const product of products) {
          map[product.id] = String(data.stock?.[product.id] ?? 0);
        }
        setStock(map);
        setSavedStock(data.stock || {});
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load inventory'))
      .finally(() => setLoading(false));
  }, []);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (product) =>
        product.id.toLowerCase().includes(q) ||
        product.name.toLowerCase().includes(q)
    );
  }, [query]);

  const lowStockCount = useMemo(
    () => products.filter((product) => Number(stock[product.id] ?? 0) <= 20).length,
    [stock]
  );

  function applyBulk() {
    const value = bulkValue.replace(/[^\d]/g, '');
    if (value === '') return;
    const next: Record<string, string> = { ...stock };
    for (const product of filteredProducts) next[product.id] = value;
    setStock(next);
    setStatus(`Set ${filteredProducts.length} products to ${value}. Click “Save inventory” to store it.`);
  }

  async function save() {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      // Only send rows the admin actually edited. Rewriting untouched rows
      // would clobber stock that customers bought while this page was open.
      const updates = products
        .map((product) => ({
          productId: product.id,
          stock: Number(stock[product.id] ?? 0),
        }))
        .filter((update) => Number.isFinite(update.stock) && update.stock >= 0)
        .filter((update) => update.stock !== Number(savedStock[update.productId] ?? 0));

      if (updates.length === 0) {
        setStatus('No changes to save.');
        return;
      }

      const res = await fetch('/api/admin/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      const saved: Record<string, number> = data.stock || {};
      const map: Record<string, string> = {};
      for (const product of products) {
        map[product.id] = String(saved[product.id] ?? 0);
      }
      setStock(map);
      setSavedStock(saved);
      setStatus('Inventory saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-16 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Inventory</h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            Every paid-for order decrements this stock atomically, so two customers can never buy the
            same units. Cancelling an order or deleting a pending one puts the stock back.
          </p>
        </div>
        <Link href="/hc-control-2026" className="text-sm text-gold whitespace-nowrap">
          &larr; Back to dashboard
        </Link>
      </div>

      {status && <p className="text-sm text-green-400">{status}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Loading inventory...</p>}

      {!loading && lowStockCount > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          {lowStockCount} product{lowStockCount === 1 ? '' : 's'} at or below 20 units. Customers will be
          unable to order more than the number shown here.
        </div>
      )}

      <section className="bg-surface border border-border rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-medium mb-1">Stock levels (units)</h2>
            <p className="text-xs text-gray-500">
              Set the physical units you can ship. Zero marks the product as out of stock.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="bg-background border border-border rounded px-3 py-2 text-sm w-56"
            />
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-gold text-background rounded text-sm font-medium disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? 'Saving...' : 'Save inventory'}
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background/60 p-3">
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Set every listed product to
            </label>
            <input
              type="number"
              min="0"
              max="1000000"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="e.g. 2400"
              className="w-40 bg-background border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={applyBulk}
            disabled={bulkValue === ''}
            className="px-4 py-2 border border-gold text-gold rounded text-sm font-medium disabled:opacity-40"
          >
            Apply to {filteredProducts.length} shown
          </button>
          <p className="text-sm text-gray-500">Then click “Save inventory” to store it.</p>
        </div>

        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-400 sticky top-0 bg-surface">
              <tr>
                <th className="text-left py-2">Product</th>
                <th className="text-left py-2">SKU</th>
                <th className="text-left py-2">In stock</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const value = Number(stock[product.id] ?? 0);
                const previous = savedStock[product.id];
                return (
                  <tr key={product.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{product.name}</td>
                    <td className="py-1.5 pr-3 text-gray-500 font-mono text-xs">{product.id}</td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        value={stock[product.id] ?? '0'}
                        onChange={(e) =>
                          setStock((prev) => ({
                            ...prev,
                            [product.id]: e.target.value.replace(/[^\d]/g, ''),
                          }))
                        }
                        className="w-28 bg-background border border-border rounded px-2 py-1"
                      />
                    </td>
                    <td className="py-1.5">
                      {value === 0 ? (
                        <span className="text-red-400">Out of stock</span>
                      ) : value <= 20 ? (
                        <span className="text-yellow-400">Low ({value})</span>
                      ) : (
                        <span className="text-green-400">In stock</span>
                      )}
                      {previous !== undefined && previous !== value && (
                        <span className="ml-2 text-xs text-gray-500">was {previous}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
