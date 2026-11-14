import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { listComplianceRules } from '@/lib/compliance';
import { OFFICIAL_DOMAINS } from '@/lib/complianceOfficialDomains';
import { isOfficialForCountry } from '@/lib/complianceFeed';
import { webSearch } from '@/lib/companyLookup';

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
  knowledgeChecked: number;
  knowledgeQueued: number;
  knowledgeSkipped: number;
}

interface DutyVerdict {
  dutyPct: number | null;
  citedIndex: number;
  confident: boolean;
  note: string;
}

/**
 * Most countries have no machine-readable tariff feed. For those we search the
 * live web but still require a citation on the destination's own customs site,
 * and the result only becomes a queued suggestion — never a live price.
 */
async function judgeDuty(
  countryName: string,
  countryCode: string,
  results: Array<{ title: string; snippet: string; url: string }>
): Promise<DutyVerdict | null> {
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
            `You extract the import duty rate that ${countryName} (${countryCode}) charges on knives classified under HS 8211.92 or 8211.93.`,
            'Use ONLY the numbered search results below. Never rely on memory.',
            'dutyPct must be the ad valorem (percentage) customs duty for goods originating outside any free-trade bloc — the standard/MFN rate. Do NOT include VAT, GST, sales tax, excise or anti-dumping amounts.',
            'If the official rate is compound (for example "8% + 1.2 cents each") return the percentage part and repeat the full wording in note.',
            'If the rate is specific only (cents per knife, no percentage) set dutyPct to null and put the exact wording in note.',
            'citedIndex = the 1-based number of the result you used, or 0 if no result states a rate.',
            'confident = true only when the cited page is an official customs/government page that shows an actual rate.',
            'note: one short sentence quoting the official wording, or "".',
            'Return strict JSON: {"dutyPct":number|null,"citedIndex":number,"confident":boolean,"note":string}',
          ].join('\n'),
        },
        { role: 'user', content: list || '(no results)' },
      ],
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as DutyVerdict;
    return {
      dutyPct: typeof parsed.dutyPct === 'number' && Number.isFinite(parsed.dutyPct) ? parsed.dutyPct : null,
      citedIndex: Number(parsed.citedIndex) || 0,
      confident: Boolean(parsed.confident),
      note: typeof parsed.note === 'string' ? parsed.note : '',
    };
  } catch {
    return null;
  }
}

/**
 * Rotates through the countries that the official feeds do not cover.
 * Runs a handful per week so every country is revisited without hammering the
 * search API. Suggestions always land in the approval queue.
 */
async function runTariffKnowledgeScan(batchSize: number, result: TariffScanResult): Promise<void> {
  if (!process.env.SERPER_API_KEY && !process.env.TAVILY_API_KEY) {
    result.failed.push('knowledge: SERPER_API_KEY / TAVILY_API_KEY not configured');
    return;
  }

  const pool = getPool();
  const rows = await pool.query(
    `SELECT country_code, duty_pct
     FROM country_tax_rates
     WHERE country_code NOT IN ('US', 'GB')
     ORDER BY duty_checked_at NULLS FIRST, updated_at ASC
     LIMIT $1`,
    [Math.min(Math.max(batchSize, 1), 12)]
  );

  const names = new Map((await listComplianceRules()).map((rule) => [rule.countryCode, rule.countryName]));

  for (const row of rows.rows) {
    const code = String(row.country_code);
    const name = names.get(code) || code;
    const domain = OFFICIAL_DOMAINS[code];
    const query = domain
      ? `${name} customs import duty 8211.92 knife site:${domain}`
      : `${name} customs tariff 8211.92 knife import duty`;

    try {
      const results = await webSearch(query);
      if (results.length === 0) {
        result.knowledgeSkipped += 1;
        await markDutyChecked(code);
        continue;
      }

      const verdict = await judgeDuty(name, code, results);
      if (!verdict || !verdict.confident || verdict.citedIndex < 1 || verdict.dutyPct === null) {
        result.knowledgeSkipped += 1;
        await markDutyChecked(code);
        continue;
      }

      const cited = results[Math.min(verdict.citedIndex, results.length) - 1];
      if (!cited || !isOfficialForCountry(cited.url, code)) {
        result.knowledgeSkipped += 1;
        await markDutyChecked(code);
        continue;
      }

      result.knowledgeChecked += 1;
      const currentDuty = Number(row.duty_pct ?? 0);
      const changed = Math.abs(currentDuty - verdict.dutyPct) >= 0.1;
      const pending = await pool.query(
        `SELECT 1 FROM tariff_scan_changes WHERE status = 'pending' AND country_code = $1`,
        [code]
      );

      if (changed && pending.rows.length === 0) {
        await pool.query(
          `INSERT INTO tariff_scan_changes
             (id, country_code, current_duty_pct, proposed_duty_pct, source_url, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            code,
            currentDuty,
            verdict.dutyPct,
            cited.url,
            `AI-extracted from an official page — check the link before applying. ${verdict.note}`.slice(0, 1000),
          ]
        );
        result.knowledgeQueued += 1;
      } else {
        result.unchanged += 1;
      }
      await markDutyChecked(code);
    } catch (error) {
      result.knowledgeSkipped += 1;
      result.failed.push(`${code}: ${error instanceof Error ? error.message : 'scan failed'}`);
      await markDutyChecked(code);
    }
  }
}

async function markDutyChecked(countryCode: string): Promise<void> {
  await getPool().query(
    `UPDATE country_tax_rates SET duty_checked_at = NOW() WHERE country_code = $1`,
    [countryCode]
  );
}

export async function runTariffScan(): Promise<TariffScanResult> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const result: TariffScanResult = {
    checked: 0,
    queued: 0,
    unchanged: 0,
    failed: [],
    knowledgeChecked: 0,
    knowledgeQueued: 0,
    knowledgeSkipped: 0,
  };

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

  // The other 50 destinations have no public rate feed; rotate through a few
  // each run with citation checks, still queuing anything they turn up.
  await runTariffKnowledgeScan(6, result);

  return result;
}
