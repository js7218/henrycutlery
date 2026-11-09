import type { Address, CartItem } from '@/types';

/**
 * Distance-based shipping estimate.
 *
 * There is no carrier API or per-SKU weight yet, so this is a deterministic
 * estimate used for display and for the initial order total. The final amount
 * is still confirmed by email. Rates live in one place so they are easy to tune.
 */

// Origin: Yangjiang, Guangdong, China
const ORIGIN = { lat: 21.857, lng: 111.982 };

export const SHIPPING_RATES = {
  baseFee: 5,          // USD, handling
  perKg: 7,            // USD per billable kg
  per1000Km: 1.8,      // USD per 1,000 km
  minFee: 9,           // USD floor
  packagingKg: 0.4,    // box + packing material
  defaultItemKg: 0.6,  // estimated weight per knife
};

// Approximate coordinates by international dialing code prefix.
const DIAL_CODE_COORDS: Record<string, { lat: number; lng: number }> = {
  '+86': { lat: 35.86, lng: 104.2 },
  '+852': { lat: 22.32, lng: 114.17 },
  '+853': { lat: 22.2, lng: 113.54 },
  '+886': { lat: 23.7, lng: 121.0 },
  '+81': { lat: 36.2, lng: 138.25 },
  '+82': { lat: 35.9, lng: 127.77 },
  '+65': { lat: 1.35, lng: 103.82 },
  '+60': { lat: 4.21, lng: 101.98 },
  '+66': { lat: 15.87, lng: 100.99 },
  '+84': { lat: 14.06, lng: 108.28 },
  '+62': { lat: -0.79, lng: 113.92 },
  '+63': { lat: 12.88, lng: 121.77 },
  '+91': { lat: 20.59, lng: 78.96 },
  '+92': { lat: 30.38, lng: 69.35 },
  '+880': { lat: 23.68, lng: 90.36 },
  '+94': { lat: 7.87, lng: 80.77 },
  '+971': { lat: 23.42, lng: 53.85 },
  '+966': { lat: 23.89, lng: 45.08 },
  '+972': { lat: 31.05, lng: 34.85 },
  '+90': { lat: 38.96, lng: 35.24 },
  '+7': { lat: 61.52, lng: 105.32 },
  '+44': { lat: 55.38, lng: -3.44 },
  '+33': { lat: 46.23, lng: 2.21 },
  '+49': { lat: 51.17, lng: 10.45 },
  '+39': { lat: 41.87, lng: 12.57 },
  '+34': { lat: 40.46, lng: -3.75 },
  '+351': { lat: 39.4, lng: -8.22 },
  '+31': { lat: 52.13, lng: 5.29 },
  '+32': { lat: 50.5, lng: 4.47 },
  '+41': { lat: 46.82, lng: 8.23 },
  '+43': { lat: 47.52, lng: 14.55 },
  '+48': { lat: 51.92, lng: 19.15 },
  '+46': { lat: 60.13, lng: 18.64 },
  '+47': { lat: 60.47, lng: 8.47 },
  '+45': { lat: 56.26, lng: 9.5 },
  '+358': { lat: 61.92, lng: 25.75 },
  '+353': { lat: 53.14, lng: -7.69 },
  '+30': { lat: 39.07, lng: 21.82 },
  '+1': { lat: 40.0, lng: -100.0 },   // US / Canada
  '+52': { lat: 23.63, lng: -102.55 },
  '+55': { lat: -14.24, lng: -51.93 },
  '+54': { lat: -38.42, lng: -63.62 },
  '+56': { lat: -35.68, lng: -71.54 },
  '+57': { lat: 4.57, lng: -74.3 },
  '+51': { lat: -9.19, lng: -75.02 },
  '+61': { lat: -25.27, lng: 133.78 },
  '+64': { lat: -40.9, lng: 174.89 },
  '+27': { lat: -30.56, lng: 22.94 },
  '+20': { lat: 26.82, lng: 30.8 },
  '+234': { lat: 9.08, lng: 8.68 },
  '+254': { lat: -0.02, lng: 37.91 },
};

const DEFAULT_COORDS = { lat: 30, lng: 30 }; // fallback: mid-haul estimate

function dialCodeOf(phone: string): string {
  const match = phone.trim().match(/^\+(\d{1,4})/);
  if (!match) return '';
  const digits = match[1];
  // Try the longest matching prefix first (e.g. +852 before +8).
  for (let len = Math.min(digits.length, 4); len >= 1; len--) {
    const candidate = `+${digits.slice(0, len)}`;
    if (DIAL_CODE_COORDS[candidate]) return candidate;
  }
  return `+${digits}`;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface ShippingEstimate {
  fee: number;
  distanceKm: number;
  billableKg: number;
  knownDestination: boolean;
}

export function estimateShipping(
  items: Pick<CartItem, 'quantity'>[],
  phone: string
): ShippingEstimate {
  const dialCode = dialCodeOf(phone || '');
  const destination = DIAL_CODE_COORDS[dialCode] || DEFAULT_COORDS;
  const knownDestination = Boolean(DIAL_CODE_COORDS[dialCode]);
  const distanceKm = Math.round(haversineKm(ORIGIN, destination));

  const units = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 0), 0);
  const billableKg = Math.round((units * SHIPPING_RATES.defaultItemKg + SHIPPING_RATES.packagingKg) * 10) / 10;

  const raw =
    SHIPPING_RATES.baseFee +
    (distanceKm / 1000) * SHIPPING_RATES.per1000Km +
    billableKg * SHIPPING_RATES.perKg;

  const fee = Math.round(Math.max(SHIPPING_RATES.minFee, raw) * 100) / 100;
  return { fee, distanceKm, billableKg, knownDestination };
}

export function estimateShippingForAddress(items: CartItem[], address: Address): ShippingEstimate {
  return estimateShipping(items, address.phone);
}
