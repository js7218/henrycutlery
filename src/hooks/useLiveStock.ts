'use client';

import { useEffect, useState } from 'react';

/**
 * Live stock levels shared by every product card on the page. The first card
 * triggers a single request; the rest reuse the cached result so a product
 * grid does not fire dozens of calls.
 */
const TTL_MS = 60_000;
let cache: { map: Record<string, number>; at: number } | null = null;
let pending: Promise<Record<string, number>> | null = null;

async function loadStock(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  if (!pending) {
    pending = fetch('/api/products/stock', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.stock && typeof data.stock === 'object') {
          const map = data.stock as Record<string, number>;
          cache = { map, at: Date.now() };
          return map;
        }
        return {};
      })
      .catch(() => ({}))
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function useLiveStock(): Record<string, number> {
  const [stock, setStock] = useState<Record<string, number>>(
    cache && Date.now() - cache.at < TTL_MS ? cache.map : {}
  );

  useEffect(() => {
    let cancelled = false;
    loadStock().then((map) => {
      if (!cancelled) setStock(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return stock;
}
