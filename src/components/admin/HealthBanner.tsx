'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Health {
  totalSku: number;
  placeholderStock: number;
  soldOutSku: number;
  missingWeightSku: number;
  pendingSamples: number;
  rateCountries: number;
  missingFloorCountries: number;
  lastOrderAt: string | null;
}

interface Item {
  text: string;
  href: string;
  cta: string;
}

export default function HealthBanner() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch('/api/admin/health')
      .then((res) => res.json())
      .then((data) => {
        if (data?.success) setHealth(data.health);
      })
      .catch(() => {});
  }, []);

  if (!health) return null;

  const items: Item[] = [];
  if (health.placeholderStock > 0) {
    items.push({
      text: `${health.placeholderStock} of ${health.totalSku} SKUs still use the 999999 placeholder, so overselling is not actually blocked.`,
      href: '/hc-control-2026/inventory',
      cta: 'Set stock',
    });
  }
  if (health.missingWeightSku > 0) {
    items.push({
      text: `${health.missingWeightSku} SKUs have no weight, so their freight falls back to the default.`,
      href: '/hc-control-2026/shipping',
      cta: 'Set weights',
    });
  }
  if (health.missingFloorCountries > 0) {
    items.push({
      text: `${health.missingFloorCountries} of ${health.rateCountries} countries have no cost floor, so auto-updates there are unbounded.`,
      href: '/hc-control-2026/shipping-market',
      cta: 'Set floors',
    });
  }
  if (health.pendingSamples > 0) {
    items.push({
      text: `${health.pendingSamples} new sample request(s) waiting for a reply.`,
      href: '/hc-control-2026/samples',
      cta: 'Review',
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <p className="text-sm font-medium text-amber-200 mb-2">Before going live</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.href} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-amber-100/90">
            <span>{item.text}</span>
            <Link href={item.href} className="underline underline-offset-2 text-amber-200 hover:text-amber-100">
              {item.cta}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
