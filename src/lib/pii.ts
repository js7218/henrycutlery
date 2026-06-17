/**
 * PII (Personally Identifiable Information) Definitions
 * Classification and handling of sensitive user data
 */

// ============================================================================
// PII Classification Levels
// ============================================================================

export enum PIILevel {
  /** 
   * L1 - Extremely Sensitive
   * Must NEVER be returned to client or logged in any form
   */
  L1_EXTREMELY_SENSITIVE = 'L1',
  
  /** 
   * L2 - Sensitive
   * Can be stored server-side but must be masked before client display
   */
  L2_SENSITIVE = 'L2',
  
  /** 
   * L3 - General
   * Can be displayed with basic masking
   */
  L3_GENERAL = 'L3',
}

// ============================================================================
// PII Field Definitions
// ============================================================================

export interface PIIField {
  name: string;
  level: PIILevel;
  description: string;
  examples?: string[];
  regex?: RegExp;
}

// L1 - Extremely Sensitive Fields
export const L1_FIELDS: Record<string, PIIField> = {
  password: {
    name: 'password',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '用户密码',
    examples: ['any'],
  },
  passwordHash: {
    name: 'passwordHash',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '密码哈希值',
  },
  salt: {
    name: 'salt',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '密码盐值',
  },
  creditCardNumber: {
    name: 'creditCardNumber',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '信用卡号',
    regex: /\b\d{13,19}\b/,
  },
  cvv: {
    name: 'cvv',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '信用卡CVV',
    regex: /\b\d{3,4}\b/,
  },
  idCardNumber: {
    name: 'idCardNumber',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '身份证号码',
    regex: /\b[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/,
  },
  ssn: {
    name: 'ssn',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '社保号码',
  },
  bankAccount: {
    name: 'bankAccount',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '银行账户',
  },
  secretKey: {
    name: 'secretKey',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '密钥',
  },
  privateKey: {
    name: 'privateKey',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: '私钥',
  },
  apiKey: {
    name: 'apiKey',
    level: PIILevel.L1_EXTREMELY_SENSITIVE,
    description: 'API密钥',
  },
};

// L2 - Sensitive Fields
export const L2_FIELDS: Record<string, PIIField> = {
  phone: {
    name: 'phone',
    level: PIILevel.L2_SENSITIVE,
    description: '手机号码',
    regex: /\b1[3-9]\d{9}\b/,
  },
  email: {
    name: 'email',
    level: PIILevel.L2_SENSITIVE,
    description: '邮箱地址',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  },
  realName: {
    name: 'realName',
    level: PIILevel.L2_SENSITIVE,
    description: '真实姓名',
  },
  address: {
    name: 'address',
    level: PIILevel.L2_SENSITIVE,
    description: '详细地址',
  },
  ipAddress: {
    name: 'ipAddress',
    level: PIILevel.L2_SENSITIVE,
    description: 'IP地址',
    regex: /\b(\d{1,3}\.){3}\d{1,3}\b/,
  },
  macAddress: {
    name: 'macAddress',
    level: PIILevel.L2_SENSITIVE,
    description: 'MAC地址',
    regex: /\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/,
  },
  passportNumber: {
    name: 'passportNumber',
    level: PIILevel.L2_SENSITIVE,
    description: '护照号码',
  },
  driversLicense: {
    name: 'driversLicense',
    level: PIILevel.L2_SENSITIVE,
    description: '驾照号码',
  },
};

// L3 - General Fields
export const L3_FIELDS: Record<string, PIIField> = {
  username: {
    name: 'username',
    level: PIILevel.L3_GENERAL,
    description: '用户名',
  },
  displayName: {
    name: 'displayName',
    level: PIILevel.L3_GENERAL,
    description: '显示名称',
  },
  orderId: {
    name: 'orderId',
    level: PIILevel.L3_GENERAL,
    description: '订单号',
  },
  productId: {
    name: 'productId',
    level: PIILevel.L3_GENERAL,
    description: '商品ID',
  },
};

// ============================================================================
// All PII Fields Registry
// ============================================================================

export const ALL_PII_FIELDS: Record<string, PIIField> = {
  ...L1_FIELDS,
  ...L2_FIELDS,
  ...L3_FIELDS,
};

// ============================================================================
// PII Pattern Detection
// ============================================================================

export const PII_PATTERNS = {
  // Chinese phone number
  phone: /\b1[3-9]\d{9}\b/g,
  
  // Email
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Chinese ID card (18 digits)
  idCard: /\b[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
  
  // Credit card (13-19 digits)
  creditCard: /\b\d{13,19}\b/g,
  
  // Bank account
  bankAccount: /\b\d{16,19}\b/g,
  
  // IP address
  ipAddress: /\b(\d{1,3}\.){3}\d{1,3}\b/g,
  
  // MAC address
  macAddress: /\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
  
  // Password-like strings (common patterns)
  password: /("password"\s*:\s*")[^"]+("|\s)/gi,
  
  // Token patterns
  token: /("token"\s*:\s*")[^"]+("|\s)/gi,
  
  // Bearer token
  bearerToken: /Bearer\s+[A-Za-z0-9._-]+/gi,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a field name indicates sensitive data
 */
export function isSensitiveField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  
  const sensitivePatterns = [
    'password', 'passwd', 'pwd', 'secret', 'token', 'key',
    'ssn', 'social', 'credit', 'card', 'cvv', 'cvc',
    'phone', 'mobile', 'email', 'address', 'name', 'real_name',
    'id_card', 'passport', 'license', 'bank', 'account',
  ];
  
  return sensitivePatterns.some(pattern => lower.includes(pattern));
}

/**
 * Get PII level for a field name
 */
export function getPIILevel(fieldName: string): PIILevel | null {
  const lower = fieldName.toLowerCase();
  
  // Check L1 fields
  for (const [key, field] of Object.entries(L1_FIELDS)) {
    if (lower.includes(key.toLowerCase())) {
      return PIILevel.L1_EXTREMELY_SENSITIVE;
    }
  }
  
  // Check L2 fields
  for (const [key, field] of Object.entries(L2_FIELDS)) {
    if (lower.includes(key.toLowerCase())) {
      return PIILevel.L2_SENSITIVE;
    }
  }
  
  // Check L3 fields
  for (const [key, field] of Object.entries(L3_FIELDS)) {
    if (lower.includes(key.toLowerCase())) {
      return PIILevel.L3_GENERAL;
    }
  }
  
  return null;
}

/**
 * Check if field should NEVER be logged
 */
export function isNeverLogField(fieldName: string): boolean {
  const level = getPIILevel(fieldName);
  return level === PIILevel.L1_EXTREMELY_SENSITIVE;
}

/**
 * Check if field should be masked for client
 */
export function isClientMaskField(fieldName: string): boolean {
  const level = getPIILevel(fieldName);
  return level === PIILevel.L1_EXTREMELY_SENSITIVE || level === PIILevel.L2_SENSITIVE;
}

/**
 * Get all field names that are L1 sensitive
 */
export function getL1FieldNames(): string[] {
  return Object.keys(L1_FIELDS);
}

/**
 * Get all field names that are L2 sensitive
 */
export function getL2FieldNames(): string[] {
  return Object.keys(L2_FIELDS);
}

// ============================================================================
// Data Sanitization Rules
// ============================================================================

export interface SanitizeRule {
  pattern: RegExp;
  replacement: string;
}

export const SANITIZE_RULES: SanitizeRule[] = [
  // Phone numbers -> 138****5678
  { pattern: /(\b1[3-9])(\d{4})(\d{4}\b)/g, replacement: '$1****$3' },
  
  // Email -> t***n@example.com
  { pattern: /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/g, replacement: '[EMAIL]' },
  
  // ID card -> 110***********1234
  { pattern: /\b([1-9]\d{3})(\d{8})(\d{4})\b/g, replacement: '$1**********$3' },
  
  // Credit card -> **** **** **** 1234
  { pattern: /\b(\d{12})(\d{4}\b)/g, replacement: '**** **** **** $2' },
  
  // Bank account -> ************1234
  { pattern: /\b(\d{12})(\d{4,}\b)/g, replacement: '************$2' },
  
  // IP addresses -> 192.168.***.***
  { pattern: /\b(\d{1,3}\.)(\d{1,3}\.)(\d{1,3}\.)(\d{1,3})\b/g, replacement: '$1$2***$4' },
  
  // Password values -> [REDACTED]
  { pattern: /("password"\s*:\s*)"[^"]+"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("passwd"\s*:\s*)"[^"]+"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("pwd"\s*:\s*)"[^"]+"/gi, replacement: '$1"[REDACTED]"' },
  
  // Token values -> [REDACTED]
  { pattern: /("token"\s*:\s*)"[^"]+"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("api[_-]?key"\s*:\s*)"[^"]+"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("secret"\s*:\s*)"[^"]+"/gi, replacement: '$1"[REDACTED]"' },
  
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9._-]+/gi, replacement: 'Bearer [REDACTED]' },
];

// ============================================================================
// Exports
// ============================================================================

export const piiModule = {
  PIILevel,
  L1_FIELDS,
  L2_FIELDS,
  L3_FIELDS,
  ALL_PII_FIELDS,
  PII_PATTERNS,
  isSensitiveField,
  getPIILevel,
  isNeverLogField,
  isClientMaskField,
  getL1FieldNames,
  getL2FieldNames,
  SANITIZE_RULES,
};

export default piiModule;
