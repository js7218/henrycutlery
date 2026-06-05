/**
 * Enhanced Security Middleware with Comprehensive WAF Protection
 * Integrated with all security modules for Edge Runtime
 * 
 * Security Features:
 * - WebShell/RCE Detection
 * - Command Injection Detection
 * - SQL Injection Detection (Enhanced)
 * - XSS Detection
 * - Path Traversal Detection (with encoding variants)
 * - SSRF Detection
 * - Brute Force Protection
 * - Rate Limiting (Tiered)
 * - Malicious File Upload Detection
 * - Honeypot Path Protection
 * - Security Headers Enhancement
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Rate Limiting Store (Edge Compatible)
// ============================================================================
interface RateLimitEntry {
  count: number;
  resetAt: number;
  blockedUntil: number | null;
}

interface BruteForceEntry {
  failures: number;
  firstFailure: number;
  blockedUntil: number | null;
}

// In-memory stores (use KV store in production like Vercel/Cloudflare)
const requestCounts: Record<string, RateLimitEntry> = {};
const blockedIPs: Record<string, { expiresAt: number; reason: string }> = {};
const bruteForceStore: Record<string, BruteForceEntry> = {};

// Rate limit configurations (tiered)
const RATE_LIMITS = {
  global: { windowMs: 10000, maxRequests: 500 },
  api: { windowMs: 10000, maxRequests: 100 },
  login: { windowMs: 60000, maxRequests: 5 },
  admin: { windowMs: 60000, maxRequests: 30 },
  checkout: { windowMs: 60000, maxRequests: 10 }
};

// Brute force protection thresholds
const BRUTE_FORCE = {
  failures5Block: 3 * 60 * 60 * 1000,    // 5 failures → block 3 hours
  failures10Block: 24 * 60 * 60 * 1000, // 10 failures → block 24 hours
  failures20Block: 7 * 24 * 60 * 60 * 1000 // 20 failures → block 7 days
};

// ============================================================================
// Enhanced Security Patterns
// ============================================================================

// WebShell/RCE patterns -一句话木马检测
const WEBSHELL_PATTERNS = [
  /eval\s*\(/i, /base64_decode\s*\(/i, /system\s*\(/i,
  /exec\s*\(/i, /passthru\s*\(/i, /shell_exec\s*\(/i,
  /assert\s*\(/i, /proc_open\s*\(/i, /popen\s*\(/i,
  /call_user_func\s*\(/i, /create_function\s*\(/i,
  /preg_replace\s*\(.*\/e/i, /ob_start\s*\(/i,
  /include\s*\(/i, /require\s*\(/i, /passthru\s*\(/i
];

// Malicious file upload extensions - WebShell上传检测
const MALICIOUS_EXTENSIONS = [
  /\.php\d*/i, /\.php3/i, /\.php4/i, /\.php5/i,
  /\.phtml/i, /\.phar/i, /\.phpt/i,
  /\.jspx?/i, /\.jspf/i,
  /\.asp/i, /\.aspx/i, /\.cer/i, /\.cgi/i,
  /\.pl/i, /\.py/i, /\.rb/i, /\.sh/i, /\.bash/i,
  /\.hta/i, /\.htaccess/i, /\.htpasswd/i,
  /\.exe/i, /\.bat/i, /\.cmd/i, /\.msi/i,
  /\.jar/i, /\.war/i, /\.pif/i, /\.vbs/i
];

// Command injection patterns - 命令注入增强
const CMD_INJECTION_PATTERNS = [
  /[;&|`$]\s*(whoami|ls|cat|echo|wget|curl|nc|bash|sh|cmd|powershell)\b/i,
  /\|\s*\w+/i, /&&\s*\w+/i, /\|\|\s*\w+/i,
  /\$?\(\s*\w+/i, /`\w+`/i, /\$+\{?\w+\}?/i,
  /\.\/[\w.]+/i, /\.\.\/[\w.]+/i,
  /\|\s*$/i, /;\s*$/i, /&\s*$/i
];

// Malicious redirect patterns - 恶意跳转
const REDIRECT_PATTERNS = [
  /javascript\s*:/i, /vbscript\s*:/i, /data\s*:/i,
  /mhtml\s*:/i, /livescript\s*:/i,
  /<meta[^>]*http-equiv[^>]*content[^>]*url/i,
  /<meta[^>]*refresh[^>]*content[^>]*url/i
];

// Path traversal patterns with encoding variants - 路径穿越编码变体
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//i, /\.\.\.\//i, /\.\.\.\.\//i,
  /%2e%2e/i, /%252e%252e/i, /%2e%2e%2f/i, /%2e%2e%5c/i,
  /\.\.%2f/i, /\.\.%5c/i,
  /\.\.%252f/i, /\.\.%255c/i,
  /\\+\.\.\\/i, /\.\.\/\\\./i,
  /%c0%ae%c0%ae/i, /%c1%9c/i, /%c1%1c/i
];

// SSRF patterns - SSRF检测
const SSRF_PATTERNS = [
  /127\.\d+\.\d+\.\d+/i, /10\.\d+\.\d+\.\d+/i,
  /172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,
  /192\.168\.\d+\.\d+/i, /169\.254\.\d+\.\d+/i,
  /localhost/i, /\[::1\]/i, /\:1\b/i,
  /0x7f/i, /0\.0\.0\.0/i, /255\.255\.255\.255/i,
  /metadata\.google/i, /metadata\.internal/i
];

// Sensitive file patterns - 敏感文件
const SENSITIVE_PATTERNS = [
  /\.env$/i, /\.env\.\w+/i, /\.git\/config/i, /\.git\/HEAD/i,
  /wp-admin/i, /wp-login/i, /wp-config/i,
  /phpmyadmin/i, /phpMyAdmin/i, /mysql/i,
  /\.htaccess/i, /\.htpasswd/i,
  /docker-compose\.yml/i, /docker-compose\.yaml/i,
  /Dockerfile/i, /\.dockerignore/i,
  /package\.json/i, /package-lock\.json/i,
  /tsconfig\.json/i, /next\.config/i,
  /\.log$/i, /access\.log/i, /error\.log/i, /debug\.log/i,
  /\/logs\//i, /\/log\//i, /\/var\/log\//i,
  /\.sqlite$/i, /\.db$/i, /\.bak$/i, /\.backup$/i,
  /\.pem$/i, /\.key$/i, /\.crt$/i, /\.cert$/i,
  /\/config\//i, /\/settings\//i, /\/secrets\//i
];

// SQL injection patterns (enhanced) - SQL注入增强
const SQL_PATTERNS = [
  // Basic SQL keywords
  /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE)\b/i,
  /\b(UNION|UNION\s+ALL|WAITFOR)\b/i,
  /union\s+select/i, /into\s+(out|dump)file/i,
  // SQL functions
  /\b(sleep|benchmark|waitfor)\s*\(/i,
  /\bconcat\s*\(/i, /\bsubstring\s*\(/i, /\bsubstr\s*\(/i,
  /\bchar\s*\(/i, /\bhex\s*\(/i, /\bunhex\s*\(/i,
  /\blength\s*\(/i, /\bcount\s*\(/i,
  /\bextractvalue\s*\(/i, /\bupdatexml\s*\(/i,
  /\bfloor\s*\(/i, /\brand\s*\(/i,
  // System tables
  /information_schema/i, /information_schema\.tables/i,
  /information_schema\.columns/i, /information_schema\.schemata/i,
  /sys\.databases/i, /sys\.objects/i, /sys\.tables/i,
  /mysql\.user/i, /pg_catalog/i,
  // Boolean injection
  /'\s*(or|and)\s+'[^']*'='[^']*'/i,
  /"\s*(or|and)\s+"[^"]*"="[^"]*"/i,
  /or\s+1\s*=\s*1/i, /and\s+1\s*=\s*1/i,
  /or\s+true/i, /and\s+false/i,
  // Hex and char encoding
  /0x[0-9a-f]+/i, /char\s*\(\d+(,\s*\d+)*\)/i,
  // Stacked queries
  /;\s*(select|insert|update|delete|drop)/i,
  /having\s+\d+\s*[=<>]+\s*\d+/i, /group\s+by.+\s+having/i
];

// XSS patterns
const XSS_PATTERNS = [
  /<script/i, /<\/script/i, /<script[^>]*>/i,
  /<img[^\>]+onerror/i, /<img[^\>]+onsrc/i,
  /<iframe/i, /<\/iframe/i, /<embed/i, /<object/i,
  /<applet/i, /<svg/i, /<math/i, /<base/i, /<link/i,
  /on\w+\s*=/i, /\son\w+\s*=/i,
  /javascript\s*:/i, /vbscript\s*:/i, /data\s*:/i,
  /<meta[^>]*http-equiv[^>]*refresh/i,
  /expression\s*\(/i, /url\s*\(\s*["']?\s*javascript:/i,
  /<body[^>]*onload/i, /<input[^>]*autofocus/i,
  // SVG-based XSS
  /<svg[^>]*onload/i, /<svg[^>]*onerror/i,
  // Event handlers
  /\bonmouseover\s*=/i, /\bonfocus\s*=/i, /\bonblur\s*=/i,
  /\bonclick\s*=/i, /\bonload\s*=/i, /\bonerror\s*=/i
];

// Honeypot paths
const HONEYPOT_PATHS = [
  '/api/admin', '/api/phpmyadmin', '/api/database', '/api/debug',
  '/.env', '/.git/config', '/wp-login.php', '/xmlrpc.php',
  '/.env.local', '/.env.production', '/config.php', '/setup.php',
  '/admin.php', '/administrator', '/phpmyadmin', '/mysql',
  '/console', '/terminal', '/shell', '/cmd', '/dbadmin',
  '/status', '/health', '/info', '/.git/HEAD', '/.git/logs/',
  '/web.config', '/.well-known/security.txt'
];

// Blocked User Agents (Enhanced) - 反爬虫User-Agent增强
const BLOCKED_UAS = [
  /sqlmap/i, /nikto/i, /nmap/i, /dirbuster/i, /gobuster/i,
  /wfuzz/i, /hydra/i, /burp/i, /metasploit/i, /masscan/i,
  /zmap/i, /wpscan/i, /acunetix/i, /netsparker/i, /appscan/i,
  /havij/i, /pangolin/i, /bgpstream/i, /netcraft/i,
  /+python-requests/i, /go-http-client/i, /axios/i,
  /+curl/i, /+wget/i, /scrapy/i, /masspull/i,
  /libwww-perl/i, /httpx/i, / nuclei/i,
  /dot.net|dotnet/i, /java\//i, /okhttp/i,
  /httpie/i, /aiohttp/i, /urllib/i, /php-curl/i,
  /^python/i, /^go\//i, /^java\//i
];

// HTTP methods allowed
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

// ============================================================================
// Helper Functions
// ============================================================================

function getClientIP(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;
  return 'unknown';
}

function checkRateLimit(ip: string, limitType: keyof typeof RATE_LIMITS): 
  { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const config = RATE_LIMITS[limitType];
  const key = `${limitType}:${ip}`;
  
  if (!requestCounts[key] || now > requestCounts[key].resetAt) {
    requestCounts[key] = { count: 0, resetAt: now + config.windowMs, blockedUntil: null };
  }
  
  requestCounts[key].count++;
  const remaining = Math.max(0, config.maxRequests - requestCounts[key].count);
  
  return { 
    allowed: requestCounts[key].count <= config.maxRequests, 
    remaining, 
    resetAt: requestCounts[key].resetAt 
  };
}

function blockIP(ip: string, reason: string, durationMs: number): void {
  blockedIPs[ip] = { expiresAt: Date.now() + durationMs, reason };
}

function isIPBlocked(ip: string): boolean {
  const block = blockedIPs[ip];
  if (!block) return false;
  if (block.expiresAt <= Date.now()) {
    delete blockedIPs[ip];
    return false;
  }
  return true;
}

function checkBruteForce(ip: string, isLoginAttempt: boolean): {
  blocked: boolean;
  blockDuration: number;
  reason: string;
} {
  const now = Date.now();
  const entry = bruteForceStore[ip];
  
  if (!isLoginAttempt) {
    // Clear brute force on non-login attempts
    if (entry && entry.blockedUntil && entry.blockedUntil <= now) {
      delete bruteForceStore[ip];
    }
    return { blocked: false, blockDuration: 0, reason: '' };
  }
  
  if (!entry) {
    bruteForceStore[ip] = { failures: 1, firstFailure: now, blockedUntil: null };
    return { blocked: false, blockDuration: 0, reason: '' };
  }
  
  // Check if already blocked
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { blocked: true, blockDuration: entry.blockedUntil - now, reason: 'BRUTE_FORCE_BLOCKED' };
  }
  
  entry.failures++;
  
  // Apply blocking based on failure count
  let blockDuration = 0;
  if (entry.failures >= 20) {
    blockDuration = BRUTE_FORCE.failures20Block;
    entry.blockedUntil = now + BRUTE_FORCE.failures20Block;
  } else if (entry.failures >= 10) {
    blockDuration = BRUTE_FORCE.failures10Block;
    entry.blockedUntil = now + BRUTE_FORCE.failures10Block;
  } else if (entry.failures >= 5) {
    blockDuration = BRUTE_FORCE.failures5Block;
    entry.blockedUntil = now + BRUTE_FORCE.failures5Block;
  }
  
  bruteForceStore[ip] = entry;
  
  return { 
    blocked: blockDuration > 0, 
    blockDuration,
    reason: blockDuration > 0 ? 'BRUTE_FORCE_DETECTED' : '' 
  };
}

function resetBruteForce(ip: string): void {
  delete bruteForceStore[ip];
}

function detectThreat(value: string): { detected: boolean; type: string; pattern?: string } {
  // Check webshell patterns
  for (const pattern of WEBSHELL_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, type: 'WEBSHELL_DETECTED', pattern: pattern.source };
    }
  }
  
  // Check malicious extensions
  for (const pattern of MALICIOUS_EXTENSIONS) {
    if (pattern.test(value)) {
      return { detected: true, type: 'MALICIOUS_FILE_UPLOAD', pattern: pattern.source };
    }
  }
  
  // Check command injection
  for (const pattern of CMD_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, type: 'CMD_INJECTION', pattern: pattern.source };
    }
  }
  
  // Check SSRF
  for (const pattern of SSRF_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, type: 'SSRF_DETECTED', pattern: pattern.source };
    }
  }
  
  // Check path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, type: 'PATH_TRAVERSAL', pattern: pattern.source };
    }
  }
  
  // Check SQL injection
  for (const pattern of SQL_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, type: 'SQL_INJECTION', pattern: pattern.source };
    }
  }
  
  // Check XSS
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, type: 'XSS_DETECTED', pattern: pattern.source };
    }
  }
  
  // Check malicious redirects
  for (const pattern of REDIRECT_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, type: 'MALICIOUS_REDIRECT', pattern: pattern.source };
    }
  }
  
  return { detected: false, type: '' };
}

function isSensitivePath(path: string): boolean {
  const p = path.toLowerCase();
  return SENSITIVE_PATTERNS.some(pat => pat.test(p));
}

function isHoneypotPath(path: string): boolean {
  const p = path.toLowerCase();
  return HONEYPOT_PATHS.some(hp => p.includes(hp.toLowerCase()));
}

function isBlockedUA(ua: string): boolean {
  if (!ua) return true;
  return BLOCKED_UAS.some(pat => pat.test(ua));
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Basic security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('X-Download-Options', 'noopen');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Enhanced Permissions Policy
  response.headers.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), microphone=(), geolocation=(), payment=(), display-capture=()'
  );
  
  // Cross-Origin policies (enhanced)
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  
  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  
  // Strict Transport Security (if HTTPS)
  // response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // Remove sensitive headers
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');
  response.headers.delete('X-AspNet-Version');
  response.headers.delete('X-AspNetMvc-Version');
  
  return response;
}

// ============================================================================
// Main Middleware
// ============================================================================

export function middleware(request: NextRequest) {
  const ip = getClientIP(request);
  const path = request.nextUrl.pathname;
  const method = request.method;
  
  // Skip static assets
  if (
    path.startsWith('/_next/static') ||
    path.startsWith('/_next/image') ||
    path.startsWith('/favicon') ||
    path.includes('.')
  ) {
    return addSecurityHeaders(NextResponse.next());
  }
  
  // HTTP method validation - 只允许特定方法
  if (!ALLOWED_METHODS.includes(method)) {
    return NextResponse.json(
      { error: 'Method Not Allowed', code: 'INVALID_METHOD' },
      { status: 405 }
    );
  }
  
  // Sensitive paths - return 404 (not 403 to prevent enumeration)
  if (isSensitivePath(path)) {
    return NextResponse.json({ error: 'Not Found', code: 'NOT_FOUND' }, { status: 404 });
  }
  
  // Block dotfile access
  if (/^\/\.[^/]/.test(path)) {
    return NextResponse.json({ error: 'Not Found', code: 'NOT_FOUND' }, { status: 404 });
  }
  
  // IP blocking check
  if (isIPBlocked(ip)) {
    const block = blockedIPs[ip];
    return NextResponse.json(
      { error: 'Forbidden', code: 'IP_BLOCKED', reason: block?.reason },
      { status: 403 }
    );
  }
  
  // Brute force protection for login/register paths
  const isAuthPath = path.includes('/login') || path.includes('/register');
  if (isAuthPath && ['POST', 'PUT'].includes(method)) {
    const bfCheck = checkBruteForce(ip, true);
    if (bfCheck.blocked) {
      blockIP(ip, bfCheck.reason, bfCheck.blockDuration);
      return NextResponse.json(
        { 
          error: 'Forbidden', 
          code: 'BRUTE_FORCE_BLOCKED',
          retryAfter: Math.ceil(bfCheck.blockDuration / 1000)
        },
        { 
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(bfCheck.blockDuration / 1000)) }
        }
      );
    }
  } else {
    // Reset brute force on successful non-auth requests
    checkBruteForce(ip, false);
  }
  
  // Determine rate limit type
  let limitType: keyof typeof RATE_LIMITS = 'global';
  if (path.startsWith('/api/')) limitType = 'api';
  if (path.includes('/login') || path.includes('/register')) limitType = 'login';
  if (path.startsWith('/admin')) limitType = 'admin';
  if (path.includes('/checkout')) limitType = 'checkout';
  
  // Rate limiting
  const rl = checkRateLimit(ip, limitType);
  if (!rl.allowed) {
    blockIP(ip, `Rate limit exceeded (${limitType})`, 300000);
    return NextResponse.json(
      { 
        error: 'Too Many Requests', 
        code: 'RATE_LIMITED', 
        retryAfter: 60 
      },
      { 
        status: 429, 
        headers: { 
          'Retry-After': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000))
        } 
      }
    );
  }
  
  // Get request data for analysis
  const query = request.nextUrl.search;
  const ua = request.headers.get('user-agent') || '';
  const fullUrl = request.nextUrl.toString();
  
  // WAF Analysis - Honeypot paths
  if (isHoneypotPath(path)) {
    blockIP(ip, 'Honeypot path accessed', 1800000);
    return NextResponse.json({ error: 'Not Found', code: 'NOT_FOUND' }, { status: 404 });
  }
  
  // Blocked User-Agent check
  if (isBlockedUA(ua)) {
    blockIP(ip, 'Malicious User-Agent', 1800000);
    return NextResponse.json({ error: 'Forbidden', code: 'BLOCKED' }, { status: 403 });
  }
  
  // Analyze query parameters
  if (query) {
    const threat = detectThreat(query);
    if (threat.detected) {
      blockIP(ip, threat.type, 3600000);
      console.error(`[WAF] ${threat.type} detected from ${ip} in query: ${threat.pattern}`);
      return NextResponse.json({ 
        error: 'Forbidden', 
        code: threat.type 
      }, { status: 403 });
    }
  }
  
  // Analyze URL path
  const pathThreat = detectThreat(path);
  if (pathThreat.detected) {
    blockIP(ip, pathThreat.type, 3600000);
    return NextResponse.json({ 
      error: 'Forbidden', 
      code: pathThreat.type 
    }, { status: 403 });
  }
  
  // Analyze full URL
  const urlThreat = detectThreat(fullUrl);
  if (urlThreat.detected) {
    blockIP(ip, urlThreat.type, 3600000);
    return NextResponse.json({ 
      error: 'Forbidden', 
      code: urlThreat.type 
    }, { status: 403 });
  }
  
  // Analyze request body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = request.headers.get('content-type') || '';
    
    // For form data, check URL parameters
    if (contentType.includes('application/x-www-form-urlencoded') || 
        contentType.includes('multipart/form-data')) {
      // Extract form data from URL (for basic checking)
      const urlBodyThreat = detectThreat(request.nextUrl.searchParams.toString());
      if (urlBodyThreat.detected) {
        blockIP(ip, urlBodyThreat.type, 3600000);
        return NextResponse.json({ 
          error: 'Forbidden', 
          code: urlBodyThreat.type 
        }, { status: 403 });
      }
    }
  }
  
  // Check for missing User-Agent (common with scrapers/bots)
  if (!ua && !path.startsWith('/api/')) {
    blockIP(ip, 'No User-Agent', 60000);
  }
  
  // Create response
  const response = NextResponse.next();
  
  // Add rate limit headers
  response.headers.set('X-RateLimit-Remaining', String(rl.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.floor(rl.resetAt / 1000)));
  
  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
};
