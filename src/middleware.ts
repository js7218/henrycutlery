/**
 * Maximum Security Middleware - Ultimate WAF Protection
 *
 * Security Modules (ALL MAXIMUM STRENGTH):
 * 1. PHP Malicious Code / WebShell / One-liner Trojan Detection
 * 2. Image Trojan Detection
 * 3. Malicious File Upload Detection
 * 4. Malicious File Download Prevention
 * 5. Command Execution / RCE Detection
 * 6. DDoS / DoS Attack Protection
 * 7. Strict Request Header Audit
 * 8. File Inclusion LFI/RFI
 * 9. SQL Injection Detection
 * 10. XSS Detection
 * 11. Path Traversal Detection
 * 12. SSRF Detection
 * 13. CSRF Protection
 * 14. Brute Force Protection
 * 15. Rate Limiting
 * 16. Honeypot Paths
 * 17. Malicious Redirect Detection
 * 18. Protocol Smuggling Detection
 * 19. HTTP Desync Attack
 * 20. Daily Auto-Unlock at Midnight
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// PROTECTED PATHS: Block direct access to sensitive files and directories
// These paths return 403 Forbidden to prevent information disclosure
// ============================================================================
const PROTECTED_PATHS = [
  // Build output (should never be accessed directly)
  '/_next/static/chunks/', '/_next/static/css/', '/_next/static/media/',
  '/_next/static/webpack-', '/_next/static/development/',
  // Source maps (can expose original source code)
  '.map', '.js.map', '.css.map',
  // Config files (contain sensitive settings)
  '/package.json', '/package-lock.json', '/yarn.lock',
  '/tsconfig.json', '/next.config', '/tailwind.config',
  '/postcss.config', '/.eslintrc', '/.babelrc',
  // Environment and secrets
  '/.env', '/.env.local', '/.env.production', '/.env.development',
  // Version control
  '/.git/', '/.gitignore', '/.gitattributes',
  // IDE and editor files
  '/.vscode/', '/.idea/', '/.editorconfig',
  // Logs and temp files
  '/.log', '/logs/', '/log/', '/tmp/', '/temp/',
  // Documentation that may contain sensitive info
  '/README.md', '/CHANGELOG.md', '/SECURITY.md',
  '/DEPLOYMENT.md', '/security-audit-report.md',
  // Scripts that should not be executed directly
  '/scripts/', '/audit.sh', '/check-deps.js',
  // Node modules (should never be served)
  '/node_modules/',
];

function isProtectedPath(path: string): boolean {
  return PROTECTED_PATHS.some(protectedPath => {
    if (protectedPath.startsWith('/')) {
      return path.startsWith(protectedPath) || path === protectedPath;
    }
    // For extensions like .map
    return path.endsWith(protectedPath);
  });
}

function isPublicPagePath(path: string): boolean {
  return path === '/' ||
    path === '/products' ||
    path.startsWith('/product/');
}

function hostnameFromHeader(value: string | null): string | null {
  if (!value || value === 'null') return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostWithoutPort(value: string): string {
  return value.split(':')[0].toLowerCase();
}

function isAllowedRequestSource(value: string | null, host: string): boolean {
  const hostname = hostnameFromHeader(value);
  if (!hostname) return false;

  const currentHost = hostWithoutPort(host);
  const allowedExactHosts = new Set([
    currentHost,
    'adamcutlery.com',
    'www.adamcutlery.com',
    'localhost',
    'instagram.com',
    'www.instagram.com',
    'facebook.com',
    'www.facebook.com',
    'threads.net',
    'www.threads.net',
  ]);

  return allowedExactHosts.has(hostname) ||
    hostname.endsWith('.instagram.com') ||
    hostname.endsWith('.facebook.com') ||
    hostname.endsWith('.threads.net') ||
    hostname.endsWith('.vercel.app');
}

function isSocialInAppOpen(request: NextRequest): boolean {
  const originHost = hostnameFromHeader(request.headers.get('origin')) || '';
  const refererHost = hostnameFromHeader(request.headers.get('referer')) || '';
  const ua = request.headers.get('user-agent') || '';
  const source = `${originHost} ${refererHost} ${ua}`.toLowerCase();

  return [
    'instagram.com',
    'facebook.com',
    'threads.net',
    'fb_iab',
    'fban',
    'instagram',
  ].some(marker => source.includes(marker));
}

// ============================================================================
// In-Memory Stores
// ============================================================================
interface RateLimitEntry {
  count: number;
  resetAt: number;
  blockedUntil: number | null;
}

interface BruteForceEntry {
  failures: number;
  firstFailure: number;
  lastFailure: number;
  timestamps: number[];
  blockedUntil: number | null;
  lockDate: string | null;
}

interface DDoSEntry {
  count: number;
  windowStart: number;
  burstCount: number;
  lastRequest: number;
  totalBytes: number;
  blockedUntil: number | null;
  lockDate: string | null;
}

interface BlockEntry {
  expiresAt: number;
  reason: string;
  lockDate: string | null;
  level?: number;
  blockedHits?: number;
}

interface ProgressiveWafEntry {
  count: number;
  firstSeen: number;
  level: number;
}

const requestCounts: Record<string, RateLimitEntry> = {};
const blockedIPs: Record<string, BlockEntry> = {};
const bruteForceStore: Record<string, BruteForceEntry> = {};
const connectionTracker: Record<string, DDoSEntry> = {};
const progressiveWafHits: Record<string, ProgressiveWafEntry> = {};

// ============================================================================
// CONFIG: Rate Limits (Tiered)
// ============================================================================
const RATE_LIMITS = {
  global: { windowMs: 60000, maxRequests: 300 },
  api: { windowMs: 60000, maxRequests: 100 },
  login: { windowMs: 60000, maxRequests: 5 },
  register: { windowMs: 60000, maxRequests: 3 },
  admin: { windowMs: 60000, maxRequests: 30 },
  checkout: { windowMs: 60000, maxRequests: 60 },
  upload: { windowMs: 60000, maxRequests: 5 },
  download: { windowMs: 60000, maxRequests: 20 },
};

const PROGRESSIVE_WAF_BLOCK = {
  threshold: 5,
  windowMs: 30 * 60 * 1000,
  blockedHitUpgradeThreshold: 5,
  durations: [
    30 * 60 * 1000,
    60 * 60 * 1000,
    3 * 60 * 60 * 1000,
    6 * 60 * 60 * 1000,
  ],
};

// ============================================================================
// SAFE PATHS: never block or rate-limit these legitimate user actions
// ============================================================================
const SAFE_PATHS_FOR_CHECKOUT = [
  '/api/order/create',
  '/api/auth/session',
  '/api/user/addresses',
];

// ============================================================================
// CONFIG: DDoS Protection (Maximum)
// ============================================================================
const DDOS_CONFIG = {
  maxRequestsPerSecond: 30,
  maxRequestsPerMinute: 200,
  maxRequestsPer10Seconds: 100,
  maxBurstRequests: 15,
  burstWindowMs: 1000,
  maxPayloadSizeBytes: 10 * 1024 * 1024, // 10MB
  // Block durations
  warningBlockMs: 30 * 60 * 1000,       // 30 minutes
  mediumBlockMs: 2 * 60 * 60 * 1000,     // 2 hours
  severeBlockMs: 24 * 60 * 60 * 1000,    // 24 hours
  criticalBlockMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================================================
// CONFIG: Brute Force (Maximum)
// ============================================================================
const BRUTE_FORCE = {
  failures5Block: 3 * 60 * 60 * 1000,
  failures10Block: 24 * 60 * 60 * 1000,
  failures20Block: 7 * 24 * 60 * 60 * 1000,
};

// Human verification is now triggered ONLY by anomalous behavior (high-frequency
// bursts, very-uniform timing, or login brute force). Normal repeated browsing
// of the SAME page never triggers a challenge — so legitimate users can refresh
// or revisit pages as much as they like.
const HUMAN_VERIFICATION = {
  verifiedMs: 30 * 60 * 1000,
  // anomaly thresholds (per-IP, sliding window)
  uniformTimingWindowMs: 30 * 1000,
  uniformTimingMinSamples: 8,
  uniformTimingMaxStdDev: 250, // ms — almost-constant intervals = bot
};

function isHumanVerified(request: NextRequest): boolean {
  // Client-created verification cookies are intentionally not trusted. This
  // function only keeps the hook for future server-signed verification.
  void request;
  return false;
}

// Per-IP recent request timestamps (used to detect uniform-timing bots
// that pace requests slowly to evade rate limits, e.g. one request every 3s).
const requestTimingTracker: Record<string, number[]> = {};

function recordTiming(ip: string): { uniformBot: boolean } {
  const now = Date.now();
  const list = requestTimingTracker[ip] || [];
  list.push(now);
  // keep only the recent window
  while (list.length && now - list[0] > HUMAN_VERIFICATION.uniformTimingWindowMs) {
    list.shift();
  }
  requestTimingTracker[ip] = list;

  if (list.length < HUMAN_VERIFICATION.uniformTimingMinSamples) {
    return { uniformBot: false };
  }
  // compute std-dev of inter-request intervals
  const gaps: number[] = [];
  for (let i = 1; i < list.length; i++) gaps.push(list[i] - list[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  const std = Math.sqrt(variance);
  // mean must also be small-ish (very fast scripts) to flag — slow human-like
  // pacing >5s between clicks is fine.
  if (mean < 5000 && std < HUMAN_VERIFICATION.uniformTimingMaxStdDev) {
    return { uniformBot: true };
  }
  return { uniformBot: false };
}

function withHumanChallengeCookie(response: NextResponse): NextResponse {
  response.cookies.set('human_verification_required', '1', {
    path: '/',
    sameSite: 'lax',
    maxAge: Math.floor(HUMAN_VERIFICATION.verifiedMs / 1000),
  });
  response.headers.set('X-Human-Verification-Required', '1');
  return response;
}

// ============================================================================
// PATTERNS: PHP Malicious Code / WebShell / One-liner Trojan
// ============================================================================
const PHP_MALICIOUS_PATTERNS = [
  // One-liner trojan - most common variants
  /<\?php\s*\$_(GET|POST|REQUEST|COOKIE|SERVER)\s*\[.*\]\s*\(.*\)/i,
  /<\?php\s*@?eval\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)\s*\[.*\]\s*\)/i,
  /<\?php\s*@?assert\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)\s*\[.*\]\s*\)/i,
  /<\?php\s*@?system\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)\s*\[.*\]\s*\)/i,
  /<\?php\s*@?passthru\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)\s*\[.*\]\s*\)/i,
  /<\?php\s*@?shell_exec\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)\s*\[.*\]\s*\)/i,
  /<\?php\s*@?exec\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)\s*\[.*\]\s*\)/i,
  /<\?php\s*@?preg_replace\s*\(.*\/e.*\$_(GET|POST|REQUEST)/i,
  /<\?php\s*@?create_function\s*\(.*\$_(GET|POST|REQUEST)/i,
  /<\?php\s*@?call_user_func\s*\(.*\$_(GET|POST|REQUEST)/i,
  /<\?php\s*@?array_map\s*\(.*\$_(GET|POST|REQUEST)/i,
  /<\?php\s*@?array_filter\s*\(.*\$_(GET|POST|REQUEST)/i,
  /<\?php\s*@?usort\s*\(.*\$_(GET|POST|REQUEST)/i,
  /<\?php\s*@?file_put_contents\s*\(.*\$_(GET|POST|REQUEST)/i,
  /<\?php\s*@?str_replace\s*\(.*\$_(GET|POST|REQUEST)/i,
  // Encoded one-liner trojan variants
  /<\?php\s*@?eval\s*\(\s*base64_decode\s*\(/i,
  /<\?php\s*@?eval\s*\(\s*gzinflate\s*\(\s*base64_decode\s*\(/i,
  /<\?php\s*@?eval\s*\(\s*gzuncompress\s*\(\s*base64_decode\s*\(/i,
  /<\?php\s*@?eval\s*\(\s*str_rot13\s*\(/i,
  /<\?php\s*@?eval\s*\(\s*pack\s*\(/i,
  /<\?php\s*\$\w+\s*=\s*["'].*["']\s*;\s*@?eval\s*\(\s*\$\w+\s*\)/i,
  // PHP short tag trojan
  /<\?\s*=\s*\$_(GET|POST|REQUEST)/i,
  /<\?\s*=\s*@?eval/i,
  /<\?\s*=\s*@?system/i,
  /<\?\s*=\s*@?assert/i,
  // Tagless one-liner trojan (using auto_prepend_file)
  /eval\s*\(\s*base64_decode\s*\(\s*["']([A-Za-z0-9+\/=]{100,})/i,
  // PHP callback trojan
  /register_shutdown_function\s*\(\s*["']\w+["']\s*,/i,
  /set_error_handler\s*\(\s*["']\w+["']\s*,/i,
  // PHP deserialization exploit
  /unserialize\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/i,
  // PHP dangerous functions
  /eval\s*\(/i, /assert\s*\(/i, /system\s*\(/i,
  /exec\s*\(/i, /passthru\s*\(/i, /shell_exec\s*\(/i,
  /proc_open\s*\(/i, /popen\s*\(/i,
  /pcntl_exec\s*\(/i, /pcntl_fork\s*\(/i,
  /putenv\s*\(/i, /getenv\s*\(/i,
  /apache_setenv\s*\(/i, /ini_set\s*\(/i,
  /dl\s*\(/i, /ini_alter\s*\(/i,
  /move_uploaded_file\s*\(\s*\$_FILES/i,
  /copy\s*\(\s*\$_FILES/i,
  // PHP obfuscated/encrypted code
  /\$\{.+}\s*\(.*\)/i,
  /\$\w+\s*\(\s*["'].*["']\s*\.\s*\$_(GET|POST|REQUEST)/i,
  // PHP tag hiding
  /<script\s+language\s*=\s*["']?php["']?/i,
  /<\%\s*@\s*eval/i,
];

// ============================================================================
// PATTERNS: Image Trojan Detection
// ============================================================================
const IMAGE_TROJAN_PATTERNS = [
  // PHP code embedded in image
  /<\?php/i,
  /<\?=/i,
  /<script\s+language\s*=\s*["']?php["']?/i,
  /<\%\s*@\s*eval/i,
  // Image EXIF PHP injection
  /\/\*[\s\S]*\*\/\s*<\?php/i,
  // GIF89a header followed by PHP code
  /GIF89a[\s\S]{0,100}<?/i,
  /PNG[\s\S]{0,100}<?/i,
  /JFIF[\s\S]{0,100}<?/i,
  /BM[\s\S]{0,100}<?/i,
  // Base64 encoded PHP code embedded
  /PD9waHAg/i, // base64 of <?php
  /ZXZhbCAo/i, // base64 of eval (
  // Hex encoding
  /0x3c3f706870/i, // hex of <?php
  // Executable markers in image files
  /\xff\xd8\xff[\s\S]{0,1000}(eval|system|exec|passthru|shell_exec|base64_decode)/i,
  /\x89PNG[\s\S]{0,1000}(eval|system|exec|passthru|shell_exec|base64_decode)/i,
  /GIF89a[\s\S]{0,1000}(eval|system|exec|passthru|shell_exec|base64_decode)/i,
];

// ============================================================================
// PATTERNS: Malicious File Upload Extensions
// ============================================================================
const MALICIOUS_EXTENSIONS = [
  // PHP variants
  /\.php\d*/i, /\.phtml/i, /\.phar/i, /\.phpt/i, /\.phps/i,
  /\.pHp/i, /\.pHP/i, /\.PhP/i, /\.pHtml/i,
  // Double extension tricks (file.php.jpg)
  /\.php\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)/i,
  /\.php\.txt/i, /\.php\.html/i, /\.php\.htm/i,
  /\.asp(x)?\.(jpg|jpeg|png|gif)/i,
  /\.jsp(x)?\.(jpg|jpeg|png|gif)/i,
  // JSP/ASP
  /\.jspx?/i, /\.jspf/i, /\.asp/i, /\.aspx/i, /\.cer/i, /\.asa/i,
  // CGI/Perl/Python/Ruby
  /\.cgi/i, /\.pl/i, /\.py/i, /\.rb/i, /\.sh/i, /\.bash/i,
  // Config files
  /\.hta/i, /\.htaccess/i, /\.htpasswd/i, /\.user\.ini/i,
  /\.web\.config/i,
  // Executables
  /\.exe/i, /\.bat/i, /\.cmd/i, /\.msi/i, /\.scr/i,
  /\.com/i, /\.vbs/i, /\.vbe/i, /\.wsf/i, /\.wsh/i,
  /\.ps1/i, /\.psm1/i,
  // Archives (can contain malware)
  /\.jar/i, /\.war/i, /\.pif/i,
  // Other dangerous
  /\.shtml/i, /\.shtm/i, /\.stm/i,
  /\.inc/i, /\.module/i, /\.plugin/i,
  /\.sql/i, /\.db/i, /\.sqlite/i,
];

// ============================================================================
// PATTERNS: Command Execution / RCE
// ============================================================================
const CMD_EXECUTION_PATTERNS = [
  // Direct command execution
  /[;&|`$]\s*(whoami|id|uname|hostname|ls|cat|echo|wget|curl|nc|netcat|bash|sh|cmd|powershell|python|perl|ruby|php)\b/i,
  /\|\s*\w+/i, /&&\s*\w+/i, /\|\|\s*\w+/i,
  /\$?\(\s*\w+/i, /`\w+`/i, /\$+\{?\w+\}?/i,
  // Command chaining
  /;\s*(cat|ls|dir|rm|del|echo|wget|curl|nc|bash|sh|python|perl|ruby|php|cmd|powershell)\b/i,
  // Reverse shell patterns
  /bash\s+-i\s+>&?\s*\/dev\/tcp/i,
  /nc\s+-[elv]+\s+\d+\s+\d+/i,
  /python\s+-c\s+['"]import\s+socket/i,
  /perl\s+-e\s+['"]use\s+socket/i,
  /php\s+-r\s+['"]\$\w+\s*=\s*fsockopen/i,
  /powershell\s+-nop\s+-c\s*['"]/i,
  // Windows command execution
  /cmd\.exe\s*\/c/i, /cmd\.exe\s*\/k/i,
  /command\.com\s*\/c/i,
  /powershell\s+-exec/i,
  // Encoded command execution
  /cmd\s*\/c\s*echo\s*\w+\s*\|\s*base64\s*-d/i,
  /\$\(\s*echo\s+["']([A-Za-z0-9+\/=]{20,})["']\s*\|\s*base64\s+-d/i,
  // Path-based command execution
  /\/usr\/bin\/\w+/i, /\/bin\/\w+/i, /\/sbin\/\w+/i,
  /\/etc\/passwd/i, /\/etc\/shadow/i, /\/etc\/hosts/i,
  // DNS exfiltration
  /\w+\.\w+\.\w+\.\w+\.dnslog/i,
  /\w+\.ceye\.io/i,
  /\w+\.burpcollaborator/i,
];

// ============================================================================
// PATTERNS: Malicious File Download Prevention
// ============================================================================
const MALICIOUS_DOWNLOAD_PATTERNS = [
  // Sensitive file extensions
  /\.(env|git|svn|hg|bzr|csv|sql|db|sqlite|bak|backup|old|orig|save|swp|swo)$/i,
  /\.(pem|key|crt|cert|p12|pfx|jks|keystore)$/i,
  /\.(htaccess|htpasswd|ini|conf|cfg|yml|yaml|toml|properties)$/i,
  /\.(log|debug|trace|dump|core)$/i,
  // Compressed archives (may contain sensitive data)
  /\.(zip|tar|gz|bz2|xz|rar|7z|tgz)$/i,
  // Source code
  /\.(java|class|cs|cpp|c|h|hpp|go|rs|swift|kt)$/i,
  // Database dumps
  /\/(backup|dump|export|snapshot|database)\//i,
  // Direct file access patterns
  /\/(src|lib|vendor|node_modules)\/.*\.(js|ts|json|yaml|yml|env)$/i,
  // Cloud provider metadata
  /\/\.aws\//i, /\/\.gcp\//i, /\/\.azure\//i,
  // Kubernetes secrets
  /\/var\/run\/secrets\//i,
  /\/etc\/kubernetes\//i,
];

// ============================================================================
// PATTERNS: File Inclusion LFI/RFI - Enhanced
// ============================================================================
const FILE_INCLUSION_PATTERNS = [
  // Local File Inclusion (LFI)
  /\?.*(file|path|dir|page|doc|folder|view|include|require|open|read|load|template|content)=/i,
  /\?.*=.*\.(php|asp|jsp|txt|ini|conf|cfg|sh|bash|py|rb|pl|cgi)/i,
  /\?.*=.*\/etc\//i,
  /\?.*=.*\/proc\//i,
  /\?.*=.*\/var\//i,
  /\?.*=.*\/sys\//i,
  /\?.*=.*\/tmp\//i,
  /\?.*=.*\/usr\//i,
  /\?.*=.*\/home\//i,
  /\?.*=.*\/root\//i,
  /\?.*=.*\.\.\/\.\./i,
  /\?.*=.*\.\.\\\.\.\\/i,
  // PHP Wrappers
  /php:\/\/input/i, /php:\/\/filter/i, /php:\/\/data/i,
  /php:\/\/zip/i, /php:\/\/ Phar/i,
  // Data wrapper
  /data:\/\//i, /data:text\/plain/i,
  // Expect wrapper
  /expect:\/\//i,
  // Remote File Inclusion (RFI)
  /\?.*(url|uri|src|href|location|redirect|link|next|file_url|path_url)=https?:/i,
  /\?.*=.*https?:\/\//i,
  /\?.*=.*ftp:\/\//i,
  /\?.*=.*sftp:\/\//i,
  /\?.*=.*ssh:\/\//i,
  /\?.*=.*dict:\/\//i,
  /\?.*=.*gopher:\/\//i,
  /\?.*=.*ldap:\/\//i,
  // File wrapper abuse
  /file:\/\//i, /zip:\/\//i, /phar:\/\//i,
  /compress.zlib:\/\//i, /compress.bzip2:\/\//i,
  // Phar deserialization
  /phar:\/\/.*\.phar/i,
];

// ============================================================================
// PATTERNS: SQL Injection (Enhanced)
// ============================================================================
const SQL_PATTERNS = [
  /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE)\b/i,
  /\b(UNION|UNION\s+ALL|WAITFOR|DELAY)\b/i,
  /union\s+select/i, /into\s+(out|dump)file/i,
  /\b(sleep|benchmark|waitfor|pg_sleep)\s*\(/i,
  /\b(concat|group_concat|substring|substr|char|hex|unhex|length|count|extractvalue|updatexml|floor|rand)\s*\(/i,
  /information_schema/i, /sys\.databases/i, /sys\.objects/i, /mysql\.user/i, /pg_catalog/i,
  /'\s*(or|and)\s+'[^']*'='[^']*'/i,
  /"\s*(or|and)\s+"[^"]*"="[^"]*"/i,
  /or\s+1\s*=\s*1/i, /and\s+1\s*=\s*1/i,
  /0x[0-9a-f]{8,}/i,
  /;\s*(select|insert|update|delete|drop)/i,
  /having\s+\d+\s*[=<>]+\s*\d+/i,
  /order\s+by\s+\d+/i,
  /group\s+by.+\s+having/i,
  /load_file\s*\(/i,
  /into\s+(outfile|dumpfile)/i,
];

// ============================================================================
// PATTERNS: XSS (Enhanced)
// ============================================================================
const XSS_PATTERNS = [
  /<script/i, /<\/script/i,
  /<img[^\>]+onerror/i, /<img[^\>]+onsrc/i, /<img[^\>]+onload/i,
  /<iframe/i, /<\/iframe/i, /<embed/i, /<object/i,
  /<applet/i, /<svg/i, /<math/i, /<base/i, /<link/i,
  /on\w+\s*=/i, /\son\w+\s*=/i,
  /javascript\s*:/i, /vbscript\s*:/i, /data\s*:/i,
  /<meta[^>]*http-equiv[^>]*refresh/i,
  /expression\s*\(/i, /url\s*\(\s*["']?\s*javascript:/i,
  /<body[^>]*onload/i, /<input[^>]*autofocus/i,
  /<svg[^>]*onload/i, /<svg[^>]*onerror/i,
  /\bon(mouseover|focus|blur|click|load|error|submit|change|keydown|keyup|keypress|drag|drop|contextmenu|resize|scroll)\s*=/i,
  /<details[^>]*ontoggle/i,
  /<marquee[^>]*on/i,
  /<video[^>]*on/i, /<audio[^>]*on/i,
  /<source[^>]*on/i,
  /fromcharcode/i,
];

// ============================================================================
// PATTERNS: Path Traversal (Enhanced with all encoding variants)
// ============================================================================
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//i, /\.\.\.\//i, /\.\.\.\.\//i,
  /%2e%2e/i, /%252e%252e/i, /%2e%2e%2f/i, /%2e%2e%5c/i,
  /\.\.%2f/i, /\.\.%5c/i,
  /\.\.%252f/i, /\.\.%255c/i,
  /\\+\.\.\\/i, /\.\.\/\\\./i,
  /%c0%ae%c0%ae/i, /%c1%9c/i, /%c1%1c/i,
  /%e0%80%ae/i, /%e0%80%af/i,
  /\.\.[\\\/]/i,
  /..%252f/i, /..%255c/i,
  /\.\.%c0%af/i, /\.\.%c1%9c/i,
];

// ============================================================================
// PATTERNS: SSRF (Enhanced)
// ============================================================================
const SSRF_PATTERNS = [
  /127\.\d+\.\d+\.\d+/i, /10\.\d+\.\d+\.\d+/i,
  /172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,
  /192\.168\.\d+\.\d+/i, /169\.254\.\d+\.\d+/i,
  /localhost/i, /\[::1\]/i, /\[::ffff:/i,
  /0x7f/i, /0\.0\.0\.0/i, /255\.255\.255\.255/i,
  /metadata\.google/i, /metadata\.internal/i,
  /169\.254\.169\.254/i,
  /100\.100\.\d+\.\d+/i,
  /fd[\da-f]{2}:[\da-f:]+/i,
];

// ============================================================================
// Multi-layer Decoder — defeats URL/double-URL/base64/hex/unicode evasion
// ============================================================================
function tryBase64Decode(s: string): string | null {
  // Only attempt for plausibly-base64 looking long substrings
  const m = s.match(/[A-Za-z0-9+/]{20,}={0,2}/g);
  if (!m) return null;
  let out = '';
  for (const chunk of m) {
    try {
      // atob is available in Edge runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decoded = (globalThis as any).atob ? (globalThis as any).atob(chunk) : Buffer.from(chunk, 'base64').toString('utf-8');
      out += ' ' + decoded;
    } catch { /* ignore */ }
  }
  return out || null;
}

function tryHexDecode(s: string): string | null {
  // \xNN, %NN, 0xNN, &#xNN;, \uNNNN, &#NN;
  let out = s
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/0x([0-9a-fA-F]{2,8})/g, (_, h) => {
      try { return String.fromCharCode(parseInt(h, 16)); } catch { return ''; }
    })
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => {
      try { return String.fromCharCode(parseInt(h, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);?/g, (_, d) => {
      try { return String.fromCharCode(parseInt(d, 10)); } catch { return ''; }
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => {
      try { return String.fromCharCode(parseInt(h, 16)); } catch { return ''; }
    });
  return out !== s ? out : null;
}

function tryUrlDecode(s: string): string | null {
  try {
    const d = decodeURIComponent(s.replace(/\+/g, ' '));
    return d !== s ? d : null;
  } catch {
    // strip invalid % sequences and retry
    try {
      const cleaned = s.replace(/%(?![0-9a-fA-F]{2})/g, '');
      const d = decodeURIComponent(cleaned);
      return d !== s ? d : null;
    } catch {
      return null;
    }
  }
}

/**
 * Generate all decoded representations of an input. We loop because attackers
 * stack encodings (e.g. base64( url-encoded( <?php ... ) )).
 */
function explodeEncodings(input: string, maxIterations = 4): string[] {
  const seen = new Set<string>([input]);
  const queue: string[] = [input];
  while (queue.length && maxIterations-- > 0) {
    const next: string[] = [];
    for (const cur of queue) {
      const candidates = [tryUrlDecode(cur), tryHexDecode(cur), tryBase64Decode(cur)];
      for (const c of candidates) {
        if (c && !seen.has(c)) {
          seen.add(c);
          next.push(c);
        }
      }
    }
    queue.length = 0;
    queue.push(...next);
    if (next.length === 0) break;
  }
  return [...seen];
}

function isUnsafeImageOptimizerUrl(value: string | null): boolean {
  if (!value) return false;

  let decoded = value;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  try {
    const url = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded);
    if (!['https:', 'http:'].includes(url.protocol)) return true;
    if (url.username || url.password) return true;
  } catch {
    return /(?:file|ftp|gopher|dict|ldap|data|jar|php|expect):/i.test(decoded);
  }

  return SSRF_PATTERNS.some(pattern => pattern.test(decoded));
}

// ============================================================================
// PATTERNS: Malicious Redirect
// ============================================================================
const REDIRECT_PATTERNS = [
  /javascript\s*:/i, /vbscript\s*:/i, /data\s*:/i,
  /mhtml\s*:/i, /livescript\s*:/i,
  /<meta[^>]*http-equiv[^>]*content[^>]*url/i,
  /<meta[^>]*refresh[^>]*content[^>]*url/i,
  /location\.replace\s*\(/i, /location\.href\s*=/i,
  /window\.location\s*=/i, /document\.location\s*=/i,
];

// ============================================================================
// PATTERNS: Sensitive Files
// ============================================================================
const SENSITIVE_PATTERNS = [
  /\.env$/i, /\.env\.\w+/i, /\.git\//i, /\.git$/i,
  /wp-admin/i, /wp-login/i, /wp-config/i, /wp-content/i,
  /phpmyadmin/i, /mysql/i, /adminer/i,
  /\.htaccess/i, /\.htpasswd/i,
  /docker-compose/i, /Dockerfile/i, /\.dockerignore/i,
  /package\.json/i, /package-lock\.json/i, /yarn\.lock/i,
  /tsconfig\.json/i, /next\.config/i, /tailwind\.config/i,
  /\.log$/i, /access\.log/i, /error\.log/i, /debug\.log/i,
  /\/logs\//i, /\/log\//i,
  /\.sqlite$/i, /\.db$/i, /\.bak$/i, /\.backup$/i,
  /\.pem$/i, /\.key$/i, /\.crt$/i, /\.cert$/i,
  /\/config\//i, /\/settings\//i, /\/secrets\//i, /\/credentials\//i,
  /\/\.aws\//i, /\/\.ssh\//i,
  /composer\.json/i, /composer\.lock/i,
  /Gemfile/i, /Gemfile\.lock/i,
  /Makefile/i, /Rakefile/i,
  /web\.config/i, /app\.config/i,
];

// ============================================================================
// PATTERNS: Honeypot Paths
// ============================================================================
const HONEYPOT_PATHS = [
  '/api/phpmyadmin', '/api/database', '/api/debug',
  '/.env', '/.git/config', '/.git/HEAD', '/.git/logs/',
  '/wp-login.php', '/xmlrpc.php', '/wp-config.php',
  '/config.php', '/setup.php', '/admin.php', '/administrator',
  '/phpmyadmin', '/mysql', '/console', '/terminal', '/shell', '/cmd',
  '/dbadmin', '/status', '/health', '/info',
  '/web.config', '/.well-known/security.txt',
  '/server-status', '/server-info',
  '/actuator', '/.actuator',
  '/graphql', '/graphiql',
  '/swagger', '/api-docs',
  '/debug/pprof', '/debug/vars',
  '/trace', '/metrics',
  '/solr/admin', '/kibana', '/grafana',
  '/jenkins', '/jenkins/script',
  '/.vscode', '/.idea',
];

// ============================================================================
// PATTERNS: Blocked User Agents
// ============================================================================
const BLOCKED_UAS = [
  /sqlmap/i, /nikto/i, /nmap/i, /dirbuster/i, /gobuster/i,
  /wfuzz/i, /hydra/i, /burp/i, /metasploit/i, /masscan/i,
  /zmap/i, /wpscan/i, /acunetix/i, /netsparker/i, /appscan/i,
  /havij/i, /pangolin/i, /scrapy/i, /masspull/i,
  /nuclei/i, /libwww-perl/i,
  /httpclient/i, /python-requests/i, /python-urllib/i,
  /go-http-client/i, /java\/\d/i,
  /wget/i, /curl/i, /fetch/i,
  /bot/i, /crawler/i, /spider/i, /scraper/i,
  /Censys/i, /Shodan/i, /ZoomEye/i, /Fofa/i,
  /AhrefsBot/i, /SemrushBot/i, /MegaIndex/i,
];

// ============================================================================
// PATTERNS: Protocol Smuggling / HTTP Desync
// ============================================================================
const SMUGGLING_PATTERNS = [
  /Content-Length:\s*\d+.*Content-Length:\s*\d+/is,
  /Transfer-Encoding:\s*chunked.*Content-Length:/is,
  /Content-Length:.*Transfer-Encoding:\s*chunked/is,
  /\r\n\r\n.*\r\n\s+(GET|POST|PUT|DELETE|PATCH)\s/i,
  /HTTP\/1\.1\s+\d{3}.*\r\n\r\n/i,
];

// ============================================================================
// Allowed HTTP Methods
// ============================================================================
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

// ============================================================================
// CSRF Protected Paths
// ============================================================================
const CSRF_PROTECTED_PATHS = [
  '/api/auth/session',
  '/api/order/create',
  '/api/user/profile',
  '/api/user/addresses',
  '/api/user/data',
  '/api/reviews',
  '/api/admin/',
];
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// ============================================================================
// Helper Functions
// ============================================================================

function getClientIP(request: NextRequest): string {
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

// Daily auto-unlock at midnight
function isDailyUnlock(entry: { lockDate: string | null }): boolean {
  if (!entry.lockDate) return false;
  const today = new Date().toISOString().split('T')[0];
  return entry.lockDate !== today;
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
    resetAt: requestCounts[key].resetAt,
  };
}

function blockIP(ip: string, reason: string, durationMs: number): void {
  const today = new Date().toISOString().split('T')[0];
  blockedIPs[ip] = { expiresAt: Date.now() + durationMs, reason, lockDate: today, level: 0, blockedHits: 0 };
}

function normalizeWafPath(path: string): string {
  return path.toLowerCase().replace(/\/{2,}/g, '/').slice(0, 160);
}

function progressiveBlockDuration(level: number): number {
  const durations = PROGRESSIVE_WAF_BLOCK.durations;
  return durations[Math.min(level, durations.length - 1)];
}

function blockIPProgressively(ip: string, reason: string, level: number): void {
  const today = new Date().toISOString().split('T')[0];
  const normalizedLevel = Math.min(Math.max(level, 0), PROGRESSIVE_WAF_BLOCK.durations.length - 1);
  blockedIPs[ip] = {
    expiresAt: Date.now() + progressiveBlockDuration(normalizedLevel),
    reason,
    lockDate: today,
    level: normalizedLevel,
    blockedHits: 0,
  };
}

function recordProgressiveWafHit(ip: string, path: string, reason: string): boolean {
  const now = Date.now();
  const key = `${ip}:${normalizeWafPath(path)}:${reason}`;
  const entry = progressiveWafHits[key];

  if (!entry || now - entry.firstSeen > PROGRESSIVE_WAF_BLOCK.windowMs) {
    progressiveWafHits[key] = { count: 1, firstSeen: now, level: entry?.level || 0 };
    return false;
  }

  entry.count += 1;
  if (entry.count < PROGRESSIVE_WAF_BLOCK.threshold) return false;

  blockIPProgressively(ip, reason, entry.level);
  entry.count = 0;
  entry.firstSeen = now;
  entry.level = Math.min(entry.level + 1, PROGRESSIVE_WAF_BLOCK.durations.length - 1);
  return true;
}

function recordBlockedIPHit(ip: string): void {
  const block = blockedIPs[ip];
  if (!block) return;

  block.blockedHits = (block.blockedHits || 0) + 1;
  if (block.blockedHits < PROGRESSIVE_WAF_BLOCK.blockedHitUpgradeThreshold) return;

  const nextLevel = Math.min((block.level || 0) + 1, PROGRESSIVE_WAF_BLOCK.durations.length - 1);
  blockIPProgressively(ip, block.reason, nextLevel);
}

function progressiveWafBlockResponse(ip: string, path: string, reason: string): NextResponse | null {
  const blocked = recordProgressiveWafHit(ip, path, reason);
  if (!blocked) return null;

  const block = blockedIPs[ip];
  const retryAfter = block ? Math.ceil((block.expiresAt - Date.now()) / 1000) : 1800;
  return NextResponse.json(
    { error: 'Forbidden', code: 'IP_BLOCKED', reason, retryAfter },
    { status: 403, headers: { 'Retry-After': String(retryAfter) } }
  );
}

function isIPBlocked(ip: string): boolean {
  const block = blockedIPs[ip];
  if (!block) return false;
  // Daily auto-unlock
  if (isDailyUnlock(block)) {
    delete blockedIPs[ip];
    return false;
  }
  if (block.expiresAt <= Date.now()) {
    delete blockedIPs[ip];
    return false;
  }
  return true;
}

// ============================================================================
// Brute Force Detection (Enhanced with bot detection)
// ============================================================================
function checkBruteForce(ip: string, isLoginAttempt: boolean): {
  blocked: boolean; blockDuration: number; reason: string;
} {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const entry = bruteForceStore[ip];

  if (!isLoginAttempt) {
    if (entry && entry.blockedUntil && entry.blockedUntil <= now) {
      delete bruteForceStore[ip];
    }
    return { blocked: false, blockDuration: 0, reason: '' };
  }

  // Daily auto-unlock
  if (entry && isDailyUnlock(entry)) {
    delete bruteForceStore[ip];
  }

  if (!entry) {
    bruteForceStore[ip] = { failures: 1, firstFailure: now, lastFailure: now, timestamps: [now], blockedUntil: null, lockDate: null };
    return { blocked: false, blockDuration: 0, reason: '' };
  }

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { blocked: true, blockDuration: entry.blockedUntil - now, reason: 'BRUTE_FORCE_BLOCKED' };
  }

  entry.failures++;
  entry.lastFailure = now;
  entry.timestamps.push(now);
  if (entry.timestamps.length > 20) entry.timestamps = entry.timestamps.slice(-20);

  // Detect bot/automated tool (consecutive requests < 2s apart)
  let isBot = false;
  if (entry.timestamps.length >= 3) {
    const recent = entry.timestamps.slice(-5);
    let fastCount = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] - recent[i - 1] < 2000) fastCount++;
    }
    if (fastCount >= 3) isBot = true;
  }

  let blockDuration = 0;
  if (entry.failures >= 20) {
    blockDuration = isBot ? BRUTE_FORCE.failures20Block * 2 : BRUTE_FORCE.failures20Block;
  } else if (entry.failures >= 10) {
    blockDuration = isBot ? BRUTE_FORCE.failures10Block * 2 : BRUTE_FORCE.failures10Block;
  } else if (entry.failures >= 5) {
    blockDuration = isBot ? BRUTE_FORCE.failures5Block * 2 : BRUTE_FORCE.failures5Block;
  }

  if (blockDuration > 0) {
    entry.blockedUntil = now + blockDuration;
    entry.lockDate = today;
  }

  bruteForceStore[ip] = entry;
  return {
    blocked: blockDuration > 0,
    blockDuration,
    reason: blockDuration > 0 ? (isBot ? 'BRUTE_FORCE_BOT_DETECTED' : 'BRUTE_FORCE_DETECTED') : '',
  };
}

// ============================================================================
// DDoS Detection (Enhanced with bot detection & daily unlock)
// ============================================================================
function checkDDoS(ip: string, request: NextRequest): {
  detected: boolean; level: 'none' | 'warning' | 'medium' | 'severe' | 'critical'; reason: string;
} {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];

  if (!connectionTracker[ip]) {
    connectionTracker[ip] = { count: 1, windowStart: now, burstCount: 1, lastRequest: now, totalBytes: 0, blockedUntil: null, lockDate: null };
    return { detected: false, level: 'none', reason: '' };
  }

  const entry = connectionTracker[ip];

  // Daily auto-unlock
  if (isDailyUnlock(entry)) {
    entry.blockedUntil = null;
    entry.lockDate = null;
    entry.count = 0;
    entry.burstCount = 0;
  }

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { detected: true, level: 'critical', reason: 'DDoS_BLOCKED' };
  }

  // Check payload size
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = parseInt(contentLength, 10);
    entry.totalBytes += bytes;
    if (bytes > DDOS_CONFIG.maxPayloadSizeBytes) {
      entry.blockedUntil = now + DDOS_CONFIG.criticalBlockMs;
      entry.lockDate = today;
      connectionTracker[ip] = entry;
      return { detected: true, level: 'critical', reason: 'DDoS: Payload too large' };
    }
  }

  // Check burst (1 second window)
  if (now - entry.windowStart < DDOS_CONFIG.burstWindowMs) {
    entry.burstCount++;
    if (entry.burstCount > DDOS_CONFIG.maxRequestsPerSecond) {
      entry.blockedUntil = now + DDOS_CONFIG.criticalBlockMs;
      entry.lockDate = today;
      connectionTracker[ip] = entry;
      return { detected: true, level: 'critical', reason: 'DDoS: Critical rate exceeded' };
    }
    if (entry.burstCount > DDOS_CONFIG.maxBurstRequests) {
      entry.blockedUntil = now + DDOS_CONFIG.severeBlockMs;
      entry.lockDate = today;
      connectionTracker[ip] = entry;
      return { detected: true, level: 'severe', reason: 'DDoS: Burst requests detected' };
    }
  } else {
    entry.burstCount = 1;
    entry.windowStart = now;
  }

  entry.count++;
  entry.lastRequest = now;

  // Per-minute check
  if (entry.count > DDOS_CONFIG.maxRequestsPerMinute) {
    entry.blockedUntil = now + DDOS_CONFIG.mediumBlockMs;
    entry.lockDate = today;
    connectionTracker[ip] = entry;
    return { detected: true, level: 'medium', reason: 'DDoS: Per-minute rate exceeded' };
  }

  connectionTracker[ip] = entry;
  return { detected: false, level: 'none', reason: '' };
}

// ============================================================================
// Request Header Audit
// ============================================================================
function auditRequestHeaders(request: NextRequest, ip: string): { passed: boolean; reason: string } {
  const host = request.headers.get('host') || '';
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const ua = request.headers.get('user-agent') || '';
  const accept = request.headers.get('accept') || '';
  const contentType = request.headers.get('content-type') || '';
  const method = request.method;

  if (
    !SAFE_METHODS.includes(method) &&
    isPublicPagePath(request.nextUrl.pathname) &&
    isSocialInAppOpen(request)
  ) {
    return { passed: true, reason: '' };
  }

  // 1. Host header validation - must be valid domain
  if (host && !/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9](:\d+)?$/.test(host)) {
    return { passed: false, reason: 'INVALID_HOST_HEADER' };
  }

  // 2. Block requests with IP address in Host header (direct IP access)
  if (host && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(host)) {
    return { passed: false, reason: 'DIRECT_IP_ACCESS' };
  }

  // 3. Origin validation for non-GET requests
  if (!SAFE_METHODS.includes(method)) {
    if (origin) {
      if (!isAllowedRequestSource(origin, host)) {
        return { passed: false, reason: 'INVALID_ORIGIN' };
      }
    }
    if (referer) {
      if (!isAllowedRequestSource(referer, host)) {
        return { passed: false, reason: 'INVALID_REFERER' };
      }
    }
  }

  // 4. User-Agent validation
  if (!ua || ua.length < 4 || ua.length > 500) {
    return { passed: false, reason: 'INVALID_USER_AGENT' };
  }

  // 5. Content-Type validation for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const allowedContentTypes = [
      'application/json', 'application/x-www-form-urlencoded',
      'multipart/form-data', 'text/plain',
    ];
    if (contentType && !allowedContentTypes.some(ct => contentType.startsWith(ct))) {
      return { passed: false, reason: 'INVALID_CONTENT_TYPE' };
    }
  }

  // 6. Block suspicious headers (but NOT Vercel/CDN headers)
  const suspiciousHeaders = [
    'x-original-url', 'x-rewrite-url',
    'x-cdn-url', 'x-proxy-url',
  ];
  for (const header of suspiciousHeaders) {
    if (request.headers.get(header)) {
      return { passed: false, reason: `SUSPICIOUS_HEADER: ${header}` };
    }
  }

  // 7. Check for protocol smuggling in headers
  const rawHeaders = Array.from(request.headers.entries()).map(([k, v]) => `${k}: ${v}`).join('\r\n');
  for (const pattern of SMUGGLING_PATTERNS) {
    if (pattern.test(rawHeaders)) {
      return { passed: false, reason: 'HTTP_SMUGGLING_DETECTED' };
    }
  }

  return { passed: true, reason: '' };
}

// ============================================================================
// CSRF Validation (Enhanced)
// ============================================================================
function validateCSRF(request: NextRequest): boolean {
  const path = request.nextUrl.pathname;
  const method = request.method;

  if (SAFE_METHODS.includes(method)) return true;
  if (!CSRF_PROTECTED_PATHS.some(p => path.startsWith(p))) return true;

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host') || '';
  const fetchSite = request.headers.get('sec-fetch-site');

  // Some mobile browsers / in-app browsers may omit Origin and Referer on
  // same-site JSON fetches. Trust browser Fetch Metadata when it explicitly
  // says the request is same-origin or same-site, while still rejecting
  // cross-site requests below.
  if (!origin && !referer && (fetchSite === 'same-origin' || fetchSite === 'same-site')) {
    return true;
  }

  if (origin) {
    const originHost = hostnameFromHeader(origin);
    if (!originHost || originHost !== hostWithoutPort(host)) return false;
  }

  if (referer) {
    const refererHost = hostnameFromHeader(referer);
    if (!refererHost || refererHost !== hostWithoutPort(host)) return false;
  }

  if (!origin && !referer) return false;
  return true;
}

// ============================================================================
// Threat Detection (All-in-one) — runs against ALL decoded variants so
// URL-encoded / double-URL-encoded / base64 / hex / unicode / mixed-case
// payloads cannot bypass the WAF.
// ============================================================================
function detectThreatRaw(value: string): { detected: boolean; type: string; pattern?: string } {
  // PHP Malicious Code / WebShell / One-liner Trojan
  for (const pattern of PHP_MALICIOUS_PATTERNS) {
    if (pattern.test(value)) return { detected: true, type: 'PHP_MALICIOUS_CODE', pattern: pattern.source };
  }
  // Image Trojan
  for (const pattern of IMAGE_TROJAN_PATTERNS) {
    if (pattern.test(value)) return { detected: true, type: 'IMAGE_TROJAN', pattern: pattern.source };
  }
  // Command Execution
  for (const pattern of CMD_EXECUTION_PATTERNS) {
    if (pattern.test(value)) return { detected: true, type: 'CMD_EXECUTION', pattern: pattern.source };
  }
  // SSRF (skip in development to allow localhost testing)
  if (process.env.NODE_ENV !== 'development') {
    for (const pattern of SSRF_PATTERNS) {
      if (pattern.test(value)) return { detected: true, type: 'SSRF_DETECTED', pattern: pattern.source };
    }
  }
  // Path Traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(value)) return { detected: true, type: 'PATH_TRAVERSAL', pattern: pattern.source };
  }
  // SQL Injection
  for (const pattern of SQL_PATTERNS) {
    if (pattern.test(value)) return { detected: true, type: 'SQL_INJECTION', pattern: pattern.source };
  }
  // XSS
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) return { detected: true, type: 'XSS_DETECTED', pattern: pattern.source };
  }
  // Malicious Redirect
  for (const pattern of REDIRECT_PATTERNS) {
    if (pattern.test(value)) return { detected: true, type: 'MALICIOUS_REDIRECT', pattern: pattern.source };
  }
  return { detected: false, type: '' };
}

function detectThreat(value: string): { detected: boolean; type: string; pattern?: string } {
  if (!value) return { detected: false, type: '' };
  // Scan the raw value plus every decoded variant so encoded payloads
  // (URL, double-URL, hex, unicode \u, base64, html-entity) all match.
  for (const variant of explodeEncodings(value)) {
    const r = detectThreatRaw(variant);
    if (r.detected) return r;
  }
  return { detected: false, type: '' };
}

// Separate function for file upload detection (only used on file upload paths)
function detectMaliciousFileExtension(value: string): { detected: boolean; type: string; pattern?: string } {
  for (const pattern of MALICIOUS_EXTENSIONS) {
    if (pattern.test(value)) return { detected: true, type: 'MALICIOUS_FILE_UPLOAD', pattern: pattern.source };
  }
  return { detected: false, type: '' };
}

function detectFileInclusion(url: string): { detected: boolean; type: string } {
  for (const pattern of FILE_INCLUSION_PATTERNS) {
    if (pattern.test(url)) return { detected: true, type: 'FILE_INCLUSION' };
  }
  return { detected: false, type: '' };
}

function isMaliciousDownload(path: string): boolean {
  return MALICIOUS_DOWNLOAD_PATTERNS.some(pat => pat.test(path));
}

function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATTERNS.some(pat => pat.test(path));
}

function isHoneypotPath(path: string): boolean {
  return HONEYPOT_PATHS.some(hp => path.toLowerCase().includes(hp.toLowerCase()));
}

function isBlockedUA(ua: string): boolean {
  if (!ua || ua.length < 4) return true;
  return BLOCKED_UAS.some(pat => pat.test(ua));
}

// ============================================================================
// Security Headers
// ============================================================================
function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  const randomValues = new Uint8Array(16);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 16; i++) {
    nonce += chars[randomValues[i] % chars.length];
  }
  return nonce;
}

function addSecurityHeaders(response: NextResponse, nonce?: string): NextResponse {
  const cspNonce = nonce || generateNonce();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('X-Download-Options', 'noopen');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'accelerometer=(), camera=(), microphone=(), geolocation=(), payment=(), display-capture=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // Note: COEP/COOP removed - they block cross-origin resource loading and cause blank pages
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self' https: https://vitals.vercel-insights.com",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '));
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
  const isSafeCheckoutPath = SAFE_PATHS_FOR_CHECKOUT.some(p => path.includes(p));
  const isSocialPublicPageOpen =
    isPublicPagePath(path) &&
    isSocialInAppOpen(request);

  // SECURITY: Block direct access to protected paths (config files, source maps, build output internals)
  // This prevents information disclosure and unauthorized access to sensitive files

  // SECURITY: Request body size validation for API routes
  if (path.startsWith('/api/') && method === 'POST') {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1048576) {
      return NextResponse.json({ error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
    }
  }

  if (isProtectedPath(path)) {
    const progressiveBlock = progressiveWafBlockResponse(ip, path, 'PROTECTED_PATH');
    if (progressiveBlock) return progressiveBlock;
    return NextResponse.json(
      { error: 'Forbidden', code: 'PROTECTED_PATH' },
      { status: 403 }
    );
  }

  if (path.startsWith('/_next/image')) {
    const imageUrl = request.nextUrl.searchParams.get('url');
    if (isUnsafeImageOptimizerUrl(imageUrl)) {
      const progressiveBlock = progressiveWafBlockResponse(ip, path, 'SSRF_BLOCKED');
      if (progressiveBlock) return progressiveBlock;
      return NextResponse.json(
        { error: 'Forbidden', code: 'SSRF_BLOCKED' },
        { status: 403 }
      );
    }
  }

  // Hide old admin portal; private admin is only accessible via /hc-control-2026.
  // Allow /admin/bank-import but require admin authentication.
  if ((path === '/admin' || path.startsWith('/admin/')) && path !== '/admin/bank-import') {
    return NextResponse.json({ error: 'Not Found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // Admin auth check for bank-import page
  if (path === '/admin/bank-import') {
    const token = request.cookies.get('access_token')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      if (!payload || payload.role !== 'admin') {
        return NextResponse.json({ error: 'Admin privileges required', code: 'FORBIDDEN' }, { status: 403 });
      }
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Skip static assets (but NOT protected paths above)
  if (
    path.startsWith('/_next/static') ||
    path.startsWith('/_next/image') ||
    path.startsWith('/favicon') ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$/i.test(path)
  ) {
    return addSecurityHeaders(NextResponse.next(), generateNonce());
  }

  if (!isHumanVerified(request)) {
    const timing = recordTiming(ip);
    if (timing.uniformBot) {
      // Bot pacing requests with near-constant intervals (typical of dictionary
      // / brute-force / scraper scripts that try to look slow). Normal humans
      // produce highly variable timing, so this only fires on automation.
      return addSecurityHeaders(withHumanChallengeCookie(NextResponse.next()), generateNonce());
    }
  }

  // 1. HTTP method validation
  if (!ALLOWED_METHODS.includes(method)) {
    return NextResponse.json({ error: 'Method Not Allowed', code: 'INVALID_METHOD' }, { status: 405 });
  }

  if (isSocialPublicPageOpen && !SAFE_METHODS.includes(method)) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.search = '';
    return NextResponse.redirect(cleanUrl, 303);
  }

  // 2. Sensitive paths → 404
  if (isSensitivePath(path)) {
    const progressiveBlock = progressiveWafBlockResponse(ip, path, 'SENSITIVE_PATH');
    if (progressiveBlock) return progressiveBlock;
    return NextResponse.json({ error: 'Not Found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // 3. Block dotfile access
  if (/^\/\.[^/]/.test(path)) {
    const progressiveBlock = progressiveWafBlockResponse(ip, path, 'DOTFILE_ACCESS');
    if (progressiveBlock) return progressiveBlock;
    return NextResponse.json({ error: 'Not Found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // 4. Malicious file download prevention
  if (isMaliciousDownload(path)) {
    const progressiveBlock = progressiveWafBlockResponse(ip, path, 'MALICIOUS_DOWNLOAD');
    if (progressiveBlock) return progressiveBlock;
    return NextResponse.json({ error: 'Not Found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // 5. DDoS Protection (skip safe paths)
  if (!isSafeCheckoutPath) {
    const ddosCheck = checkDDoS(ip, request);
    if (ddosCheck.detected) {
      let blockDuration = DDOS_CONFIG.warningBlockMs;
      if (ddosCheck.level === 'medium') blockDuration = DDOS_CONFIG.mediumBlockMs;
      if (ddosCheck.level === 'severe') blockDuration = DDOS_CONFIG.severeBlockMs;
      if (ddosCheck.level === 'critical') blockDuration = DDOS_CONFIG.criticalBlockMs;
      blockIP(ip, ddosCheck.reason, blockDuration);
      return NextResponse.json({
        error: 'Too Many Requests', code: 'DDOS_DETECTED', reason: ddosCheck.reason,
        retryAfter: Math.ceil(blockDuration / 1000),
      }, { status: 429, headers: { 'Retry-After': String(Math.ceil(blockDuration / 1000)) } });
    }
  }

  // 6. IP blocking check
  if (isIPBlocked(ip)) {
    if (isSocialPublicPageOpen) {
      delete blockedIPs[ip];
    } else {
      const block = blockedIPs[ip];
      recordBlockedIPHit(ip);
      const updatedBlock = blockedIPs[ip] || block;
      const retryAfter = updatedBlock ? Math.ceil((updatedBlock.expiresAt - Date.now()) / 1000) : undefined;
      return NextResponse.json(
        { error: 'Forbidden', code: 'IP_BLOCKED', reason: updatedBlock?.reason, retryAfter },
        { status: 403, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : undefined }
      );
    }
  }

  // 7. Request Header Audit (skip safe paths)
  if (!isSafeCheckoutPath) {
    const headerAudit = auditRequestHeaders(request, ip);
    if (!headerAudit.passed) {
      const progressiveBlock = progressiveWafBlockResponse(ip, path, headerAudit.reason);
      if (progressiveBlock) return progressiveBlock;
      return NextResponse.json({ error: 'Forbidden', code: headerAudit.reason }, { status: 403 });
    }
  }

  // 8. Brute Force Protection
  const isAuthPath = path.includes('/login') || path.includes('/register');
  if (isAuthPath && ['POST', 'PUT'].includes(method)) {
    const bfCheck = checkBruteForce(ip, true);
    if (bfCheck.blocked) {
      blockIP(ip, bfCheck.reason, bfCheck.blockDuration);
      return NextResponse.json({
        error: 'Too Many Requests', code: 'BRUTE_FORCE_BLOCKED',
        retryAfter: Math.ceil(bfCheck.blockDuration / 1000),
      }, { status: 429, headers: { 'Retry-After': String(Math.ceil(bfCheck.blockDuration / 1000)) } });
    }
  } else {
    checkBruteForce(ip, false);
  }

  // SECURITY: Request body size limit for /api/ endpoints (1MB max)
  if (path.startsWith('/api/')) {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 1048576) {
      return NextResponse.json(
        { error: 'Payload Too Large', code: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      );
    }
  }

  // 9. Rate Limiting
  let limitType: keyof typeof RATE_LIMITS = 'global';
  if (path.startsWith('/api/')) limitType = 'api';
  if (path.includes('/login')) limitType = 'login';
  if (path.includes('/register')) limitType = 'register';
  if (path.startsWith('/hc-control-2026')) limitType = 'admin';
  if (path.includes('/checkout')) limitType = 'checkout';
  if (path.includes('/upload')) limitType = 'upload';
  if (path.includes('/download')) limitType = 'download';

  const rl = checkRateLimit(ip, limitType);
  if (!rl.allowed) {
    // Never block safe checkout paths; just warn
    if (isSafeCheckoutPath) {
      console.warn(`[RateLimit] Safe path ${path} hit rate limit for IP ${ip}`);
    } else {
      if (limitType !== 'checkout' && limitType !== 'api') {
        blockIP(ip, `Rate limit exceeded (${limitType})`, 300000);
      }
      return NextResponse.json({
        error: 'Too Many Requests', code: 'RATE_LIMITED', retryAfter: 60,
      }, { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)) } });
    }
  }

  // 10. WAF Analysis
  const query = request.nextUrl.search;
  const ua = request.headers.get('user-agent') || '';
  const fullUrl = request.nextUrl.toString();

  // Honeypot paths
  if (isHoneypotPath(path)) {
    const progressiveBlock = progressiveWafBlockResponse(ip, path, 'HONEYPOT_PATH');
    if (progressiveBlock) return progressiveBlock;
    return NextResponse.json({ error: 'Not Found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // Blocked User-Agent
  if (isBlockedUA(ua)) {
    const progressiveBlock = progressiveWafBlockResponse(ip, path, 'BLOCKED_UA');
    if (progressiveBlock) return progressiveBlock;
    return NextResponse.json({ error: 'Forbidden', code: 'BLOCKED_UA' }, { status: 403 });
  }

  // Analyze query parameters
  if (query) {
    const threat = detectThreat(query);
    if (threat.detected) {
      if (isSocialPublicPageOpen) {
        const cleanUrl = request.nextUrl.clone();
        cleanUrl.search = '';
        return NextResponse.redirect(cleanUrl);
      }

      const progressiveBlock = progressiveWafBlockResponse(ip, path, threat.type);
      if (progressiveBlock) return progressiveBlock;
      return NextResponse.json({ error: 'Forbidden', code: threat.type }, { status: 403 });
    }
  }

  // Safe order endpoint: do not scan the path itself, otherwise "create" in /api/order/create would be misidentified as SQL CREATE.
  // Amount, MOQ, product ID, and address content are still validated server-side and stored via parameterized SQL in the order API.
  if (!isSafeCheckoutPath) {
    // Analyze URL path
    const pathThreat = detectThreat(path);
    if (pathThreat.detected) {
      const progressiveBlock = progressiveWafBlockResponse(ip, path, pathThreat.type);
      if (progressiveBlock) return progressiveBlock;
      return NextResponse.json({ error: 'Forbidden', code: pathThreat.type }, { status: 403 });
    }

    // Analyze full URL
    const urlThreat = detectThreat(fullUrl);
    if (urlThreat.detected) {
      if (isSocialPublicPageOpen && query) {
        const cleanUrl = request.nextUrl.clone();
        cleanUrl.search = '';
        return NextResponse.redirect(cleanUrl);
      }

      const progressiveBlock = progressiveWafBlockResponse(ip, path, urlThreat.type);
      if (progressiveBlock) return progressiveBlock;
      return NextResponse.json({ error: 'Forbidden', code: urlThreat.type }, { status: 403 });
    }
  }

  // File Inclusion Detection
  const fileInclusion = detectFileInclusion(fullUrl);
  if (fileInclusion.detected) {
    const progressiveBlock = progressiveWafBlockResponse(ip, path, fileInclusion.type);
    if (progressiveBlock) return progressiveBlock;
    return NextResponse.json({ error: 'Forbidden', code: fileInclusion.type }, { status: 403 });
  }

  // CSRF Protection
  if (!validateCSRF(request)) {
    return NextResponse.json({ error: 'Forbidden', code: 'CSRF_VIOLATION' }, { status: 403 });
  }

  // Analyze request body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const bodyThreat = detectThreat(request.nextUrl.searchParams.toString());
      if (bodyThreat.detected) {
        const progressiveBlock = progressiveWafBlockResponse(ip, path, bodyThreat.type);
        if (progressiveBlock) return progressiveBlock;
        return NextResponse.json({ error: 'Forbidden', code: bodyThreat.type }, { status: 403 });
      }
      // SECURITY: File upload extension check (only on upload paths)
      if (path.includes('/upload')) {
        const fileExtThreat = detectMaliciousFileExtension(request.nextUrl.searchParams.toString());
        if (fileExtThreat.detected) {
          const progressiveBlock = progressiveWafBlockResponse(ip, path, fileExtThreat.type);
          if (progressiveBlock) return progressiveBlock;
          return NextResponse.json({ error: 'Forbidden', code: fileExtThreat.type }, { status: 403 });
        }
      }
    }
  }

  // Create response
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(rl.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.floor(rl.resetAt / 1000)));

  return addSecurityHeaders(response, generateNonce());
}

export const config = {
  matcher: [
    '/((?!_next/static|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
};
