/**
 * Sanitized Logger
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const LOG_DIR = process.env.LOG_DIR || './logs';

// PII patterns
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(1[3-9]\d{9})\b/g, replacement: '[PHONE]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
];

function sanitizeString(input: string): string {
  let result = input;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function writeLog(level: string, message: string, context?: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: sanitizeString(message),
    context: context ? sanitizeObject(context) : undefined,
  };
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${level}]`, message, context || '');
  }
  
  try {
    ensureLogDir();
    const filename = join(LOG_DIR, `${level.toLowerCase()}-${new Date().toISOString().split('T')[0]}.jsonl`);
    appendFileSync(filename, JSON.stringify(entry) + '\n');
  } catch {}
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'cvv'];
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.some(f => key.toLowerCase().includes(f))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export function debug(message: string, context?: Record<string, unknown>): void {
  writeLog('DEBUG', message, context);
}

export function info(message: string, context?: Record<string, unknown>): void {
  writeLog('INFO', message, context);
}

export function warn(message: string, context?: Record<string, unknown>): void {
  writeLog('WARN', message, context);
}

export function error(message: string, context?: Record<string, unknown>): void {
  writeLog('ERROR', message, context);
}

export function security(message: string, context?: Record<string, unknown>): void {
  writeLog('SECURITY', message, context);
}

export function logSecurityEvent(entry: Record<string, unknown>): void {
  writeLog('SECURITY', 'Security event', entry);
}

export const logger = { debug, info, warn, error, security, logSecurityEvent };
export default logger;
