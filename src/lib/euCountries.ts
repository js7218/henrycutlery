/**
 * EU member states as of 2026.
 * GPSR product-safety rules apply to all of them, and EU deliveries can be
 * paused from the admin panel while responsible-person details are missing.
 */
export const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
]);

export function isEuCountry(code: string): boolean {
  return EU_COUNTRY_CODES.has(code.trim().toUpperCase());
}
