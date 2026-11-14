/**
 * Automatic compliance rule scanning.
 *
 * Every day we read a small set of official government pages, ask the model
 * whether the change restricts knife imports for that country, and apply the
 * result. Tightening a rule is applied automatically (blocking a shipment is
 * the safe direction); loosening it is recorded for the owner to confirm,
 * because a wrong loosening can cost a whole parcel at customs.
 */

import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import {
  getComplianceRule,
  listComplianceRules,
  updateComplianceRule,
  type ComplianceRiskLevel,
} from '@/lib/compliance';
import { webSearch } from '@/lib/companyLookup';
import { isSafePublicUrl } from '@/lib/shippingMarket';
import { OFFICIAL_DOMAINS } from '@/lib/complianceOfficialDomains';

export interface ScanSource {
  id: string;
  countryCode: string;
  label: string;
  url: string;
  enabled: boolean;
  lastCheckedAt: string;
  lastStatus: string;
}

export interface ScanChange {
  id: string;
  countryCode: string;
  oldRisk: ComplianceRiskLevel;
  newRisk: ComplianceRiskLevel;
  summary: string;
  sourceUrl: string;
  applied: boolean;
  createdAt: string;
}

export interface ScanResult {
  checkedAt: string;
  sources: number;
  applied: number;
  pending: number;
  skipped: number;
  errors: string[];
}

const RISK_ORDER: Record<ComplianceRiskLevel, number> = { none: 0, medium: 1, high: 2 };
const KEYWORDS = /knife|knives|blade|bladed|weapon|prohibit|restrict|import control|offensive/i;
const MAX_TEXT = 4000;
const MAX_AUTO_APPLY = 3;

const DEFAULT_SOURCES: Array<Omit<ScanSource, 'lastCheckedAt' | 'lastStatus'>> = [
  {
    id: 'govuk-weapons',
    countryCode: 'GB',
    label: 'GOV.UK — offensive weapons',
    url: 'https://www.gov.uk/api/search.json?q=offensive+weapons+knife+prohibited&count=5',
    enabled: true,
  },
  {
    id: 'govuk-import',
    countryCode: 'GB',
    label: 'GOV.UK — import controls',
    url: 'https://www.gov.uk/api/search.json?q=import+controls+offensive+weapons&count=5',
    enabled: true,
  },
];

function normalizeRisk(value: unknown): ComplianceRiskLevel {
  return value === 'high' || value === 'medium' ? value : 'none';
}

function mapSource(row: Record<string, unknown>): ScanSource {
  return {
    id: String(row.id),
    countryCode: String(row.country_code || '').toUpperCase(),
    label: String(row.label || ''),
    url: String(row.url || ''),
    enabled: Boolean(row.enabled),
    lastCheckedAt: row.last_checked_at ? new Date(String(row.last_checked_at)).toISOString() : '',
    lastStatus: String(row.last_status || ''),
  };
}

function mapChange(row: Record<string, unknown>): ScanChange {
  return {
    id: String(row.id),
    countryCode: String(row.country_code || '').toUpperCase(),
    oldRisk: normalizeRisk(row.old_risk),
    newRisk: normalizeRisk(row.new_risk),
    summary: String(row.summary || ''),
    sourceUrl: String(row.source_url || ''),
    applied: Boolean(row.applied),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : '',
  };
}

/** Seeds the default sources once; existing rows are never overwritten. */
async function ensureSources(): Promise<void> {
  await ensureDatabaseSchema();
  const pool = getPool();
  for (const source of DEFAULT_SOURCES) {
    await pool.query(
      `INSERT INTO compliance_scan_sources (id, country_code, label, url, enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [source.id, source.countryCode, source.label, source.url, source.enabled]
    );
  }
}

export async function listScanSources(): Promise<ScanSource[]> {
  await ensureSources();
  const result = await getPool().query(
    'SELECT * FROM compliance_scan_sources ORDER BY country_code ASC, label ASC'
  );
  return result.rows.map(mapSource);
}

export async function listScanChanges(limit = 20): Promise<ScanChange[]> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    'SELECT * FROM compliance_scan_changes ORDER BY created_at DESC LIMIT $1',
    [Math.min(Math.max(limit, 1), 100)]
  );
  return result.rows.map(mapChange);
}

async function setSourceStatus(id: string, status: string): Promise<void> {
  await getPool().query(
    'UPDATE compliance_scan_sources SET last_checked_at = NOW(), last_status = $2 WHERE id = $1',
    [id, status.slice(0, 200)]
  );
}

/** Reads a source page and flattens it into a short plain-text excerpt. */
async function fetchExcerpt(url: string): Promise<string> {
  if (!isSafePublicUrl(url)) throw new Error('Source URL rejected by SSRF guard');

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'AdamCutleryComplianceBot/1.0 (+https://adamcutlery.com)',
      Accept: 'application/json, text/html;q=0.9, */*;q=0.5',
    },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw = await res.text();
  let text = raw;

  // GOV.UK search returns JSON with title/description entries.
  try {
    const parsed = JSON.parse(raw) as { results?: Array<{ title?: string; description?: string }> };
    if (Array.isArray(parsed.results)) {
      text = parsed.results
        .map((entry) => `${entry.title || ''}. ${entry.description || ''}`)
        .join('\n');
    }
  } catch {
    text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  }

  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

interface Judgement {
  affectsKnifeImport: boolean;
  riskLevel: ComplianceRiskLevel;
  restrictedTypes: string;
  message: string;
  confident: boolean;
}

function parseJudgement(content: string): Judgement | null {
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.affectsKnifeImport !== 'boolean') return null;
    return {
      affectsKnifeImport: parsed.affectsKnifeImport,
      riskLevel: normalizeRisk(parsed.riskLevel),
      restrictedTypes:
        typeof parsed.restrictedTypes === 'string' ? parsed.restrictedTypes.slice(0, 300) : '',
      message: typeof parsed.message === 'string' ? parsed.message.slice(0, 600) : '',
      confident: parsed.confident === true,
    };
  } catch {
    return null;
  }
}

async function judge(countryCode: string, excerpt: string): Promise<Judgement | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
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
            'You read official customs/import pages and decide whether they restrict importing knives into one country.',
            'Only answer from the text provided. Do not use outside assumptions.',
            'affectsKnifeImport = true only when the text states or clearly updates a restriction on bladed items.',
            'riskLevel definitions:',
            '"high" only when common folding/locking knives that an ordinary customer might buy are prohibited or need a permit.',
            '"medium" when only specialty categories (switchblades, automatics, butterfly/flick knives, push daggers, ballistic knives) are restricted and ordinary kitchen or fixed-blade knives are fine.',
            '"none" when nothing restricts ordinary knives.',
            'message must say in plain words whether ordinary kitchen and fixed-blade knives are affected.',
            'confident = true only when the text is explicit. If it is a news item, statistics, or unrelated, set affectsKnifeImport=false and confident=false.',
            'restrictedTypes: short comma-separated list of the restricted item categories, or "".',
            'message: one or two sentences a customer can read, or "".',
            'Return strict JSON: {"affectsKnifeImport":boolean,"riskLevel":"none|medium|high","restrictedTypes":string,"message":string,"confident":boolean}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Country: ${countryCode}\nOfficial page text:\n${excerpt}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return parseJudgement(content);
}

/**
 * Runs one scan. Tightening is applied automatically, loosening is queued for
 * the owner, and anything uncertain leaves the current rule untouched.
 */
export async function runComplianceScan(): Promise<ScanResult> {
  const sources = (await listScanSources()).filter((source) => source.enabled);
  const result: ScanResult = {
    checkedAt: new Date().toISOString(),
    sources: sources.length,
    applied: 0,
    pending: 0,
    skipped: 0,
    errors: [],
  };

  for (const source of sources) {
    try {
      const excerpt = await fetchExcerpt(source.url);
      if (!KEYWORDS.test(excerpt)) {
        await setSourceStatus(source.id, 'no relevant keywords');
        result.skipped += 1;
        continue;
      }

      const judgement = await judge(source.countryCode, excerpt);
      if (!judgement || !judgement.affectsKnifeImport || !judgement.confident) {
        await setSourceStatus(source.id, 'no confirmed change');
        result.skipped += 1;
        continue;
      }

      const current = await getComplianceRule(source.countryCode);
      const oldRisk: ComplianceRiskLevel = current?.riskLevel || 'none';
      const newRisk = judgement.riskLevel;

      if (RISK_ORDER[newRisk] > RISK_ORDER[oldRisk] && result.applied < MAX_AUTO_APPLY) {
        await updateComplianceRule({
          countryCode: source.countryCode,
          countryName: current?.countryName || source.countryCode,
          riskLevel: newRisk,
          restrictedTypes: judgement.restrictedTypes || current?.restrictedTypes || '',
          message: judgement.message || current?.message || '',
          sourceUrl: source.url,
          enabled: true,
        });
        await recordChange(source, oldRisk, newRisk, judgement.message, true);
        result.applied += 1;
        await setSourceStatus(source.id, `tightened to ${newRisk}`);
        continue;
      }

      if (RISK_ORDER[newRisk] < RISK_ORDER[oldRisk]) {
        // Loosening is never automatic: a false positive here ships a parcel
        // that customs will seize.
        const duplicate = await getPool().query(
          `SELECT 1 FROM compliance_scan_changes
            WHERE country_code = $1 AND new_risk = $2 AND applied = FALSE
              AND created_at > NOW() - INTERVAL '7 days'
            LIMIT 1`,
          [source.countryCode, newRisk]
        );
        if ((duplicate.rowCount || 0) > 0) {
          await setSourceStatus(source.id, 'loosening already awaiting review');
          result.skipped += 1;
          continue;
        }
        await recordChange(source, oldRisk, newRisk, judgement.message, false);
        result.pending += 1;
        await setSourceStatus(source.id, `suggests loosening to ${newRisk}`);
        continue;
      }

      await setSourceStatus(source.id, 'no change');
      result.skipped += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${source.id}: ${message}`);
      await setSourceStatus(source.id, `error: ${message}`).catch(() => {});
    }
  }

  return result;
}

async function recordChange(
  source: ScanSource,
  oldRisk: ComplianceRiskLevel,
  newRisk: ComplianceRiskLevel,
  summary: string,
  applied: boolean
): Promise<void> {
  await getPool().query(
    `INSERT INTO compliance_scan_changes
       (id, country_code, old_risk, new_risk, summary, source_url, applied)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), source.countryCode, oldRisk, newRisk, summary.slice(0, 600), source.url, applied]
  );
}

export interface KnowledgeScanResult {
  checkedAt: string;
  checked: number;
  applied: number;
  skipped: number;
  errors: string[];
}

interface KnowledgeVerdict {
  riskLevel: ComplianceRiskLevel;
  restrictedTypes: string;
  message: string;
  citedIndex: number;
  confident: boolean;
}

function parseVerdict(content: string): KnowledgeVerdict | null {
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      riskLevel: normalizeRisk(parsed.riskLevel),
      restrictedTypes:
        typeof parsed.restrictedTypes === 'string' ? parsed.restrictedTypes.slice(0, 300) : '',
      message: typeof parsed.message === 'string' ? parsed.message.slice(0, 600) : '',
      citedIndex:
        typeof parsed.citedIndex === 'number' && Number.isInteger(parsed.citedIndex)
          ? parsed.citedIndex
          : 0,
      confident: parsed.confident === true,
    };
  } catch {
    return null;
  }
}

/**
 * A citation is only acceptable when it comes from a government or customs
 * authority. Pointing a customer at a blog or an aggregator as "official
 * guidance" is worse than showing no notice at all.
 */
const OFFICIAL_EXTRA_HOSTS = new Set([
  'revenue.ie',
  'belastingdienst.nl',
  'tullverket.se',
  'zoll.de',
  'cbp.gov',
  'trade.gov',
  'abf.gov.au',
  'cbsa-asfc.gc.ca',
  'customs.govt.nz',
  'customs.go.jp',
  'police.gov.sg',
  'gov.uk',
  'europa.eu',
  'admin.ch',
]);

function isOfficialSource(url: string): boolean {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }

  if (OFFICIAL_EXTRA_HOSTS.has(host)) return true;
  return (
    /(^|\.)gov(\.[a-z]{2,3})?$/.test(host) ||
    /\.gov\./.test(host) ||
    /\.gouv\./.test(host) ||
    /\.govt\./.test(host) ||
    /\.gob\./.test(host) ||
    host.endsWith('.gc.ca') ||
    host.endsWith('.europa.eu') ||
    host.endsWith('.admin.ch') ||
    host.endsWith('.go.jp')
  );
}

/** True when the URL sits on the destination country's own customs domain. */
export function isOfficialForCountry(url: string, countryCode: string): boolean {
  const domain = OFFICIAL_DOMAINS[countryCode];
  if (domain) {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (host === domain || host.endsWith(`.${domain}`)) return true;
    } catch {
      return false;
    }
  }
  return isOfficialSource(url);
}

/**
 * Verifies one country against fresh search results. The model must cite the
 * result it relied on; without a citation the answer is treated as unverified.
 */
async function judgeWithSources(
  rule: { countryCode: string; countryName: string },
  results: Array<{ title: string; snippet: string; url: string }>
): Promise<KnowledgeVerdict | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const year = new Date().getUTCFullYear();
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
            `You verify knife-import rules for ${rule.countryName} (${rule.countryCode}) for ${year}.`,
            'Use ONLY the numbered search results below. Never rely on memory.',
            'A result counts as current only if it states a rule that is in force now (or a dated change).',
            `The source must be ${rule.countryName}'s own government or customs authority; a guide published by another country, a blog, a forum or a commercial summary site does not count.`,
            'A page about firearms, ammunition, or general weapons licensing that does not name knives or blades does not count.',
            'riskLevel definitions:',
            '"high" only when common folding/locking knives that an ordinary customer might buy are prohibited or need a permit.',
            '"medium" when only specialty categories (switchblades, automatics, butterfly/flick knives, push daggers, ballistic knives) are restricted and ordinary kitchen or fixed-blade knives are fine.',
            '"none" when the sources explicitly allow ordinary knives.',
            'message must say in plain words whether ordinary kitchen and fixed-blade knives are affected.',
            'citedIndex = the 1-based number of the result your answer is based on, or 0 when no result supports a clear answer.',
            'confident = true only when the cited result is explicit and dated within the last 24 months.',
            'restrictedTypes: short comma-separated list, or "".',
            'message: one or two sentences a customer can read, or "".',
            'Return strict JSON: {"riskLevel":"none|medium|high","restrictedTypes":string,"message":string,"citedIndex":number,"confident":boolean}',
          ].join('\n'),
        },
        { role: 'user', content: list || '(no results)' },
      ],
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  return content ? parseVerdict(content) : null;
}

/**
 * Marks a country as looked-at even when no confident source was found.
 * The queue is ordered by checked_at, so without this the same few failing
 * countries would be retried on every run and the rest never reached.
 */
async function markAttempt(countryCode: string): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO compliance_verifications (country_code, risk_level, source_url, snippet, checked_at)
       VALUES ($1, 'none', '', '', NOW())
       ON CONFLICT (country_code) DO UPDATE SET checked_at = NOW()`,
      [countryCode]
    );
  } catch {
    // Rotation order is a convenience; never fail the batch over it.
  }
}

/**
 * Weekly rotation over every country: searches the live web, demands a dated
 * citation, then applies the verdict. Countries verified least recently go
 * first, so the whole list is covered in a few days.
 */
export async function runKnowledgeScan(batchSize = 8): Promise<KnowledgeScanResult> {
  await ensureDatabaseSchema();
  const result: KnowledgeScanResult = {
    checkedAt: new Date().toISOString(),
    checked: 0,
    applied: 0,
    skipped: 0,
    errors: [],
  };

  if (!process.env.SERPER_API_KEY && !process.env.TAVILY_API_KEY) {
    result.errors.push('SERPER_API_KEY / TAVILY_API_KEY not configured — nothing verified');
    return result;
  }

  const rules = (await listComplianceRules()).filter((rule) => rule.enabled);
  const verified = await getPool().query('SELECT country_code, checked_at FROM compliance_verifications');
  const lastChecked = new Map<string, number>(
    verified.rows.map((row) => [String(row.country_code), new Date(String(row.checked_at)).getTime()])
  );

  const queue = rules
    .sort((a, b) => (lastChecked.get(a.countryCode) ?? 0) - (lastChecked.get(b.countryCode) ?? 0))
    .slice(0, Math.min(Math.max(batchSize, 1), 12));

  for (const rule of queue) {
    try {
      const year = new Date().getUTCFullYear();
      const officialDomain = OFFICIAL_DOMAINS[rule.countryCode];
      // Anchoring the search to the destination's own customs site keeps blogs
      // and forwarders out of the candidate list in the first place.
      const query = officialDomain
        ? `${rule.countryName} knife blade import restriction prohibited site:${officialDomain}`
        : `${rule.countryName} knife import restriction prohibited ${year} customs`;
      const results = await webSearch(query);
      if (results.length === 0) {
        await markAttempt(rule.countryCode);
        result.skipped += 1;
        continue;
      }

      const verdict = await judgeWithSources(rule, results);
      if (!verdict || !verdict.confident || verdict.citedIndex < 1) {
        await markAttempt(rule.countryCode);
        result.skipped += 1;
        continue;
      }

      const cited = results[Math.min(verdict.citedIndex, results.length) - 1];
      if (!cited || !isSafePublicUrl(cited.url) || !isOfficialForCountry(cited.url, rule.countryCode)) {
        await markAttempt(rule.countryCode);
        result.skipped += 1;
        continue;
      }

      const oldRisk: ComplianceRiskLevel = rule.riskLevel || 'none';
      const newRisk = verdict.riskLevel;

      // A jump between the two extremes (prohibited <-> allowed) is too large
      // to trust to a single snippet; it is queued for the owner instead.
      const extremeJump =
        (oldRisk === 'high' && newRisk === 'none') || (oldRisk === 'none' && newRisk === 'high');
      // Downgrades are always queued: removing or softening a warning can let a
      // restricted shipment through, and a wrong call here is not recoverable.
      const loosening = RISK_ORDER[newRisk] < RISK_ORDER[oldRisk];

      if (newRisk !== oldRisk) {
        if (rule.manualOverride) {
          // The owner set this country by hand; keep it and surface the
          // disagreement instead of overwriting their decision.
          await recordChange(
            {
              id: 'knowledge',
              countryCode: rule.countryCode,
              label: 'AI verification',
              url: cited.url,
              enabled: true,
              lastCheckedAt: '',
              lastStatus: '',
            },
            oldRisk,
            newRisk,
            `${verdict.message} (kept your manual setting)`,
            false
          );
          result.skipped += 1;
        } else if (extremeJump || loosening) {
          await recordChange(
            {
              id: 'knowledge',
              countryCode: rule.countryCode,
              label: 'AI verification',
              url: cited.url,
              enabled: true,
              lastCheckedAt: '',
              lastStatus: '',
            },
            oldRisk,
            newRisk,
            verdict.message,
            false
          );
          result.skipped += 1;
        } else {
          await updateComplianceRule({
            countryCode: rule.countryCode,
            countryName: rule.countryName,
            riskLevel: newRisk,
            restrictedTypes: verdict.restrictedTypes || rule.restrictedTypes,
            message: verdict.message || rule.message,
            sourceUrl: cited.url,
            enabled: true,
          });
          await recordChange(
            {
              id: 'knowledge',
              countryCode: rule.countryCode,
              label: 'AI verification',
              url: cited.url,
              enabled: true,
              lastCheckedAt: '',
              lastStatus: '',
            },
            oldRisk,
            newRisk,
            verdict.message,
            true
          );
          result.applied += 1;
        }
      }

      await getPool().query(
        `INSERT INTO compliance_verifications
           (country_code, risk_level, source_url, snippet, checked_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (country_code) DO UPDATE SET
           risk_level = EXCLUDED.risk_level,
           source_url = EXCLUDED.source_url,
           snippet = EXCLUDED.snippet,
           checked_at = NOW()`,
        [rule.countryCode, newRisk, cited.url, cited.snippet.slice(0, 500)]
      );
      result.checked += 1;
    } catch (error) {
      result.errors.push(
        `${rule.countryCode}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return result;
}
