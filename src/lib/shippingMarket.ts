import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export interface MarketSource {
  id: string;
  countryCode: string;
  label: string;
  url: string;
  unit: 'usd_per_kg' | 'cny_per_kg';
  regex: string;
  enabled: boolean;
  notes: string;
}

export interface MarketCaptureResult {
  fxUsdCny: number | null;
  fxSource: string;
  captured: number;
  failed: number;
  errors: string[];
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Reject anything that is not a normal public http(s) URL (basic SSRF guard). */
export function isSafePublicUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '::1' ||
      host.endsWith('.local') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url: string, timeoutMs = 7000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** USD -> CNY. Frankfurter first, then open.er-api as a fallback. */
export async function fetchUsdCny(): Promise<{ rate: number; source: string } | null> {
  const sources: Array<{ url: string; source: string; pick: (data: unknown) => unknown }> = [
    {
      url: 'https://api.frankfurter.app/latest?from=USD&to=CNY',
      source: 'frankfurter.app',
      pick: (data) => (data as { rates?: Record<string, unknown> })?.rates?.CNY,
    },
    {
      url: 'https://open.er-api.com/v6/latest/USD',
      source: 'open.er-api.com',
      pick: (data) => (data as { rates?: Record<string, unknown> })?.rates?.CNY,
    },
  ];

  for (const candidate of sources) {
    try {
      const text = await fetchText(candidate.url);
      const rate = Number(candidate.pick(JSON.parse(text)));
      if (Number.isFinite(rate) && rate > 0) {
        return { rate, source: candidate.source };
      }
    } catch {
      // try the next source
    }
  }
  return null;
}

/**
 * Pulls the first plausible per-kg price out of a page. An operator-supplied
 * regex wins; otherwise a few common patterns are tried.
 */
export function extractPerKg(
  html: string,
  regex: string | undefined,
  fxUsdCny: number | null
): { usdPerKg: number; raw: string } | null {
  const text = html.replace(/\s+/g, ' ');
  let value: number | null = null;
  let unit: 'usd' | 'cny' = 'usd';
  let raw = '';

  if (regex) {
    try {
      const match = new RegExp(regex, 'i').exec(text);
      if (match) {
        const numeric = Number(String(match[1] ?? match[0]).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(numeric)) {
          value = numeric;
          raw = match[0].slice(0, 120);
        }
      }
    } catch {
      return null;
    }
  }

  if (value === null) {
    const cnyPatterns = [
      /(?:¥|￥|RMB|CNY)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/|／|每)?\s*(?:kg|公斤|千克)/i,
      /([0-9]+(?:\.[0-9]+)?)\s*(?:元|¥|￥)\s*(?:\/|／|每)?\s*(?:kg|公斤|千克)/i,
    ];
    for (const pattern of cnyPatterns) {
      const match = pattern.exec(text);
      if (match) {
        value = Number(match[1]);
        unit = 'cny';
        raw = match[0].slice(0, 120);
        break;
      }
    }
  }

  if (value === null) {
    const usdPattern = /(?:\$|USD)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/|per)?\s*(?:kg|公斤)/i;
    const match = usdPattern.exec(text);
    if (match) {
      value = Number(match[1]);
      raw = match[0].slice(0, 120);
    }
  }

  if (value === null || !Number.isFinite(value) || value <= 0) return null;

  const usdPerKg = unit === 'cny' ? (fxUsdCny ? value / fxUsdCny : NaN) : value;
  if (!Number.isFinite(usdPerKg) || usdPerKg < 0.1 || usdPerKg > 200) return null;

  return { usdPerKg: Math.round(usdPerKg * 10000) / 10000, raw };
}

async function recordObservation(input: {
  countryCode: string;
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string;
  usdPerKg: number | null;
  ok: boolean;
  error: string;
}) {
  await getPool().query(
    `INSERT INTO shipping_market_observations
       (id, country_code, source_id, source_label, source_url, usd_per_kg, ok, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      `m${randomUUID()}`,
      input.countryCode,
      input.sourceId,
      input.sourceLabel,
      input.sourceUrl,
      input.usdPerKg,
      input.ok,
      input.error.slice(0, 300),
    ]
  );
}

/** Records the FX rate and one observation per enabled source. */
export async function runMarketCapture(): Promise<MarketCaptureResult> {
  await ensureDatabaseSchema();
  const pool = getPool();

  const result: MarketCaptureResult = {
    fxUsdCny: null,
    fxSource: '',
    captured: 0,
    failed: 0,
    errors: [],
  };

  const fx = await fetchUsdCny();
  if (fx) {
    result.fxUsdCny = fx.rate;
    result.fxSource = fx.source;
    await pool.query(
      `INSERT INTO fx_rates (pair, rate, source, captured_at)
       VALUES ('USDCNY', $1, $2, NOW())
       ON CONFLICT (pair) DO UPDATE SET rate = EXCLUDED.rate,
                                        source = EXCLUDED.source,
                                        captured_at = NOW()`,
      [fx.rate, fx.source]
    );
  } else {
    result.errors.push('FX lookup failed');
  }

  const sourcesResult = await pool.query(
    `SELECT * FROM shipping_market_sources WHERE enabled = TRUE ORDER BY country_code ASC LIMIT 8`
  );

  for (const row of sourcesResult.rows) {
    const source: MarketSource = {
      id: String(row.id),
      countryCode: String(row.country_code),
      label: String(row.label || ''),
      url: String(row.url || ''),
      unit: row.unit === 'cny_per_kg' ? 'cny_per_kg' : 'usd_per_kg',
      regex: String(row.regex || ''),
      enabled: Boolean(row.enabled),
      notes: String(row.notes || ''),
    };

    try {
      if (!isSafePublicUrl(source.url)) throw new Error('Unsafe or invalid URL');
      const html = await fetchText(source.url);
      const parsed = extractPerKg(html, source.regex, result.fxUsdCny);
      if (!parsed) throw new Error('No per-kg price found');

      await recordObservation({
        countryCode: source.countryCode,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        usdPerKg: parsed.usdPerKg,
        ok: true,
        error: '',
      });
      result.captured += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fetch failed';
      result.failed += 1;
      result.errors.push(`${source.countryCode} ${source.label}: ${message}`);
      await recordObservation({
        countryCode: source.countryCode,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        usdPerKg: null,
        ok: false,
        error: message,
      });
    }
  }

  return result;
}

export async function listMarketSources(): Promise<MarketSource[]> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    'SELECT * FROM shipping_market_sources ORDER BY country_code ASC, label ASC'
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    countryCode: String(row.country_code),
    label: String(row.label || ''),
    url: String(row.url || ''),
    unit: row.unit === 'cny_per_kg' ? 'cny_per_kg' : 'usd_per_kg',
    regex: String(row.regex || ''),
    enabled: Boolean(row.enabled),
    notes: String(row.notes || ''),
  }));
}

export async function upsertMarketSource(input: {
  id?: string;
  countryCode: string;
  label?: string;
  url: string;
  unit?: string;
  regex?: string;
  enabled?: unknown;
  notes?: string;
}): Promise<MarketSource | null> {
  const countryCode = input.countryCode.trim().toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(countryCode)) return null;
  if (!isSafePublicUrl(input.url)) return null;

  await ensureDatabaseSchema();
  const id = input.id || `s${randomUUID()}`;
  const result = await getPool().query(
    `INSERT INTO shipping_market_sources
       (id, country_code, label, url, unit, regex, enabled, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (id) DO UPDATE SET
       country_code = EXCLUDED.country_code,
       label = EXCLUDED.label,
       url = EXCLUDED.url,
       unit = EXCLUDED.unit,
       regex = EXCLUDED.regex,
       enabled = EXCLUDED.enabled,
       notes = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING *`,
    [
      id,
      countryCode,
      String(input.label || '').slice(0, 100),
      input.url.slice(0, 500),
      input.unit === 'cny_per_kg' ? 'cny_per_kg' : 'usd_per_kg',
      String(input.regex || '').slice(0, 200),
      input.enabled === undefined ? true : Boolean(input.enabled),
      String(input.notes || '').slice(0, 300),
    ]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    id: String(row.id),
    countryCode: String(row.country_code),
    label: String(row.label || ''),
    url: String(row.url || ''),
    unit: row.unit === 'cny_per_kg' ? 'cny_per_kg' : 'usd_per_kg',
    regex: String(row.regex || ''),
    enabled: Boolean(row.enabled),
    notes: String(row.notes || ''),
  };
}

export async function deleteMarketSource(id: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const result = await getPool().query('DELETE FROM shipping_market_sources WHERE id = $1', [id]);
  return Boolean(result.rowCount);
}

/** Latest successful observation per country within the last 24 hours. */
export async function getMarketSummary(): Promise<
  Array<{ countryCode: string; low: number; median: number; high: number; count: number; capturedAt: string }>
> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    `SELECT country_code,
            MIN(usd_per_kg) AS low,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY usd_per_kg) AS median,
            MAX(usd_per_kg) AS high,
            COUNT(*)::int AS count,
            MAX(captured_at) AS captured_at
     FROM shipping_market_observations
     WHERE ok = TRUE AND usd_per_kg IS NOT NULL AND captured_at > NOW() - INTERVAL '24 hours'
     GROUP BY country_code
     ORDER BY country_code ASC`
  );
  return result.rows.map((row) => ({
    countryCode: String(row.country_code),
    low: Number(row.low),
    median: Number(row.median),
    high: Number(row.high),
    count: Number(row.count),
    capturedAt: new Date(String(row.captured_at)).toISOString(),
  }));
}

export async function getLatestFx(): Promise<{ rate: number; source: string; capturedAt: string } | null> {
  await ensureDatabaseSchema();
  const result = await getPool().query("SELECT * FROM fx_rates WHERE pair = 'USDCNY' LIMIT 1");
  if (!result.rowCount) return null;
  return {
    rate: Number(result.rows[0].rate),
    source: String(result.rows[0].source || ''),
    capturedAt: new Date(String(result.rows[0].captured_at)).toISOString(),
  };
}
