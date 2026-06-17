/**
 * Web Application Firewall (WAF) Middleware
 * Combined with Path Protection - Edge Runtime compatible (no fs/path)
 */

import { NextRequest, NextResponse } from 'next/server';

// --- Rate Limiting (in-memory, per-instance) ---
const requestCounts: Record<string, { count: number; resetAt: number }> = {};
const blockedIPs: Record<string, { expiresAt: number; reason: string }> = {};

// --- Blocked patterns ---
const BLOCKED_PATTERNS = [
  /\.env$/, /\.git/, /\.htaccess/, /wp-admin/, /wp-login/,
  /\.bak$/, /\.backup$/, /\.sql$/, /\.log$/,
];

const HONEYPOT_PATHS = [
  '/api/admin', '/api/phpmyadmin', '/api/database',
  '/.env', '/.git/config', '/wp-login.php',
  '/xmlrpc.php', '/api/debug', '/api/.git',
];

const BLOCKED_UAS = [
  /sqlmap/i, /nikto/i, /nmap/i, /dirbuster/i, /gobuster/i,
  /wfuzz/i, /hydra/i, /burp/i, /metasploit/i, /masscan/i,
  /zmap/i, /wpscan/i, /acunetix/i, /netsparker/i,
];

const SQL_PATTERNS = [
  /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i,
  /\b(UNION|EXEC|EXECUTE)\b/i,
  /union\s+select/i, /into\s+(out|dump)file/i,
  /\b(sleep|benchmark)\s*\(/i,
];

const XSS_PATTERNS = [
  /<script/i, /<\/script/i, /<img[^>]+onerror/i,
  /javascript\s*:/i, /on\w+\s*=/i,
  /<iframe/i, /<embed/i, /<object/i,
];

const PATH_PATTERNS = [/\.\./i, /%2e%2e/i, /\/etc\/passwd/i, /\/etc\/shadow/i];

// Protected paths (return 404)
const PROTECTED_PATHS = [
  '/.env', '/.env.local', '/.env.development', '/.env.production',
  '/.git', '/SECURITY.md', '/package.json', '/package-lock.json',
  '/tsconfig.json', '/next.config.mjs',
];

const PROTECTED_FILE_PATTERNS = [
  /^\//,  // dot files
  /\.log$/, /\.bak$/, /\.sql$/, /\.sqlite$/, /\.pem$/, /\.key$/,
];

// --- Helper functions ---
function getClientIP(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

function isBlockedPath(path: string): boolean {
  const p = path.toLowerCase();
  return BLOCKED_PATTERNS.some(pat => pat.test(p));
}

function isHoneypotPath(path: string): boolean {
  const p = path.toLowerCase();
  return HONEYPOT_PATHS.some(hp => p.includes(hp.toLowerCase()));
}

function isBlockedUA(ua: string): boolean {
  if (!ua) return true;
  return BLOCKED_UAS.some(pat => pat.test(ua));
}

function detectSQL(value: string): boolean {
  return SQL_PATTERNS.some(p => p.test(value));
}

function detectXSS(value: string): boolean {
  return XSS_PATTERNS.some(p => p.test(value));
}

function detectPath(value: string): boolean {
  return PATH_PATTERNS.some(p => p.test(value));
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const WINDOW = 60000;
  const MAX = 100;

  if (!requestCounts[ip] || now > requestCounts[ip].resetAt) {
    requestCounts[ip] = { count: 0, resetAt: now + WINDOW };
  }

  requestCounts[ip].count++;
  return { allowed: requestCounts[ip].count <= MAX, remaining: Math.max(0, MAX - requestCounts[ip].count) };
}

function blockIP(ip: string, reason: string, durationMs = 1800000): void {
  blockedIPs[ip] = { expiresAt: Date.now() + durationMs, reason };
}

function isIPBlocked(ip: string): boolean {
  const block = blockedIPs[ip];
  if (!block) return false;
  if (block.expiresAt <= Date.now()) { delete blockedIPs[ip]; return false; }
  return true;
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('X-Download-Options', 'noopen');
  response.headers.set('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https: blob:; connect-src 'self'; frame-src 'none'; object-src 'none';"
  );
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');
  return response;
}

// --- Main middleware ---
export function middleware(request: NextRequest) {
  const ip = getClientIP(request);
  const path = request.nextUrl.pathname;

  // Skip static assets
  if (
    path.startsWith('/_next/static') ||
    path.startsWith('/_next/image') ||
    path.startsWith('/favicon') ||
    path.includes('.')
  ) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Path protection - return 404 for sensitive files
  if (PROTECTED_PATHS.some(p => path.toLowerCase() === p.toLowerCase())) {
    return new NextResponse('Not Found', { status: 404 });
  }
  if (PROTECTED_FILE_PATTERNS.some(pat => pat.test(path))) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // IP blocking check
  if (isIPBlocked(ip)) {
    return NextResponse.json({ error: 'Forbidden', code: 'IP_BLOCKED' }, { status: 403 });
  }

  // Rate limiting
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    blockIP(ip, 'Rate limit exceeded', 300000);
    return NextResponse.json(
      { error: 'Too Many Requests', code: 'RATE_LIMITED', retryAfter: 60 },
      { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } }
    );
  }

  // WAF analysis
  const query = request.nextUrl.search;
  const ua = request.headers.get('user-agent') || '';

  if (isBlockedPath(path) || isHoneypotPath(path)) {
    blockIP(ip, 'Blocked path', 1800000);
    return NextResponse.json({ error: 'Forbidden', code: 'BLOCKED' }, { status: 403 });
  }

  if (isBlockedUA(ua)) {
    blockIP(ip, 'Malicious UA', 1800000);
    return NextResponse.json({ error: 'Forbidden', code: 'BLOCKED' }, { status: 403 });
  }

  if (query) {
    if (detectSQL(query)) {
      blockIP(ip, 'SQL injection', 3600000);
      return NextResponse.json({ error: 'Forbidden', code: 'BLOCKED' }, { status: 403 });
    }
    if (detectXSS(query)) {
      blockIP(ip, 'XSS attempt', 3600000);
      return NextResponse.json({ error: 'Forbidden', code: 'BLOCKED' }, { status: 403 });
    }
    if (detectPath(query)) {
      blockIP(ip, 'Path traversal', 3600000);
      return NextResponse.json({ error: 'Forbidden', code: 'BLOCKED' }, { status: 403 });
    }
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(rl.remaining));
  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
