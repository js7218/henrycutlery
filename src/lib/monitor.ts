/**
 * Security Monitor - Simplified version
 */

import { NextRequest } from 'next/server';

// PII Detection
export function containsPII(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const patterns = [
    /\b(1[3-9]\d{9})\b/,  // Phone
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
  ];
  return patterns.some(p => p.test(value));
}

// Logging
const securityLogs: Array<{
  id: string;
  timestamp: string;
  type: string;
  severity: string;
  ip: string;
  details: Record<string, unknown>;
}> = [];

let logId = 0;

export function logSecurityEvent(entry: {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip: string;
  userId?: string;
  path?: string;
  details: Record<string, unknown>;
}): string {
  const id = `sec-${Date.now()}-${++logId}`;
  securityLogs.push({
    ...entry,
    id,
    timestamp: new Date().toISOString(),
  });
  if (securityLogs.length > 1000) securityLogs.shift();
  console.error('[SECURITY]', JSON.stringify(entry));
  return id;
}

export function getSecurityLogs(): typeof securityLogs {
  return [...securityLogs];
}

// Request analysis
export function scanRequest(request: NextRequest): {
  hasAttack: boolean;
  attackTypes: string[];
} {
  const url = request.url;
  const patterns = [
    { pattern: /<script|union\s+select|or\s+1\s*=\s*1/i, type: 'SQL_INJECTION' },
    { pattern: /javascript:|on\w+\s*=/i, type: 'XSS' },
    { pattern: /\.\.\//i, type: 'PATH_TRAVERSAL' },
  ];
  
  const attackTypes: string[] = [];
  for (const { pattern, type } of patterns) {
    if (pattern.test(url)) attackTypes.push(type);
  }
  
  return { hasAttack: attackTypes.length > 0, attackTypes };
}

export function getClientIP(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export const monitor = {
  containsPII,
  logSecurityEvent,
  getSecurityLogs,
  scanRequest,
  getClientIP,
};

export default monitor;
