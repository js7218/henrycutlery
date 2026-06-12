const ATTACK_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /<\s*script\b/i, label: 'script tag' },
  { regex: /<\/?[a-z][\s\S]*>/i, label: 'html tag' },
  { regex: /\bon\w+\s*=/i, label: 'inline event handler' },
  { regex: /javascript\s*:/i, label: 'javascript uri' },
  { regex: /\b(union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+\w+\s+set|alter\s+table)\b/i, label: 'sql payload' },
  { regex: /'\s*or\s*'?\d+'?\s*=\s*'?\d+/i, label: 'sql boolean bypass' },
  { regex: /--|\/\*|\*\//, label: 'sql comment marker' },
  { regex: /\.\.\/|\.\.\\/, label: 'path traversal' },
  { regex: /\b(passwd|shadow|pg_catalog|information_schema|database_url|pgpassword|jwt_secret|admin_panel_pin)\b/i, label: 'credential probing' },
  { regex: /[\u0000-\u001F\u007F]/, label: 'control character' },
];

export function detectInputThreat(value: string) {
  for (const pattern of ATTACK_PATTERNS) {
    if (pattern.regex.test(value)) {
      return { safe: false, reason: pattern.label };
    }
  }

  return { safe: true };
}
