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
  updateComplianceRule,
  type ComplianceRiskLevel,
} from '@/lib/compliance';
import { isSafePublicUrl } from '@/lib/shippingMarket';

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
            'riskLevel: "high" when locking/flick/gravity/butterfly knives or similar are prohibited; "medium" when only some categories are limited or a licence is required; "none" when nothing restricts knives.',
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
