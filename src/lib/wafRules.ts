/**
 * WAF Rules Engine
 * Comprehensive attack pattern detection and blocking rules
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Attack Pattern Definitions
// ============================================================================

export interface WAFRule {
  id: string;
  name: string;
  category: 'sql_injection' | 'xss' | 'path_traversal' | 'command_injection' | 
           'lf_injection' | 'ssrf' | 'xml_injection' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  patterns: RegExp[];
  description: string;
  blockIP?: boolean;
}

// ============================================================================
// SQL Injection Rules
// ============================================================================

export const SQL_INJECTION_RULES: WAFRule = {
  id: 'SQL_001',
  name: 'SQL Injection - Keywords',
  category: 'sql_injection',
  severity: 'critical',
  patterns: [
    /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i,
    /\b(EXEC|EXECUTE|UNION|UNION\s+ALL)\b/i,
    /\b(GRANT|REVOKE|xp_|sp_)\b/i,
  ],
  description: 'SQL keyword detected in request',
  blockIP: true,
};

export const SQL_INJECTION_UNION: WAFRule = {
  id: 'SQL_002',
  name: 'SQL Injection - UNION SELECT',
  category: 'sql_injection',
  severity: 'critical',
  patterns: [
    /union\s+(all\s+)?select/i,
    /union\s+\d+\s*,\s*\d+/i,
    /into\s+(outfile|dumpfile)\b/i,
  ],
  description: 'UNION-based SQL injection attempt',
  blockIP: true,
};

export const SQL_INJECTION_LOGIC: WAFRule = {
  id: 'SQL_003',
  name: 'SQL Injection - Logic Bypass',
  category: 'sql_injection',
  severity: 'high',
  patterns: [
    /(\b(or|and)\b\s*\d+\s*=\s*\d+)/i,
    /('\s*(or|and)\s*')/i,
    /('|\")(\s*(or|and)\s*)(\s*('|\")?\s*\d+\s*=\s*\d+)/i,
    /\bor\s+''\s*=\s*'/i,
    /\and\s+''\s*=\s*'/i,
  ],
  description: 'SQL logic bypass attempt',
  blockIP: true,
};

export const SQL_INJECTION_BLIND: WAFRule = {
  id: 'SQL_004',
  name: 'SQL Injection - Blind/Time-based',
  category: 'sql_injection',
  severity: 'high',
  patterns: [
    /\b(sleep|benchmark|waitfor|pg_sleep)\s*\(/i,
    /\b(if|case)\s+when\b/i,
    /extractvalue|updatexml/i,
  ],
  description: 'Time-based blind SQL injection',
  blockIP: true,
};

export const SQL_INJECTION_FILE: WAFRule = {
  id: 'SQL_005',
  name: 'SQL Injection - File Operations',
  category: 'sql_injection',
  severity: 'critical',
  patterns: [
    /\bload_file\s*\(/i,
    /into\s+(out|dump)file/i,
    /\binformation_schema\b/i,
    /\bmysql\.(user|db|table)/i,
  ],
  description: 'SQL file operation attempt',
  blockIP: true,
};

// ============================================================================
// XSS Rules
// ============================================================================

export const XSS_SCRIPT: WAFRule = {
  id: 'XSS_001',
  name: 'XSS - Script Tag',
  category: 'xss',
  severity: 'critical',
  patterns: [
    /<script/i,
    /<\/script/i,
    /<script\s+src/i,
    /<script\s+language/i,
  ],
  description: 'Script tag detected',
  blockIP: true,
};

export const XSS_EVENT: WAFRule = {
  id: 'XSS_002',
  name: 'XSS - Event Handlers',
  category: 'xss',
  severity: 'high',
  patterns: [
    /\bon(load|error|click|mouse\w*|key\w*|focus|blur|change|submit|reset|select|abort|blur|copy|cut|paste)\s*=/i,
    /\bon\w+\s*=/i,
    /<img[^>]+onerror/i,
    /<svg[^>]+onload/i,
  ],
  description: 'XSS event handler detected',
  blockIP: true,
};

export const XSS_JAVASCRIPT: WAFRule = {
  id: 'XSS_003',
  name: 'XSS - JavaScript URI',
  category: 'xss',
  severity: 'high',
  patterns: [
    /javascript\s*:/i,
    /vbscript\s*:/i,
    /data\s*:/i,
    /livescript\s*:/i,
  ],
  description: 'JavaScript URI scheme detected',
  blockIP: true,
};

export const XSS_OBJECT: WAFRule = {
  id: 'XSS_004',
  name: 'XSS - Object/Embed/Applet',
  category: 'xss',
  severity: 'medium',
  patterns: [
    /<object/i,
    /<embed/i,
    /<applet/i,
    /<iframe/i,
    /<frame/i,
    /<link/i,
    /<style.*@import/i,
  ],
  description: 'Potentially dangerous HTML element',
  blockIP: false,
};

export const XSS_ENCODED: WAFRule = {
  id: 'XSS_005',
  name: 'XSS - Encoded Payloads',
  category: 'xss',
  severity: 'medium',
  patterns: [
    /%3Cscript/i,
    /%3C\/script/i,
    /%3Cimg.*%20onerror/i,
    /&#x?[0-9a-f]+;/i,
  ],
  description: 'Encoded XSS payload detected',
  blockIP: false,
};

// ============================================================================
// Path Traversal Rules
// ============================================================================

export const PATH_TRAVERSAL_UNIX: WAFRule = {
  id: 'PATH_001',
  name: 'Path Traversal - Unix',
  category: 'path_traversal',
  severity: 'high',
  patterns: [
    /\.\.\//i,
    /\.\.%2f/i,
    /%2e%2e%2f/i,
    /%252e%252e/i,
    /\.\.%5c/i,
    /%2e%2e%5c/i,
  ],
  description: 'Unix path traversal attempt',
  blockIP: true,
};

export const PATH_TRAVERSAL_WINDOWS: WAFRule = {
  id: 'PATH_002',
  name: 'Path Traversal - Windows',
  category: 'path_traversal',
  severity: 'high',
  patterns: [
    /\.\.\\/i,
    /\.\.%5c/i,
    /\\\\.*\\.\.\\/i,
  ],
  description: 'Windows path traversal attempt',
  blockIP: true,
};

export const PATH_TRAVERSAL_FILES: WAFRule = {
  id: 'PATH_003',
  name: 'Path Traversal - Sensitive Files',
  category: 'path_traversal',
  severity: 'critical',
  patterns: [
    /\/etc\/passwd/i,
    /\/etc\/shadow/i,
    /\/etc\/hosts/i,
    /c:\\windows\\system/i,
    /c:\\boot\.ini/i,
    /\/boot\.ini/i,
    /\/proc\/self/i,
    /\/proc\/environ/i,
    /\/proc\/cmdline/i,
  ],
  description: 'Access to sensitive system files',
  blockIP: true,
};

// ============================================================================
// Command Injection Rules
// ============================================================================

export const COMMAND_SHELL: WAFRule = {
  id: 'CMD_001',
  name: 'Command Injection - Shell Metacharacters',
  category: 'command_injection',
  severity: 'critical',
  patterns: [
    /[;&|`$]/,
    /\$\(/,
    /`[^`]+`/,
    /\|.*\|/,
    />\s*[\/\\]/,
    /<\s*[\/\\]/,
  ],
  description: 'Shell metacharacters detected',
  blockIP: true,
};

export const COMMAND_EXECUTION: WAFRule = {
  id: 'CMD_002',
  name: 'Command Injection - Common Commands',
  category: 'command_injection',
  severity: 'high',
  patterns: [
    /\b(cat|ls|dir|rm|del|format|echo|eval|exec|system|popen|passthru|shell_exec)\b/i,
    /\b(curl|wget|nc|netcat|nmap|sudo|su|w|who|whoami|uname|hostname|ifconfig|ip|ping)\b/i,
    /\b(chmod|chown|chgrp|touch|mkdir|rmdir|find|grep|awk|sed)\b/i,
  ],
  description: 'Potential command execution attempt',
  blockIP: true,
};

// ============================================================================
// LF/Header Injection Rules
// ============================================================================

export const LF_INJECTION: WAFRule = {
  id: 'LF_001',
  name: 'CRLF/Header Injection',
  category: 'lf_injection',
  severity: 'high',
  patterns: [
    /%0d%0a/i,
    /\r\n/i,
    /%0d/i,
    /%0a/i,
    /\\r\\n/i,
    /\\n\\r/i,
  ],
  description: 'Potential header injection (CRLF)',
  blockIP: true,
};

// ============================================================================
// SSRF Rules
// ============================================================================

export const SSRF_PRIVATE_IP: WAFRule = {
  id: 'SSRF_001',
  name: 'SSRF - Private IP Ranges',
  category: 'ssrf',
  severity: 'high',
  patterns: [
    /127\.\d+\.\d+\.\d+/i,
    /10\.\d+\.\d+\.\d+/i,
    /172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,
    /192\.168\.\d+\.\d+/i,
    /169\.254\.\d+\.\d+/i,
    /0\.\d+\.\d+\.\d+/i,
    /localhost/i,
  ],
  description: 'Private IP address in request',
  blockIP: false,
};

export const SSRF_CLOUD_METADATA: WAFRule = {
  id: 'SSRF_002',
  name: 'SSRF - Cloud Metadata',
  category: 'ssrf',
  severity: 'high',
  patterns: [
    /169\.254\.169\.254/i,
    /metadata\.google/i,
    /\.aws\.amazonaws\.com/i,
    /azure\.metadata\.ai/i,
    /\.digitalocean\.com/i,
    /\.linode\.com/i,
  ],
  description: 'Cloud metadata endpoint access attempt',
  blockIP: true,
};

// ============================================================================
// XML Injection Rules
// ============================================================================

export const XML_INJECTION: WAFRule = {
  id: 'XML_001',
  name: 'XML Injection',
  category: 'xml_injection',
  severity: 'medium',
  patterns: [
    /<!DOCTYPE/i,
    /<!ENTITY/i,
    /<\?xml/i,
    /SYSTEM\s+["']/i,
    /PUBLIC\s+["']/i,
    /<!\[CDATA\[/i,
    /<!ATTLIST/i,
  ],
  description: 'XML special characters or structure',
  blockIP: false,
};

// ============================================================================
// All Rules Collection
// ============================================================================

export const WAF_RULES: WAFRule[] = [
  // SQL Injection
  SQL_INJECTION_RULES,
  SQL_INJECTION_UNION,
  SQL_INJECTION_LOGIC,
  SQL_INJECTION_BLIND,
  SQL_INJECTION_FILE,
  
  // XSS
  XSS_SCRIPT,
  XSS_EVENT,
  XSS_JAVASCRIPT,
  XSS_OBJECT,
  XSS_ENCODED,
  
  // Path Traversal
  PATH_TRAVERSAL_UNIX,
  PATH_TRAVERSAL_WINDOWS,
  PATH_TRAVERSAL_FILES,
  
  // Command Injection
  COMMAND_SHELL,
  COMMAND_EXECUTION,
  
  // LF Injection
  LF_INJECTION,
  
  // SSRF
  SSRF_PRIVATE_IP,
  SSRF_CLOUD_METADATA,
  
  // XML Injection
  XML_INJECTION,
];

// ============================================================================
// Rule Categories
// ============================================================================

export const RULE_CATEGORIES = {
  sql_injection: {
    name: 'SQL Injection',
    rules: WAF_RULES.filter(r => r.category === 'sql_injection'),
    severity: 'critical',
  },
  xss: {
    name: 'Cross-Site Scripting (XSS)',
    rules: WAF_RULES.filter(r => r.category === 'xss'),
    severity: 'high',
  },
  path_traversal: {
    name: 'Path Traversal',
    rules: WAF_RULES.filter(r => r.category === 'path_traversal'),
    severity: 'high',
  },
  command_injection: {
    name: 'Command Injection',
    rules: WAF_RULES.filter(r => r.category === 'command_injection'),
    severity: 'critical',
  },
  lf_injection: {
    name: 'CRLF/Header Injection',
    rules: WAF_RULES.filter(r => r.category === 'lf_injection'),
    severity: 'high',
  },
  ssrf: {
    name: 'Server-Side Request Forgery',
    rules: WAF_RULES.filter(r => r.category === 'ssrf'),
    severity: 'high',
  },
  xml_injection: {
    name: 'XML Injection',
    rules: WAF_RULES.filter(r => r.category === 'xml_injection'),
    severity: 'medium',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Test a value against all rules
 */
export function testAgainstRules(
  value: string,
  rules: WAFRule[] = WAF_RULES
): WAFRule | null {
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      if (pattern.test(value)) {
        return rule;
      }
    }
  }
  return null;
}

/**
 * Test value against rules by category
 */
export function testAgainstCategory(
  value: string,
  category: WAFRule['category']
): WAFRule | null {
  const categoryRules = WAF_RULES.filter(r => r.category === category);
  return testAgainstRules(value, categoryRules);
}

/**
 * Test value against rules by severity
 */
export function testAgainstSeverity(
  value: string,
  severity: WAFRule['severity']
): WAFRule | null {
  const severityRules = WAF_RULES.filter(r => {
    const severities: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    return severities[r.severity] >= severities[severity];
  });
  return testAgainstRules(value, severityRules);
}

/**
 * Get all matching rules for a value
 */
export function getMatchingRules(
  value: string,
  options?: {
    minSeverity?: WAFRule['severity'];
    categories?: WAFRule['category'][];
  }
): WAFRule[] {
  let rules = [...WAF_RULES];

  if (options?.minSeverity) {
    const severities: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const minLevel = severities[options.minSeverity];
    rules = rules.filter(r => severities[r.severity] >= minLevel);
  }

  if (options?.categories) {
    rules = rules.filter(r => options.categories!.includes(r.category));
  }

  const matching: WAFRule[] = [];

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      if (pattern.test(value)) {
        matching.push(rule);
        break;
      }
    }
  }

  return matching;
}

/**
 * Get rule by ID
 */
export function getRuleById(id: string): WAFRule | undefined {
  return WAF_RULES.find(r => r.id === id);
}

/**
 * Get all rules for admin dashboard
 */
export function getAllRules(): {
  rules: WAFRule[];
  categories: typeof RULE_CATEGORIES;
  stats: {
    totalRules: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  };
} {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const rule of WAF_RULES) {
    byCategory[rule.category] = (byCategory[rule.category] || 0) + 1;
    bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
  }

  return {
    rules: WAF_RULES,
    categories: RULE_CATEGORIES,
    stats: {
      totalRules: WAF_RULES.length,
      byCategory,
      bySeverity,
    },
  };
}

export default {
  WAF_RULES,
  RULE_CATEGORIES,
  testAgainstRules,
  testAgainstCategory,
  testAgainstSeverity,
  getMatchingRules,
  getRuleById,
  getAllRules,
};
