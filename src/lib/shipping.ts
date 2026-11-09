/**
 * Weight-based shipping calculation.
 *
 * Fee = total weight (kg) x per-kg rate for the destination country.
 * Rates and per-SKU weights are stored in the database and maintained from the
 * admin page (/hc-control-2026/shipping). Values here are only fallbacks used
 * before the tables load or when a country/SKU has no configured value.
 */

export const DEFAULT_PER_KG_USD = 20;

export interface ShippingRate {
  countryCode: string;
  countryName: string;
  perKgUsd: number;
}

// International dialing code -> ISO country code + display name.
const DIAL_TO_COUNTRY: Record<string, { code: string; name: string }> = {
  '+86': { code: 'CN', name: 'China' },
  '+852': { code: 'HK', name: 'Hong Kong' },
  '+853': { code: 'MO', name: 'Macau' },
  '+886': { code: 'TW', name: 'Taiwan' },
  '+81': { code: 'JP', name: 'Japan' },
  '+82': { code: 'KR', name: 'South Korea' },
  '+65': { code: 'SG', name: 'Singapore' },
  '+60': { code: 'MY', name: 'Malaysia' },
  '+66': { code: 'TH', name: 'Thailand' },
  '+84': { code: 'VN', name: 'Vietnam' },
  '+62': { code: 'ID', name: 'Indonesia' },
  '+63': { code: 'PH', name: 'Philippines' },
  '+91': { code: 'IN', name: 'India' },
  '+92': { code: 'PK', name: 'Pakistan' },
  '+880': { code: 'BD', name: 'Bangladesh' },
  '+94': { code: 'LK', name: 'Sri Lanka' },
  '+971': { code: 'AE', name: 'United Arab Emirates' },
  '+966': { code: 'SA', name: 'Saudi Arabia' },
  '+972': { code: 'IL', name: 'Israel' },
  '+90': { code: 'TR', name: 'Turkey' },
  '+7': { code: 'RU', name: 'Russia' },
  '+44': { code: 'GB', name: 'United Kingdom' },
  '+33': { code: 'FR', name: 'France' },
  '+49': { code: 'DE', name: 'Germany' },
  '+39': { code: 'IT', name: 'Italy' },
  '+34': { code: 'ES', name: 'Spain' },
  '+351': { code: 'PT', name: 'Portugal' },
  '+31': { code: 'NL', name: 'Netherlands' },
  '+32': { code: 'BE', name: 'Belgium' },
  '+41': { code: 'CH', name: 'Switzerland' },
  '+43': { code: 'AT', name: 'Austria' },
  '+48': { code: 'PL', name: 'Poland' },
  '+46': { code: 'SE', name: 'Sweden' },
  '+47': { code: 'NO', name: 'Norway' },
  '+45': { code: 'DK', name: 'Denmark' },
  '+358': { code: 'FI', name: 'Finland' },
  '+353': { code: 'IE', name: 'Ireland' },
  '+30': { code: 'GR', name: 'Greece' },
  '+1': { code: 'US', name: 'United States / Canada' },
  '+52': { code: 'MX', name: 'Mexico' },
  '+55': { code: 'BR', name: 'Brazil' },
  '+54': { code: 'AR', name: 'Argentina' },
  '+56': { code: 'CL', name: 'Chile' },
  '+57': { code: 'CO', name: 'Colombia' },
  '+51': { code: 'PE', name: 'Peru' },
  '+61': { code: 'AU', name: 'Australia' },
  '+64': { code: 'NZ', name: 'New Zealand' },
  '+27': { code: 'ZA', name: 'South Africa' },
  '+20': { code: 'EG', name: 'Egypt' },
  '+234': { code: 'NG', name: 'Nigeria' },
  '+254': { code: 'KE', name: 'Kenya' },
};

/** Longest-prefix match so +852 is not read as +8. */
export function dialCodeOf(phone: string): string {
  const match = (phone || '').trim().match(/^\+(\d{1,4})/);
  if (!match) return '';
  const digits = match[1];
  for (let len = Math.min(digits.length, 4); len >= 1; len--) {
    const candidate = `+${digits.slice(0, len)}`;
    if (DIAL_TO_COUNTRY[candidate]) return candidate;
  }
  return '';
}

export function countryOfPhone(phone: string): { code: string; name: string } | null {
  const dial = dialCodeOf(phone);
  return dial ? DIAL_TO_COUNTRY[dial] : null;
}

export interface ShippingLine {
  productId: string;
  quantity: number;
}

export function totalWeightKg(
  items: ShippingLine[],
  weights: Record<string, number>
): { kg: number; complete: boolean } {
  let complete = true;
  const goodsKg = items.reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const unitKg = Number(weights[item.productId]);
    if (!Number.isFinite(unitKg) || unitKg <= 0) {
      complete = false;
      return sum;
    }
    return sum + quantity * unitKg;
  }, 0);
  return { kg: Math.round(goodsKg * 100) / 100, complete };
}

export function shippingFeeFor(
  items: ShippingLine[],
  phone: string,
  rates: ShippingRate[],
  weights: Record<string, number>
): { fee: number; kg: number; perKgUsd: number; countryCode: string; countryName: string; known: boolean; complete: boolean } {
  const country = countryOfPhone(phone);
  const rate = country ? rates.find((r) => r.countryCode === country.code) : undefined;
  const perKgUsd = rate?.perKgUsd ?? DEFAULT_PER_KG_USD;
  const { kg, complete } = totalWeightKg(items, weights);
  const fee = complete ? Math.round(kg * perKgUsd * 100) / 100 : 0;
  return {
    fee,
    kg,
    perKgUsd,
    countryCode: country?.code ?? '',
    countryName: country?.name ?? 'Unknown destination',
    known: Boolean(rate),
    complete,
  };
}
