import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

/**
 * Weekly scan of official tariff sources for the knife HS codes we sell
 * (8211.92 fixed-blade knives, 8211.93 folding knives).
 *
 * Only two countries expose a usable public feed:
 *   - United States: USITC HTS search API
 *   - United Kingdom: trade-tariff.service.gov.uk API
 *
 * The scan never edits what customers see. It queues a proposed duty rate in
 * tariff_scan_changes and the owner applies it from the admin page.
 */

const US_URL = 'https://hts.usitc.gov/reststop/search?keyword=';
const UK_URL = 'https://www.trade-tariff.service.gov.uk/api/v2/commodities/';
const HS_CODES = ['8211.92', '8211.93'];

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'AdamCutleryTariffScan/1.0' },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

function maxPercent(text: string): number | null {
  const matches = text.match(/(\d+(?:\.\d+)?)\s*%/g);
  if (!matches) return null;
  const values = matches.map((item) => Number(item.replace('%', '').trim())).filter(Number.isFinite);
  return values.length > 0 ? Math.max(...values) : null;
}

async function scanUs(): Promise<{ duty: number; note: string; source: string } | null> {
  const raws: string[] = [];
  let duty: number | null = null;
  for (const code of HS_CODES) {
    const data = (await getJson(`${US_URL}${encodeURIComponent(code)}`)) as Array<{
      htsno?: string;
      general?: string | null;
    }>;
    for (const row of data) {
      if (!row.htsno?.startsWith(code)) continue;
      if (!row.general) continue;
      raws.push(`${row.htsno}: ${row.general}`);
      const pct = maxPercent(row.general);
      if (pct !== null && (duty === null || pct > duty)) duty = pct;
    }
  }
  if (duty === null) return null;
  return {
    duty,
    note: `US HTS general rate. Compound rates may also include a per-knife amount. ${raws.slice(0, 3).join(' | ')}`,
    source: `https://hts.usitc.gov/search?query=${encodeURIComponent('8211.92')}`,
  };
}

async function scanUk(): Promise<{ duty: number; note: string; source: string } | null> {
  let duty: number | null = null;
  const notes: string[] = [];
  for (const code of HS_CODES) {
    const commodityId = `${code.replace('.', '')}0000`;
    const payload = (await getJson(`${UK_URL}${commodityId}`)) as {
      included?: Array<{
        id?: string;
        type?: string;
        attributes?: Record<string, unknown>;
        relationships?: Record<string, { data?: { id?: string } }>;
      }>;
    };
    const included = payload.included ?? [];
    const byId = new Map(included.map((item) => [`${item.type}:${item.id}`, item]));
    const measureTypes = new Map(
      included
        .filter((item) => item.type === 'measure_type')
        .map((item) => [String(item.id), String(item.attributes?.description ?? '')])
    );

    for (const measure of included.filter((item) => item.type === 'measure')) {
      const typeId = measure.relationships?.measure_type?.data?.id;
      if (measureTypes.get(String(typeId)) !== 'Third country duty') continue;
      const expressionId = measure.relationships?.duty_expression?.data?.id;
      const expression = expressionId
        ? byId.get(`duty_expression:${expressionId}`)
        : undefined;
      const base = String(expression?.attributes?.base ?? '');
      const pct = maxPercent(base);
      if (pct === null) continue;
      notes.push(`${code}: ${base.trim()}`);
      if (duty === null || pct > duty) duty = pct;
    }
  }
  if (duty === null) return null;
  return {
    duty,
    note: `UK third-country duty. ${notes.join(' | ')}`,
    source: 'https://www.trade-tariff.service.gov.uk/headings/8211',
  };
}

export interface TariffScanResult {
  checked: number;
  queued: number;
  unchanged: number;
  failed: string[];
}

export async function runTariffScan(): Promise<TariffScanResult> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const result: TariffScanResult = { checked: 0, queued: 0, unchanged: 0, failed: [] };

  const sources: Array<{ code: string; load: () => Promise<{ duty: number; note: string; source: string } | null> }> = [
    { code: 'US', load: scanUs },
    { code: 'GB', load: scanUk },
  ];

  for (const source of sources) {
    let found: { duty: number; note: string; source: string } | null = null;
    try {
      found = await source.load();
    } catch (error) {
      result.failed.push(`${source.code}: ${error instanceof Error ? error.message : 'fetch failed'}`);
      continue;
    }
    if (!found) {
      result.failed.push(`${source.code}: no official duty line found`);
      continue;
    }

    result.checked += 1;
    const current = await pool.query(
      `SELECT duty_pct, (SELECT COUNT(*) FROM tariff_scan_changes
                         WHERE status = 'pending' AND country_code = $1) AS pending
       FROM country_tax_rates WHERE country_code = $1`,
      [source.code]
    );
    const currentDuty = Number(current.rows[0]?.duty_pct ?? 0);
    const pendingCount = Number(current.rows[0]?.pending ?? 0);
    const changed = Math.abs(currentDuty - found.duty) >= 0.1;

    if (!changed || pendingCount > 0) {
      result.unchanged += 1;
      continue;
    }

    await pool.query(
      `INSERT INTO tariff_scan_changes
         (id, country_code, current_duty_pct, proposed_duty_pct, source_url, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), source.code, currentDuty, found.duty, found.source, found.note.slice(0, 1000)]
    );
    result.queued += 1;
  }

  return result;
}
