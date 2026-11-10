/**
 * Stage 2 market capture for freight: finds public per-kg quotes.
 *
 * Fixed-URL scraping breaks constantly (forwarder pages are JavaScript apps),
 * so this uses the same evidence-first approach as compliance: search the live
 * web, ask the model to extract only explicit per-kg prices, and store each
 * quote with the page it came from. Read-only — nothing here changes a rate.
 */

import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { webSearch } from '@/lib/companyLookup';
import { getLatestFx, isSafePublicUrl } from '@/lib/shippingMarket';

export interface FreightScanResult {
  checkedAt: string;
  countries: number;
  quotes: number;
  skipped: number;
  errors: string[];
  samples: Array<{ countryCode: string; usdPerKg: number; source: string }>;
}

interface Quote {
  usdPerKg: number;
  citedIndex: number;
  note: string;
}

const MAX_QUOTES_PER_COUNTRY = 3;
// Parcel line-haul to a single destination rarely falls outside this band;
// anything else is almost certainly a container rate or an order total.
const MIN_USD_PER_KG = 0.5;
const MAX_USD_PER_KG = 50;
// Social posts and forums are not a quotable price, even when a number appears.
const BLOCKED_HOSTS = [
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'quora.com',
  'pinterest.com',
  'linkedin.com',
];

function isBlockedSource(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return true;
  }
}

function parseQuotes(content: string): Quote[] {
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text) as { quotes?: unknown };
    if (!Array.isArray(parsed.quotes)) return [];
    return parsed.quotes
      .map((entry) => entry as Record<string, unknown>)
      .filter((entry) => typeof entry.usdPerKg === 'number' && Number.isFinite(entry.usdPerKg))
      .map((entry) => ({
        usdPerKg: Number(entry.usdPerKg),
        citedIndex: typeof entry.citedIndex === 'number' ? Math.trunc(Number(entry.citedIndex)) : 0,
        note: typeof entry.note === 'string' ? entry.note.slice(0, 200) : '',
      }))
      .filter(
        (quote) =>
          quote.usdPerKg >= MIN_USD_PER_KG &&
          quote.usdPerKg <= MAX_USD_PER_KG &&
          quote.citedIndex >= 1
      )
      .slice(0, MAX_QUOTES_PER_COUNTRY);
  } catch {
    return [];
  }
}

async function extractQuotes(
  countryName: string,
  fxUsdCny: number | null,
  results: Array<{ title: string; snippet: string; url: string }>
): Promise<Quote[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const list = results
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${item.title}\n   ${item.snippet}\n   ${item.url}`)
    .join('\n');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            `You extract parcel shipping prices from search results for sending goods from China to ${countryName}.`,
            'Only use numbers that appear explicitly in the snippets. Never estimate or infer.',
            'Accept only a price per kilogram for parcel / air / express / line-haul shipping.',
            'Reject container (FCL/LCL), sea freight index, per-shipment total, per-item price, and membership fees.',
            fxUsdCny
              ? `Convert CNY per kg to USD per kg using 1 USD = ${fxUsdCny} CNY.`
              : 'If a price is in CNY and no exchange rate is known, skip it.',
            'Return at most three quotes, each from a different result.',
            'citedIndex = the 1-based number of the result the quote appears in.',
            'note: a few words on the channel, e.g. "air line, 21-45kg".',
            'Return strict JSON: {"quotes":[{"usdPerKg":number,"citedIndex":number,"note":string}]}',
            'Return {"quotes":[]} when nothing qualifies.',
          ].join('\n'),
        },
        { role: 'user', content: list || '(no results)' },
      ],
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  return content ? parseQuotes(content) : [];
}

/** Countries least recently observed go first, so the list rotates. */
async function pickCountries(limit: number, only?: string[]): Promise<Array<{ code: string; name: string }>> {
  const pool = getPool();
  if (only && only.length > 0) {
    const result = await pool.query(
      'SELECT country_code, country_name FROM shipping_rates WHERE country_code = ANY($1::text[])',
      [only]
    );
    return result.rows.map((row) => ({
      code: String(row.country_code),
      name: String(row.country_name),
    }));
  }

  const result = await pool.query(
    `SELECT r.country_code, r.country_name,
            COALESCE((SELECT MAX(o.captured_at) FROM shipping_market_observations o
                      WHERE o.country_code = r.country_code AND o.ok = TRUE), TIMESTAMPTZ 'epoch') AS last_at
     FROM shipping_rates r
     ORDER BY last_at ASC, r.country_code ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => ({
    code: String(row.country_code),
    name: String(row.country_name),
  }));
}

export async function runFreightQuoteScan(
  batchSize = 6,
  only?: string[]
): Promise<FreightScanResult> {
  await ensureDatabaseSchema();
  const result: FreightScanResult = {
    checkedAt: new Date().toISOString(),
    countries: 0,
    quotes: 0,
    skipped: 0,
    errors: [],
    samples: [],
  };

  if (!process.env.SERPER_API_KEY && !process.env.TAVILY_API_KEY) {
    result.errors.push('SERPER_API_KEY / TAVILY_API_KEY not configured — nothing captured');
    return result;
  }

  const fx = await getLatestFx();
  const countries = await pickCountries(Math.min(Math.max(batchSize, 1), 8), only);
  result.countries = countries.length;
  const pool = getPool();

  for (const country of countries) {
    try {
      const results = await webSearch(
        `shipping cost from China to ${country.name} per kg parcel forwarder price`
      );
      if (results.length === 0) {
        result.skipped += 1;
        continue;
      }

      const quotes = await extractQuotes(country.name, fx?.rate ?? null, results);
      if (quotes.length === 0) {
        result.skipped += 1;
        continue;
      }

      for (const quote of quotes) {
        const cited = results[Math.min(quote.citedIndex, results.length) - 1];
        if (!cited || !isSafePublicUrl(cited.url) || isBlockedSource(cited.url)) continue;

        // Keep the 24h range honest: the same page should not count twice.
        const seen = await pool.query(
          `SELECT 1 FROM shipping_market_observations
           WHERE country_code = $1 AND source_url = $2 AND captured_at > NOW() - INTERVAL '24 hours'
           LIMIT 1`,
          [country.code, cited.url]
        );
        if (seen.rowCount) continue;

        await pool.query(
          `INSERT INTO shipping_market_observations
             (id, country_code, source_id, source_label, source_url, usd_per_kg, ok, error)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE, '')`,
          [
            `m${randomUUID()}`,
            country.code,
            'ai-search',
            quote.note || new URL(cited.url).hostname.slice(0, 100),
            cited.url,
            Math.round(quote.usdPerKg * 10000) / 10000,
          ]
        );
        result.quotes += 1;
        result.samples.push({
          countryCode: country.code,
          usdPerKg: Math.round(quote.usdPerKg * 100) / 100,
          source: new URL(cited.url).hostname,
        });
      }
    } catch (error) {
      result.errors.push(
        `${country.code}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return result;
}
