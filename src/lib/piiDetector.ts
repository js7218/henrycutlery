/**
 * PII Leak Detector
 * Scans API responses and logs for potential PII leaks
 */

import { createHash, randomBytes } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface PIILeak {
  id: string;
  timestamp: string;
  type: PIIType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  matchedValue: string;
  fieldName?: string;
  requestId?: string;
  ip?: string;
  userId?: string;
  action: 'blocked' | 'logged' | 'sanitized';
}

export type PIIType = 
  | 'phone'
  | 'email'
  | 'idCard'
  | 'creditCard'
  | 'bankAccount'
  | 'password'
  | 'token'
  | 'ipAddress'
  | 'name'
  | 'address';

// ============================================================================
// PII Patterns
// ============================================================================

const PII_PATTERNS: Array<{
  type: PIIType;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}> = [
  // L1 - Critical
  {
    type: 'phone',
    pattern: /\b(1[3-9]\d{9})\b/g,
    severity: 'high',
    description: 'Chinese mobile phone number',
  },
  {
    type: 'email',
    pattern: /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g,
    severity: 'medium',
    description: 'Email address',
  },
  {
    type: 'idCard',
    pattern: /\b([1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx])\b/g,
    severity: 'critical',
    description: 'Chinese ID card number',
  },
  {
    type: 'creditCard',
    pattern: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,4})\b/g,
    severity: 'critical',
    description: 'Credit card number',
  },
  {
    type: 'bankAccount',
    pattern: /\b(\d{16,19})\b/g,
    severity: 'critical',
    description: 'Bank account number',
  },
  {
    type: 'password',
    pattern: /("password"\s*:\s*)"([^"]+)"/gi,
    severity: 'critical',
    description: 'Password in JSON',
  },
  {
    type: 'token',
    pattern: /("token"\s*:\s*)"([^"]+)"/gi,
    severity: 'high',
    description: 'Token in JSON',
  },
  
  // L2 - Sensitive
  {
    type: 'ipAddress',
    pattern: /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,
    severity: 'low',
    description: 'IP address',
  },
];

// Sensitive field names
const SENSITIVE_FIELD_NAMES: Array<{
  pattern: RegExp;
  type: PIIType;
  severity: 'low' | 'medium' | 'high' | 'critical';
}> = [
  { pattern: /password/i, type: 'password', severity: 'critical' },
  { pattern: /passwd/i, type: 'password', severity: 'critical' },
  { pattern: /pwd/i, type: 'password', severity: 'critical' },
  { pattern: /secret/i, type: 'token', severity: 'critical' },
  { pattern: /token/i, type: 'token', severity: 'high' },
  { pattern: /api[_-]?key/i, type: 'token', severity: 'critical' },
  { pattern: /credit[_-]?card/i, type: 'creditCard', severity: 'critical' },
  { pattern: /cvv/i, type: 'creditCard', severity: 'critical' },
  { pattern: /id[_-]?card/i, type: 'idCard', severity: 'critical' },
  { pattern: /ssn/i, type: 'idCard', severity: 'critical' },
  { pattern: /bank[_-]?account/i, type: 'bankAccount', severity: 'critical' },
  { pattern: /phone/i, type: 'phone', severity: 'high' },
  { pattern: /mobile/i, type: 'phone', severity: 'high' },
  { pattern: /email/i, type: 'email', severity: 'medium' },
  { pattern: /address/i, type: 'address', severity: 'medium' },
];

// ============================================================================
// Leak Storage
// ============================================================================

const leaks: PIILeak[] = [];
let leakIdCounter = 0;

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Generate leak ID
 */
function generateLeakId(): string {
  return `pii-${Date.now()}-${++leakIdCounter}`;
}

/**
 * Detect PII in a string value
 */
export function detectPIIInString(value: string): Array<{
  type: PIIType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  matchedValue: string;
  description: string;
}> {
  const results: Array<{
    type: PIIType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    matchedValue: string;
    description: string;
  }> = [];
  
  for (const { type, pattern, severity, description } of PII_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    
    let match;
    while ((match = pattern.exec(value)) !== null) {
      // Don't capture the full match, just a portion for logging
      const matchedValue = match[0].length > 20 
        ? match[0].substring(0, 10) + '...' + match[0].substring(match[0].length - 4)
        : match[0];
      
      results.push({
        type,
        severity,
        matchedValue,
        description,
      });
    }
  }
  
  return results;
}

/**
 * Detect PII in an object
 */
export function detectPIIInObject(
  obj: Record<string, unknown>,
  path: string = ''
): Array<{
  fieldName: string;
  path: string;
  pii: Array<{ type: PIIType; severity: 'low' | 'medium' | 'high' | 'critical'; matchedValue: string; description: string }>;
}> {
  const results: Array<{
    fieldName: string;
    path: string;
    pii: Array<{ type: PIIType; severity: 'low' | 'medium' | 'high' | 'critical'; matchedValue: string; description: string }>;
  }> = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    // Check field name first
    for (const { pattern, type, severity } of SENSITIVE_FIELD_NAMES) {
      if (pattern.test(key)) {
        // Field name itself is sensitive
        results.push({
          fieldName: key,
          path: currentPath,
          pii: [{
            type,
            severity,
            matchedValue: typeof value === 'string' ? '[VALUE]' : '[OBJECT]',
            description: `Sensitive field name: ${key}`,
          }],
        });
      }
    }
    
    // Check value
    if (typeof value === 'string') {
      const piiInValue = detectPIIInString(value);
      if (piiInValue.length > 0) {
        results.push({
          fieldName: key,
          path: currentPath,
          pii: piiInValue,
        });
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = detectPIIInObject(value as Record<string, unknown>, currentPath);
      results.push(...nested);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'string') {
          const piiInValue = detectPIIInString(value[i]);
          if (piiInValue.length > 0) {
            results.push({
              fieldName: `${key}[${i}]`,
              path: `${currentPath}[${i}]`,
              pii: piiInValue,
            });
          }
        }
      }
    }
  }
  
  return results;
}

/**
 * Scan API response for PII leaks
 */
export function scanAPIResponse(
  response: unknown,
  options: {
    location: string;
    requestId?: string;
    ip?: string;
    userId?: string;
    action?: 'blocked' | 'logged' | 'sanitized';
  }
): PIILeak[] {
  const detectedLeaks: PIILeak[] = [];
  
  if (typeof response !== 'object' || response === null) {
    // Check primitive values
    if (typeof response === 'string') {
      const pii = detectPIIInString(response);
      for (const item of pii) {
        const leak: PIILeak = {
          id: generateLeakId(),
          timestamp: new Date().toISOString(),
          type: item.type,
          severity: item.severity,
          location: options.location,
          matchedValue: item.matchedValue,
          requestId: options.requestId,
          ip: options.ip,
          userId: options.userId,
          action: options.action || 'logged',
        };
        detectedLeaks.push(leak);
        leaks.push(leak);
      }
    }
  } else {
    // Scan object
    const detections = detectPIIInObject(response as Record<string, unknown>);
    
    for (const detection of detections) {
      for (const pii of detection.pii) {
        const leak: PIILeak = {
          id: generateLeakId(),
          timestamp: new Date().toISOString(),
          type: pii.type,
          severity: pii.severity,
          location: `${options.location}:${detection.path}`,
          matchedValue: pii.matchedValue,
          fieldName: detection.fieldName,
          requestId: options.requestId,
          ip: options.ip,
          userId: options.userId,
          action: options.action || 'logged',
        };
        detectedLeaks.push(leak);
        leaks.push(leak);
      }
    }
  }
  
  // Log critical leaks
  for (const leak of detectedLeaks) {
    if (leak.severity === 'critical') {
      console.error('[PII LEAK DETECTED]', JSON.stringify(leak));
    }
  }
  
  // Keep only last 1000
  while (leaks.length > 1000) {
    leaks.shift();
  }
  
  return detectedLeaks;
}

/**
 * Scan log entry for PII
 */
export function scanLogEntry(message: string, context?: Record<string, unknown>): PIILeak[] {
  const detectedLeaks: PIILeak[] = [];
  
  // Scan message
  const piiInMessage = detectPIIInString(message);
  for (const pii of piiInMessage) {
    const leak: PIILeak = {
      id: generateLeakId(),
      timestamp: new Date().toISOString(),
      type: pii.type,
      severity: pii.severity,
      location: 'log.message',
      matchedValue: pii.matchedValue,
      action: 'sanitized',
    };
    detectedLeaks.push(leak);
  }
  
  // Scan context
  if (context) {
    const detections = detectPIIInObject(context);
    for (const detection of detections) {
      for (const pii of detection.pii) {
        const leak: PIILeak = {
          id: generateLeakId(),
          timestamp: new Date().toISOString(),
          type: pii.type,
          severity: pii.severity,
          location: `log.context.${detection.path}`,
          matchedValue: pii.matchedValue,
          fieldName: detection.fieldName,
          action: 'sanitized',
        };
        detectedLeaks.push(leak);
      }
    }
  }
  
  return detectedLeaks;
}

/**
 * Check if response contains specific PII type
 */
export function containsPIIType(response: unknown, type: PIIType): boolean {
  if (typeof response === 'string') {
    const pattern = PII_PATTERNS.find(p => p.type === type);
    if (pattern) {
      pattern.pattern.lastIndex = 0;
      return pattern.pattern.test(response);
    }
  } else if (typeof response === 'object' && response !== null) {
    const detections = detectPIIInObject(response as Record<string, unknown>);
    return detections.some(d => d.pii.some(p => p.type === type));
  }
  return false;
}

// ============================================================================
// Leak Queries
// ============================================================================

/**
 * Get all detected leaks
 */
export function getLeaks(options?: {
  type?: PIIType;
  severity?: PIILeak['severity'];
  since?: number;
  limit?: number;
}): PIILeak[] {
  let filtered = [...leaks];
  
  if (options?.type) {
    filtered = filtered.filter(l => l.type === options.type);
  }
  if (options?.severity) {
    filtered = filtered.filter(l => l.severity === options.severity);
  }
  if (options?.since) {
    filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= options.since!);
  }
  
  return filtered.slice(-(options?.limit || 100));
}

/**
 * Get leak statistics
 */
export function getLeakStats(): {
  total: number;
  byType: Record<PIIType, number>;
  bySeverity: Record<PIILeak['severity'], number>;
  recentTrend: Array<{ hour: string; count: number }>;
} {
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const hourCounts: Record<string, number> = {};
  
  for (const leak of leaks) {
    byType[leak.type] = (byType[leak.type] || 0) + 1;
    bySeverity[leak.severity] = (bySeverity[leak.severity] || 0) + 1;
    
    const hour = leak.timestamp.substring(0, 13); // YYYY-MM-DDTHH
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }
  
  const recentTrend = Object.entries(hourCounts)
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour))
    .slice(-24); // Last 24 hours
  
  return {
    total: leaks.length,
    byType: byType as Record<PIIType, number>,
    bySeverity: bySeverity as Record<PIILeak['severity'], number>,
    recentTrend,
  };
}

/**
 * Clear old leaks
 */
export function clearOldLeaks(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  const before = leaks.length;
  
  const filtered = leaks.filter(l => new Date(l.timestamp).getTime() >= cutoff);
  leaks.length = 0;
  leaks.push(...filtered);
  
  return before - leaks.length;
}

// ============================================================================
// PII Redaction
// ============================================================================

/**
 * Redact PII from a string
 */
export function redactPII(value: string, type?: PIIType): string {
  if (type) {
    const pattern = PII_PATTERNS.find(p => p.type === type);
    if (pattern) {
      const replacements: Record<PIIType, string> = {
        phone: '[PHONE]',
        email: '[EMAIL]',
        idCard: '[ID_CARD]',
        creditCard: '[CARD]',
        bankAccount: '[BANK_ACCOUNT]',
        password: '[PASSWORD]',
        token: '[TOKEN]',
        ipAddress: '[IP]',
        name: '[NAME]',
        address: '[ADDRESS]',
      };
      return value.replace(pattern.pattern, replacements[type] || '[REDACTED]');
    }
  }
  
  // Redact all PII types
  let result = value;
  for (const { type, pattern } of PII_PATTERNS) {
    const replacements: Record<PIIType, string> = {
      phone: '[PHONE]',
      email: '[EMAIL]',
      idCard: '[ID_CARD]',
      creditCard: '[CARD]',
      bankAccount: '[BANK_ACCOUNT]',
      password: '[PASSWORD]',
      token: '[TOKEN]',
      ipAddress: '[IP]',
      name: '[NAME]',
      address: '[ADDRESS]',
    };
    result = result.replace(pattern, replacements[type] || '[REDACTED]');
  }
  
  return result;
}

/**
 * Redact PII from an object
 */
export function redactPIIFromObject<T extends Record<string, unknown>>(obj: T): T {
  const redacted: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Check if field name is sensitive
    const isSensitiveField = SENSITIVE_FIELD_NAMES.some(({ pattern }) => pattern.test(key));
    
    if (isSensitiveField) {
      redacted[key] = '[REDACTED]';
      continue;
    }
    
    if (value === null || value === undefined) {
      redacted[key] = value;
    } else if (typeof value === 'string') {
      redacted[key] = redactPII(value);
    } else if (typeof value === 'number') {
      // Check if number looks like sensitive data
      const str = String(value);
      if (/^1[3-9]\d{9}$/.test(str) || (str.length >= 13 && /^\d+$/.test(str))) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = value;
      }
    } else if (Array.isArray(value)) {
      redacted[key] = value.map(item => 
        typeof item === 'object' 
          ? redactPIIFromObject(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === 'object') {
      redacted[key] = redactPIIFromObject(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted as T;
}

// ============================================================================
// Exports
// ============================================================================

export const piiDetector = {
  detectPIIInString,
  detectPIIInObject,
  scanAPIResponse,
  scanLogEntry,
  containsPIIType,
  getLeaks,
  getLeakStats,
  clearOldLeaks,
  redactPII,
  redactPIIFromObject,
  PII_PATTERNS,
  SENSITIVE_FIELD_NAMES,
};

export default piiDetector;
