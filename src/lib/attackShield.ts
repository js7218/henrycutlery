/**
 * Attack Shield - Anti Brute Force & IP Banning System
 */

import { NextRequest } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

// Types
export interface BanEntry {
  ip: string;
  reason: BanReason;
  expiresAt: number;
  bannedAt: number;
  severity: 'warning' | 'lockout' | 'blocked';
  details?: Record<string, unknown>;
}

export type BanReason =
  | 'LOGIN_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'WEAK_PASSWORD'
  | 'ACCOUNT_STUFFING'
  | 'SUSPICIOUS_HEADERS'
  | 'HONEYPOT_TRIGGERED'
  | 'SCANNING_DETECTED'
  | 'MALICIOUS_REQUEST'
  | 'MANUAL_BAN';

// Configuration
const BAN_STORAGE_FILE = process.env.BAN_STORAGE_FILE || './data/bans.json';
const LOG_DIR = process.env.LOG_DIR || './logs';

const BAN_EXPIRY = {
  first: 30 * 60 * 1000,
  second: 2 * 60 * 60 * 1000,
  third: 24 * 60 * 60 * 1000,
  fourth: 7 * 24 * 60 * 60 * 1000,
};

const ATTACK_UA_PATTERNS = [
  /sqlmap/i, /nikto/i, /nmap/i, /dirbuster/i, /gobuster/i,
  /wfuzz/i, /hydra/i, /burp/i, /metasploit/i, /masscan/i,
  /zmap/i, /wpscan/i, /acunetix/i, /netsparker/i,
];

const WEAK_PASSWORDS = new Set([
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234', '111111',
  '1234567', 'dragon', '123123', 'baseball', 'iloveyou', 'trustno1', 'sunshine', 'princess',
  'admin', 'welcome', 'shadow', 'ashley', 'football', 'jesus', 'michael', 'ninja',
]);

const HONEYPOT_PATHS = [
  '/api/admin', '/api/phpmyadmin', '/api/database', '/api/config',
  '/.env', '/.git/config', '/wp-login.php', '/xmlrpc.php',
];

// Storage - using objects instead of Map for better compatibility
const bans: Record<string, BanEntry> = {};

function ensureDataDir(): void {
  const dir = './data';
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function loadBans(): void {
  try {
    ensureDataDir();
    if (existsSync(BAN_STORAGE_FILE)) {
      const data = JSON.parse(readFileSync(BAN_STORAGE_FILE, 'utf8'));
      const now = Date.now();
      for (const ip of Object.keys(data)) {
        const ban = data[ip] as BanEntry;
        if (ban.expiresAt > now) bans[ip] = ban;
      }
    }
  } catch { /* ignore */ }
}

function saveBans(): void {
  try {
    ensureDataDir();
    writeFileSync(BAN_STORAGE_FILE, JSON.stringify(bans, null, 2));
  } catch { /* ignore */ }
}

loadBans();

setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(bans)) {
    if (bans[ip].expiresAt <= now) delete bans[ip];
  }
  saveBans();
}, 60000);

export function getClientIP(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export function isIPBanned(ip: string): BanEntry | null {
  const ban = bans[ip];
  if (!ban) return null;
  if (ban.expiresAt <= Date.now()) { delete bans[ip]; return null; }
  return ban;
}

export function banIP(ip: string, reason: BanReason, details?: Record<string, unknown>): void {
  const now = Date.now();
  bans[ip] = {
    ip,
    reason,
    expiresAt: now + BAN_EXPIRY.first,
    bannedAt: now,
    severity: 'warning',
    details,
  };
  saveBans();
  console.error(`[ATTACK SHIELD] IP banned: ${ip} - ${reason}`);
}

export function unbanIP(ip: string): boolean {
  if (bans[ip]) {
    delete bans[ip];
    saveBans();
    return true;
  }
  return false;
}

export function detectMaliciousUA(ua: string): boolean {
  if (!ua) return true;
  return ATTACK_UA_PATTERNS.some(p => p.test(ua));
}

export function isWeakPassword(password: string): boolean {
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return true;
  return false;
}

export function isHoneypotPath(path: string): boolean {
  const p = path.toLowerCase();
  return HONEYPOT_PATHS.some(hp => p.includes(hp.toLowerCase()));
}

export function detectSQLInjection(value: string): boolean {
  if (typeof value !== 'string') return false;
  const patterns = [
    /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i,
    /\b(UNION|EXEC|EXECUTE)\b/i,
    /union\s+select/i,
  ];
  return patterns.some(p => p.test(value));
}

export function detectXSS(value: string): boolean {
  if (typeof value !== 'string') return false;
  const patterns = [/<script/i, /<\/script/i, /javascript\s*:/i, /on\w+\s*=/i];
  return patterns.some(p => p.test(value));
}

export function detectPathTraversal(value: string): boolean {
  if (typeof value !== 'string') return false;
  return /\.\./.test(value);
}

export function getActiveBans(): BanEntry[] {
  const now = Date.now();
  const active: BanEntry[] = [];
  for (const ip of Object.keys(bans)) {
    if (bans[ip].expiresAt > now) active.push(bans[ip]);
    else delete bans[ip];
  }
  return active;
}

export const attackShield = {
  getClientIP,
  isIPBanned,
  banIP,
  unbanIP,
  detectMaliciousUA,
  isWeakPassword,
  isHoneypotPath,
  detectSQLInjection,
  detectXSS,
  detectPathTraversal,
  getActiveBans,
};

export default attackShield;
