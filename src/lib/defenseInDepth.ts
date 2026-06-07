/**
 * ============================================================================
 * ADAM CUTLERY - DEFENSE IN DEPTH SECURITY SYSTEM (纵深防御安全体系)
 * ============================================================================
 * 
 * Based on OWASP Top 10 (2021) and industry best practices
 * Four layers of defense from basic to advanced
 * 
 * Layer 1: Security Configuration & Operations (基础配置与运维管理)
 * Layer 2: Code Logic & Input Validation (代码逻辑与输入验证)
 * Layer 3: Authentication & Access Control (身份认证与访问控制)
 * Layer 4: Architecture & Advanced Threats (架构设计与高级威胁)
 * ============================================================================
 */

// ============================================================================
// LAYER 1: SECURITY CONFIGURATION & OPERATIONS MANAGEMENT
// 基础配置与运维管理层
// ============================================================================

export const SecurityConfig = {
  // 1.1 Security Headers Configuration (安全响应头)
  headers: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'X-Download-Options': 'noopen',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'accelerometer=(), camera=(), microphone=(), geolocation=(), payment=(), display-capture=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },

  // 1.2 Sensitive Data Protection (敏感数据保护)
  sensitiveData: {
    // Fields that should never be logged or exposed
    piiFields: ['password', 'creditCard', 'cvv', 'ssn', 'token', 'secret'],
    // Fields that should be masked in logs
    maskedFields: ['email', 'phone', 'address', 'name'],
    // Encryption config
    encryption: {
      algorithm: 'AES-256-GCM',
      keyRotationDays: 30,
      ivLength: 12,
    },
    // Data retention
    retention: {
      sessionDataDays: 7,
      orderDataDays: 365,
      logDataDays: 90,
      auditLogDays: 180,
    },
  },

  // 1.3 Software Supply Chain (软件供应链)
  supplyChain: {
    // Allowed external domains
    allowedExternalDomains: [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'cdn.tailwindcss.com',
      'unpkg.com',
      'images.unsplash.com',
    ],
    // Blocked dangerous CDN patterns
    blockedPatterns: [
      /javascript:.*\n.*eval/i,
      /document\.write/i,
      /innerHTML\s*=/i,
      /outerHTML\s*=/i,
    ],
    // Subresource Integrity (SRI) - external scripts must have integrity hash
    sriEnabled: true,
    // Minimum TLS version
    minTLSVersion: 'TLSv1.2',
  },

  // 1.4 Security Configuration Checklist (安全配置检查)
  configChecklist: {
    poweredByHeader: false,        // Remove X-Powered-By
    serverHeader: false,           // Remove Server header
    directoryListing: false,       // Disable directory listing
    sourceMaps: false,             // Disable source maps in production
    errorDetails: false,           // Hide detailed errors from users
    debugMode: false,              // Disable debug mode
    testEndpoints: false,          // Remove test endpoints
    defaultCredentials: false,    // No default credentials
    unnecessaryPorts: false,      // Close unnecessary ports
    stackTraces: false,            // Hide stack traces
  },
};

// ============================================================================
// LAYER 2: CODE LOGIC & INPUT VALIDATION
// 代码逻辑与输入验证层
// ============================================================================

export const InputValidation = {
  // 2.1 SQL Injection Prevention (SQL注入防护)
  sql: {
    // Strict whitelist approach - only allow known-safe patterns
    allowedPatterns: {
      email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      phone: /^1[3-9]\d{9}$/,
      name: /^[\u4e00-\u9fa5a-zA-Z0-9\s._-]{2,50}$/,
      id: /^[a-zA-Z0-9_-]{1,64}$/,
      price: /^\d+(\.\d{1,2})?$/,
      quantity: /^\d+$/,
      address: /^[\u4e00-\u9fa5a-zA-Z0-9\s._#\-\/]{5,200}$/,
    },
    // SQL keywords that are absolutely forbidden in user input
    forbiddenKeywords: [
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
      'TRUNCATE', 'EXEC', 'EXECUTE', 'UNION', 'WAITFOR', 'DELAY',
      'BENCHMARK', 'SLEEP', 'PG_SLEEP', 'LOAD_FILE', 'INTO OUTFILE',
      'INFORMATION_SCHEMA', 'SYS.DATABASES', 'MYSQL.USER', 'PG_CATALOG',
      'OR 1=1', 'AND 1=1', 'OR TRUE', 'AND TRUE',
      '--', '/*', '*/', ';--', 'CHAR(', 'CONCAT(', 'GROUP_CONCAT',
      '0x', 'HEX(', 'UNHEX(', 'ASCII(', 'ORD(',
    ],
    // Parameterized query enforcement flag
    enforceParameterized: true,
  },

  // 2.2 XSS Prevention (XSS防护)
  xss: {
    // HTML encoding map
    htmlEntities: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#96;',
    },
    // Forbidden patterns in user input
    forbiddenPatterns: [
      /<script/i, /<\/script/i,
      /javascript\s*:/i, /vbscript\s*:/i, /data\s*:/i,
      /on\w+\s*=/i,
      /<iframe/i, /<object/i, /<embed/i, /<applet/i,
      /<svg[^>]*on/i, /<img[^>]*on/i,
      /expression\s*\(/i, /url\s*\(\s*javascript:/i,
      /fromcharcode/i, /eval\s*\(/i,
      /document\.(cookie|location|write)/i,
      /window\.(location|open|navigate)/i,
    ],
    // Context-aware output encoding
    encodingContexts: {
      htmlBody: 'htmlEntity',
      htmlAttribute: 'attributeEntity',
      javascript: 'javascriptUnicode',
      url: 'urlEncoding',
      css: 'cssEscape',
    },
  },

  // 2.3 File Upload Security (文件上传安全)
  fileUpload: {
    // Allowed MIME types (whitelist approach)
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'image/svg+xml', 'application/pdf',
    ],
    // Allowed extensions
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf'],
    // Maximum file size (5MB)
    maxSizeBytes: 5 * 1024 * 1024,
    // Image dimensions check
    maxImageWidth: 4096,
    maxImageHeight: 4096,
    // Must check actual file content (magic bytes), not just extension
    verifyMagicBytes: true,
    // Strip EXIF metadata from images
    stripMetadata: true,
    // Rename uploaded files (prevent path traversal)
    renameFiles: true,
    // Store uploads outside web root
    storeOutsideWebRoot: true,
    // Scan for embedded PHP/code in images
    scanForEmbeddedCode: true,
    // Block double extensions
    blockDoubleExtensions: true,
  },

  // 2.4 Command Injection Prevention (命令注入防护)
  commandInjection: {
    // Forbidden characters
    forbiddenChars: /[;&|`$><\(\)\[\]{}\n\r\t]/,
    // Forbidden commands
    forbiddenCommands: [
      'whoami', 'id', 'uname', 'hostname', 'ls', 'cat', 'echo',
      'wget', 'curl', 'nc', 'netcat', 'bash', 'sh', 'cmd',
      'powershell', 'python', 'perl', 'ruby', 'php',
      'rm', 'del', 'chmod', 'chown', 'mkdir', 'rmdir',
    ],
    // Never execute OS commands with user input
    neverExecuteWithInput: true,
  },
};

// ============================================================================
// LAYER 3: AUTHENTICATION & ACCESS CONTROL
// 身份认证与访问控制层
// ============================================================================

export const AuthSecurity = {
  // 3.1 Password Policy (密码策略)
  passwordPolicy: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    // Common weak passwords blacklist
    weakPasswords: [
      '12345678', 'password', 'qwerty', 'admin123', 'letmein',
      'welcome1', 'password1', '123456789', 'abc123', '11111111',
      'iloveyou', 'sunshine', 'princess', 'football', 'charlie',
    ],
    // Password history (prevent reuse)
    historyCount: 5,
    // Password expiration (days)
    expirationDays: 90,
    // Max concurrent sessions
    maxConcurrentSessions: 3,
  },

  // 3.2 Session Security (会话安全)
  session: {
    // Session timeout
    inactiveTimeoutMs: 30 * 60 * 1000,     // 30 minutes
    absoluteTimeoutMs: 24 * 60 * 60 * 1000,  // 24 hours
    // Session ID generation
    sessionIdLength: 32,
    sessionIdEntropy: 128, // bits
    // Cookie settings
    cookie: {
      httpOnly: true,
      secure: true,       // HTTPS only
      sameSite: 'Strict', // Prevent CSRF
      path: '/',
      domain: undefined,   // Use current domain
    },
    // Session fixation protection
    rotateSessionOnLogin: true,
    // Invalidate session on password change
    invalidateOnPasswordChange: true,
    // Bind session to IP (optional, may affect mobile users)
    bindToIP: false,
    // Bind session to User-Agent
    bindToUA: true,
  },

  // 3.3 Access Control - Horizontal (水平越权防护)
  horizontalPrivilege: {
    // Resource ownership verification
    verifyOwnership: true,
    // Use indirect references (map internal IDs to random tokens)
    useIndirectReferences: true,
    // Check: user can only access resources where resource.userId === session.userId
    ownershipCheck: (resourceUserId: string, sessionUserId: string): boolean => {
      return resourceUserId === sessionUserId;
    },
    // Protected resource types
    protectedResources: ['orders', 'addresses', 'favorites', 'cart', 'profile', 'payments'],
  },

  // 3.4 Access Control - Vertical (垂直越权防护)
  verticalPrivilege: {
    // Role hierarchy
    roles: {
      guest: { level: 0, permissions: ['browse_products', 'search'] },
      user: { level: 1, permissions: ['browse_products', 'search', 'cart', 'checkout', 'profile', 'orders', 'favorites', 'addresses'] },
      admin: { level: 2, permissions: ['all'] },
    },
    // Admin paths - only accessible by admin role
    adminPaths: ['/admin', '/api/admin'],
    // Strict role assignment - role is NEVER derived from user input
    roleAssignment: 'server_only',
    // Admin email whitelist (only these can be admin)
    adminEmails: ['admin@adamcutlery.com'],
    // Block admin-like email registration
    blockedEmailPatterns: [
      'admin@', 'administrator@', 'root@', 'system@', 'superuser@',
      'webmaster@', 'hostmaster@', 'postmaster@',
    ],
  },

  // 3.5 CSRF Protection (CSRF防护)
  csrf: {
    // Double-submit cookie pattern
    doubleSubmitCookie: true,
    // Synchronizer token pattern
    synchronizerToken: true,
    // Token length and entropy
    tokenLength: 32,
    tokenEntropy: 128,
    // Protected methods
    protectedMethods: ['POST', 'PUT', 'DELETE', 'PATCH'],
    // Protected paths
    protectedPaths: ['/api/checkout', '/api/profile', '/api/orders', '/api/cart', '/api/address', '/api/payment'],
    // Validate Origin and Referer
    validateOriginReferer: true,
    // Custom header requirement (X-Requested-With)
    requireCustomHeader: true,
  },

  // 3.6 Brute Force Protection (暴力破解防护)
  bruteForce: {
    // Login
    login: {
      maxAttempts: 5,
      // Bot detection: requests < 2s apart
      botDetectionInterval: 2000,
      botDetectionThreshold: 3,
      // Human lock duration
      humanLockMinutes: 15,
      // Bot lock duration (double)
      botLockMinutes: 30,
      // Progressive lockout
      progressiveLockout: {
        5: 15 * 60 * 1000,      // 5 failures → 15 minutes
        10: 60 * 60 * 1000,     // 10 failures → 1 hour
        20: 24 * 60 * 60 * 1000, // 20 failures → 24 hours
      },
    },
    // Register
    register: {
      maxAttempts: 6,
      humanLockMinutes: 30,
      botLockMinutes: 60,
    },
    // Daily auto-unlock at midnight
    dailyUnlock: true,
    unlockTime: '00:00:00',
  },

  // 3.7 Multi-Factor Authentication (MFA - future)
  mfa: {
    enabled: false,
    methods: ['totp', 'sms', 'email'],
    backupCodes: 10,
    // Enforce MFA for admin accounts
    enforceForAdmin: true,
  },
};

// ============================================================================
// LAYER 4: ARCHITECTURE & ADVANCED THREATS
// 架构设计与高级威胁层
// ============================================================================

export const ArchitectureSecurity = {
  // 4.1 Secure Design Principles (安全设计原则)
  design: {
    // Never trust client-side data
    neverTrustClient: true,
    // All business logic on server side
    serverSideLogic: true,
    // Least privilege principle
    leastPrivilege: true,
    // Defense in depth
    defenseInDepth: true,
    // Fail securely (deny by default)
    failSecure: true,
    // Separation of duties
    separationOfDuties: true,
    // Input validation at every layer
    validateAtEveryLayer: true,
    // Secure defaults
    secureDefaults: true,
  },

  // 4.2 Business Logic Protection (业务逻辑防护)
  businessLogic: {
    // Price tampering prevention
    verifyPriceOnServer: true,
    // Order amount limits
    maxOrderAmount: 100000,
    minOrderAmount: 1,
    // Quantity limits per order
    maxQuantityPerItem: 10000,
    // Anti-fraud: velocity checks
    velocityChecks: {
      maxOrdersPerHour: 10,
      maxOrdersPerDay: 50,
      maxTotalAmountPerDay: 500000,
    },
    // Inventory check before order
    verifyInventoryBeforeOrder: true,
    // Prevent order manipulation
    signOrderData: true,
  },

  // 4.3 Zero-Day / Unknown Threat Protection (零日漏洞防护)
  zeroDay: {
    // Runtime Application Self-Protection (RASP) concepts
    rasp: {
      // Monitor for anomalous behavior patterns
      anomalyDetection: true,
      // Block requests with unexpected data types
      typeValidation: true,
      // Monitor response times for injection indicators
      timingAnalysis: true,
    },
    // Virtual patching (WAF rules for known CVEs)
    virtualPatching: true,
    // Input normalization (handle all encoding variants)
    inputNormalization: true,
    // Content-type validation
    strictContentTypeValidation: true,
  },

  // 4.4 DDoS Protection Architecture (DDoS防护架构)
  ddos: {
    // Rate limiting tiers
    rateLimits: {
      global: { requestsPerMinute: 200, burstPerSecond: 30 },
      api: { requestsPerMinute: 100, burstPerSecond: 15 },
      auth: { requestsPerMinute: 10, burstPerSecond: 3 },
      static: { requestsPerMinute: 500, burstPerSecond: 50 },
    },
    // Payload size limits
    maxPayloadSize: '10MB',
    maxUrlLength: 2048,
    maxHeaderSize: 8192,
    maxQueryStringLength: 1024,
    // Connection limits
    maxConnectionsPerIP: 50,
    maxRequestsPerConnection: 100,
    // Progressive response (adaptive rate limiting)
    adaptiveRateLimiting: true,
    // Challenge-response for suspicious traffic
    challengeResponse: true,
    // Geographic blocking (optional)
    geoBlocking: false,
    // IP reputation scoring
    ipReputation: true,
  },

  // 4.5 Logging & Monitoring (日志与监控)
  monitoring: {
    // Security event logging
    logEvents: [
      'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT',
      'REGISTER_SUCCESS', 'REGISTER_FAILURE',
      'PASSWORD_CHANGE', 'PASSWORD_RESET',
      'ORDER_CREATED', 'ORDER_MODIFIED', 'ORDER_CANCELLED',
      'PAYMENT_ATTEMPT', 'PAYMENT_SUCCESS', 'PAYMENT_FAILURE',
      'RATE_LIMIT_EXCEEDED', 'IP_BLOCKED', 'WAF_BLOCKED',
      'CSRF_VIOLATION', 'PRIVILEGE_ESCALATION_ATTEMPT',
      'SQL_INJECTION_ATTEMPT', 'XSS_ATTEMPT', 'FILE_UPLOAD_ATTEMPT',
      'DDOS_DETECTED', 'BRUTE_FORCE_DETECTED',
    ],
    // Alert thresholds
    alerts: {
      failedLoginsPerMinute: 10,
      blockedRequestsPerMinute: 50,
      unusualOrderAmount: 50000,
      multipleAccountsSameIP: 5,
    },
    // Audit trail retention
    auditRetentionDays: 180,
  },

  // 4.6 Incident Response (应急响应)
  incidentResponse: {
    // Auto-block thresholds
    autoBlockThresholds: {
      wafViolations: 3,        // 3 WAF violations → block 1 hour
      bruteForceFailures: 10,  // 10 failures → block 24 hours
      ddosScore: 80,           // DDoS score > 80 → block
    },
    // Emergency kill switch
    emergencyMode: {
      enabled: false,
      blockAllNonAdmin: false,
      showMaintenancePage: false,
    },
  },

  // 4.7 Data Backup & Recovery (数据备份与恢复)
  backup: {
    // Backup frequency
    frequency: 'daily',
    retentionDays: 30,
    // Encryption at rest
    encryptAtRest: true,
    // Geo-redundancy
    geoRedundant: true,
    // Recovery time objective
    rto: '4 hours',
    // Recovery point objective
    rpo: '24 hours',
  },
};

// ============================================================================
// SECURITY AUDIT CHECKLIST (安全审计清单)
// ============================================================================

export const SecurityAuditChecklist = {
  // Layer 1 checks
  layer1: [
    '✅ X-Powered-By header removed',
    '✅ Server header removed',
    '✅ Source maps disabled in production',
    '✅ Directory listing disabled',
    '✅ Debug mode disabled',
    '✅ Test endpoints removed',
    '✅ Default credentials changed',
    '✅ Unnecessary ports closed',
    '✅ Error details hidden from users',
    '✅ Stack traces hidden',
    '✅ HTTPS enforced (HSTS)',
    '✅ Sensitive files blocked (.env, .git, etc.)',
    '✅ Security headers configured',
    '✅ PII data encrypted at rest',
    '✅ Dependencies audited for known CVEs',
  ],
  // Layer 2 checks
  layer2: [
    '✅ All user input validated (whitelist approach)',
    '✅ SQL injection prevention (parameterized queries)',
    '✅ XSS prevention (output encoding)',
    '✅ File upload restrictions (type, size, content)',
    '✅ Command injection prevention',
    '✅ Path traversal prevention',
    '✅ SSRF prevention',
    '✅ Image trojan scanning',
    '✅ PHP/Shell code detection',
    '✅ Input length limits enforced',
  ],
  // Layer 3 checks
  layer3: [
    '✅ Strong password policy enforced',
    '✅ Session management secure (HttpOnly, Secure, SameSite)',
    '✅ Horizontal privilege escalation prevented',
    '✅ Vertical privilege escalation prevented',
    '✅ CSRF tokens implemented',
    '✅ Brute force protection active',
    '✅ Account lockout policy enforced',
    '✅ Daily auto-unlock at midnight',
    '✅ Admin access strictly controlled',
    '✅ Role-based access control (RBAC)',
  ],
  // Layer 4 checks
  layer4: [
    '✅ Business logic validated server-side',
    '✅ Price/order manipulation prevented',
    '✅ Anomaly detection active',
    '✅ DDoS rate limiting multi-tiered',
    '✅ Security event logging enabled',
    '✅ Alert thresholds configured',
    '✅ Incident response plan ready',
    '✅ Data backup configured',
    '✅ Virtual patching active',
    '✅ Input normalization for zero-day protection',
  ],
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================
export default {
  config: SecurityConfig,
  inputValidation: InputValidation,
  auth: AuthSecurity,
  architecture: ArchitectureSecurity,
  audit: SecurityAuditChecklist,
};
