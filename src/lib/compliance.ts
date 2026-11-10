import { ensureDatabaseSchema, getPool } from '@/lib/db';

export type ComplianceRiskLevel = 'none' | 'medium' | 'high';

export interface ComplianceRule {
  countryCode: string;
  countryName: string;
  riskLevel: ComplianceRiskLevel;
  restrictedTypes: string;
  message: string;
  sourceUrl: string;
  enabled: boolean;
  updatedAt: string;
}

export const COMPLIANCE_DISCLAIMER =
  'This is general guidance only. Customs rules change and depend on the exact model. Please confirm with your local customs authority — import compliance is the importer\u2019s responsibility.';

function normalizeRisk(value: unknown): ComplianceRiskLevel {
  return value === 'high' || value === 'medium' ? value : 'none';
}

function mapRow(row: Record<string, unknown>): ComplianceRule {
  return {
    countryCode: String(row.country_code || '').toUpperCase(),
    countryName: String(row.country_name || ''),
    riskLevel: normalizeRisk(row.risk_level),
    restrictedTypes: String(row.restricted_types || ''),
    message: String(row.message || ''),
    sourceUrl: String(row.source_url || ''),
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : '',
  };
}

/** Returns the active rule for a country, or null when nothing applies. */
export async function getComplianceRule(countryCode: string): Promise<ComplianceRule | null> {
  const code = countryCode.trim().toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(code)) return null;

  await ensureDatabaseSchema();
  const result = await getPool().query(
    'SELECT * FROM knife_compliance_rules WHERE country_code = $1 AND enabled = TRUE LIMIT 1',
    [code]
  );
  if (!result.rowCount) return null;

  const rule = mapRow(result.rows[0]);
  return rule.riskLevel === 'none' ? null : rule;
}

/** Full list for the admin panel, including disabled and low-risk rows. */
export async function listComplianceRules(): Promise<ComplianceRule[]> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    'SELECT * FROM knife_compliance_rules ORDER BY risk_level DESC, country_name ASC'
  );
  return result.rows.map(mapRow);
}

export async function updateComplianceRule(input: {
  countryCode: string;
  countryName?: string;
  riskLevel: unknown;
  restrictedTypes?: string;
  message?: string;
  sourceUrl?: string;
  enabled?: unknown;
}): Promise<ComplianceRule | null> {
  const code = input.countryCode.trim().toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(code)) return null;

  await ensureDatabaseSchema();
  const result = await getPool().query(
    `INSERT INTO knife_compliance_rules
       (country_code, country_name, risk_level, restricted_types, message, source_url, enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (country_code) DO UPDATE SET
       country_name = EXCLUDED.country_name,
       risk_level = EXCLUDED.risk_level,
       restricted_types = EXCLUDED.restricted_types,
       message = EXCLUDED.message,
       source_url = EXCLUDED.source_url,
       enabled = EXCLUDED.enabled,
       updated_at = NOW()
     RETURNING *`,
    [
      code,
      String(input.countryName || code).slice(0, 100),
      normalizeRisk(input.riskLevel),
      String(input.restrictedTypes || '').slice(0, 500),
      String(input.message || '').slice(0, 800),
      String(input.sourceUrl || '').slice(0, 500),
      input.enabled === undefined ? true : Boolean(input.enabled),
    ]
  );

  return result.rowCount ? mapRow(result.rows[0]) : null;
}
