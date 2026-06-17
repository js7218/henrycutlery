/**
 * Data Masking Utilities
 * Comprehensive PII masking functions for frontend display
 */

// ============================================================================
// Phone Number Masking
// ============================================================================

/**
 * Mask Chinese phone number: 13812345678 -> 138****5678
 */
export function maskPhone(phone: string | number): string {
  if (!phone) return '';
  
  const str = String(phone);
  
  // Chinese phone number: 11 digits starting with 1
  if (/^1[3-9]\d{9}$/.test(str)) {
    return `${str.substring(0, 3)}****${str.substring(7)}`;
  }
  
  // Generic masking for other phone formats
  if (str.length >= 7) {
    const visibleStart = Math.ceil(str.length * 0.3);
    const visibleEnd = Math.floor(str.length * 0.7);
    return str.substring(0, visibleStart) + '*'.repeat(str.length - visibleStart - (str.length - visibleEnd)) + str.substring(visibleEnd);
  }
  
  return '*'.repeat(str.length);
}

/**
 * Mask phone for partial display (e.g., in verification)
 */
export function maskPhonePartial(phone: string): { masked: string; last4: string } {
  const str = String(phone);
  const last4 = str.slice(-4);
  return {
    masked: maskPhone(phone),
    last4,
  };
}

// ============================================================================
// Email Masking
// ============================================================================

/**
 * Mask email address: test@example.com -> t***t@example.com
 * or for shorter local parts: t@example.com -> t@ex.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '';
  
  const [local, domain] = email.split('@');
  
  if (!local || !domain) return '[INVALID_EMAIL]';
  
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  
  if (local.length <= 4) {
    return `${local[0]}***@${domain}`;
  }
  
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Mask email for display: show domain only
 */
export function maskEmailMinimal(email: string): string {
  if (!email || !email.includes('@')) return '';
  
  const domain = email.split('@')[1];
  return `***@${domain}`;
}

// ============================================================================
// ID Card Masking
// ============================================================================

/**
 * Mask Chinese ID card: 110101199001011234 -> 110***********1234
 */
export function maskIDCard(idCard: string): string {
  if (!idCard) return '';
  
  // Chinese ID card: 18 digits or 17 digits + X
  if (/^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard)) {
    return `${idCard.substring(0, 3)}***********${idCard.substring(14)}`;
  }
  
  // Generic ID card masking
  if (idCard.length >= 8) {
    return `${idCard.substring(0, 3)}********${idCard.substring(idCard.length - 4)}`;
  }
  
  return '*'.repeat(idCard.length);
}

// ============================================================================
// Name Masking
// ============================================================================

/**
 * Mask Chinese name: 张三 -> 张*
 * 王小明 -> 王***
 * Alexander -> A******
 */
export function maskName(name: string, showLast = false): string {
  if (!name) return '';
  
  // Check if Chinese name (mostly Chinese characters)
  if (/^[\u4e00-\u9fa5]+$/.test(name)) {
    if (name.length === 1) return name;
    if (name.length === 2) return `${name[0]}*`;
    return `${name[0]}${'*'.repeat(name.length - 1)}`;
  }
  
  // English name
  if (name.length <= 2) return name;
  if (showLast) {
    return '*'.repeat(name.length - 1) + name[name.length - 1];
  }
  return name[0] + '*'.repeat(name.length - 1);
}

/**
 * Mask name keeping first character
 */
export function maskNameFirst(name: string): string {
  return maskName(name, false);
}

/**
 * Mask name keeping last character
 */
export function maskNameLast(name: string): string {
  return maskName(name, true);
}

// ============================================================================
// Address Masking
// ============================================================================

/**
 * Mask detailed address: keep province/city only + partial detail
 * 北京市朝阳区某某街道123号 -> 北京市朝阳区***
 */
export function maskAddress(address: string, showChars = 0): string {
  if (!address) return '';
  
  // If very short, mask all
  if (address.length <= 5) {
    return '*'.repeat(address.length);
  }
  
  // Keep first 6 chars + original length indicator
  if (showChars === 0) {
    // For Chinese addresses, keep province + city (usually 6-9 chars)
    const visibleChars = 9;
    if (address.length <= visibleChars) {
      return address;
    }
    return address.substring(0, visibleChars) + '***';
  }
  
  // Custom visible chars
  if (address.length <= showChars) {
    return address;
  }
  return address.substring(0, showChars) + '***';
}

/**
 * Mask address keeping only province and city
 */
export function maskAddressMinimal(address: string): string {
  if (!address) return '';
  
  // Try to extract province and city
  const match = address.match(/^([^市省区]+[省市]?)([^市]+[市])?/);
  if (match) {
    const province = match[1] || '';
    const city = match[2] || '';
    if (province || city) {
      return (province + city).trim() + '***';
    }
  }
  
  return maskAddress(address, 6);
}

// ============================================================================
// Payment Card Masking
// ============================================================================

/**
 * Mask credit card: 6222021234567890123 -> **** **** **** 9012
 */
export function maskCreditCard(cardNumber: string): string {
  if (!cardNumber) return '';
  
  // Remove spaces and dashes
  const clean = cardNumber.replace(/[\s-]/g, '');
  
  // Only show last 4 digits
  if (clean.length >= 13 && clean.length <= 19) {
    return `**** **** **** ${clean.slice(-4)}`;
  }
  
  // Generic masking
  if (clean.length >= 8) {
    return '*'.repeat(clean.length - 4) + clean.slice(-4);
  }
  
  return '*'.repeat(clean.length);
}

/**
 * Mask bank account: same as credit card
 */
export const maskBankAccount = maskCreditCard;

// ============================================================================
// IP Address Masking
// ============================================================================

/**
 * Mask IP address: 192.168.1.100 -> 192.168.***.***
 */
export function maskIP(ip: string): string {
  if (!ip) return '';
  
  // IPv4
  const ipv4Match = ip.match(/^(\d{1,3}\.)(\d{1,3}\.)(\d{1,3}\.)(\d{1,3})$/);
  if (ipv4Match) {
    return `${ipv4Match[1]}${ipv4Match[2]}***${ipv4Match[4]}`;
  }
  
  // IPv6 (simplified)
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 4) {
      return `${parts[0]}:${parts[1]}:***:${parts[parts.length - 1]}`;
    }
  }
  
  return '***.***.***.***';
}

/**
 * Mask IP partially for logs
 */
export function maskIPForLog(ip: string): string {
  if (!ip) return '';
  
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.${parts[3]}`;
  }
  
  return '***.***.***.***';
}

// ============================================================================
// Generic Masking Functions
// ============================================================================

/**
 * Mask string keeping first and last characters
 */
export function maskMiddle(text: string, visibleEnds = 2): string {
  if (!text || text.length <= visibleEnds * 2) {
    return '*'.repeat(text?.length || 0);
  }
  
  const start = text.substring(0, visibleEnds);
  const end = text.substring(text.length - visibleEnds);
  const middle = '*'.repeat(Math.min(text.length - visibleEnds * 2, 8));
  
  return start + middle + end;
}

/**
 * Mask string keeping only first few characters
 */
export function maskStart(text: string, visibleChars = 3): string {
  if (!text || text.length <= visibleChars) {
    return '*'.repeat(text?.length || 0);
  }
  
  return text.substring(0, visibleChars) + '*'.repeat(text.length - visibleChars);
}

/**
 * Mask string keeping only last few characters
 */
export function maskEnd(text: string, visibleChars = 4): string {
  if (!text || text.length <= visibleChars) {
    return '*'.repeat(text?.length || 0);
  }
  
  return '*'.repeat(text.length - visibleChars) + text.substring(text.length - visibleChars);
}

/**
 * Completely redact a value
 */
export function redact(text: string): string {
  return '[REDACTED]';
}

/**
 * Completely remove a value
 */
export function remove(text: string): string {
  return '[REMOVED]';
}

/**
 * Replace with placeholder
 */
export function placeholder(text: string, type: string): string {
  return `[${type.toUpperCase()}]`;
}

// ============================================================================
// User Object Masking
// ============================================================================

export interface MaskedUser {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

/**
 * Mask all PII fields in a user object
 */
export function maskUser(user: Partial<MaskedUser>): MaskedUser {
  return {
    id: user.id || '',
    name: user.name ? maskName(user.name) : undefined,
    email: user.email ? maskEmail(user.email) : undefined,
    phone: user.phone ? maskPhone(user.phone) : undefined,
    address: user.address ? maskAddress(user.address) : undefined,
  };
}

/**
 * Create safe user display object (for API responses)
 */
export function safeUserDisplay(user: {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  addresses?: Array<{
    name?: string;
    phone?: string;
    detail?: string;
  }>;
}): {
  id: string;
  name: string;
  email: string;
  phone: string;
  addresses: Array<{
    name: string;
    phone: string;
    detail: string;
  }>;
} {
  return {
    id: user.id,
    name: user.name ? maskName(user.name) : '[未设置]',
    email: user.email ? maskEmail(user.email) : '[未设置]',
    phone: user.phone ? maskPhone(user.phone) : '[未设置]',
    addresses: (user.addresses || []).map(addr => ({
      name: addr.name ? maskName(addr.name) : '[未设置]',
      phone: addr.phone ? maskPhone(addr.phone) : '[未设置]',
      detail: addr.detail ? maskAddress(addr.detail) : '[未设置]',
    })),
  };
}

// ============================================================================
// Order Object Masking
// ============================================================================

export interface MaskedOrder {
  id: string;
  total: number;
  shippingAddress?: string;
  contactPhone?: string;
}

/**
 * Create safe order display object
 */
export function safeOrderDisplay(order: MaskedOrder): MaskedOrder {
  return {
    id: order.id,
    total: order.total,
    shippingAddress: order.shippingAddress ? maskAddress(order.shippingAddress) : undefined,
    contactPhone: order.contactPhone ? maskPhone(order.contactPhone) : undefined,
  };
}

// ============================================================================
// Bulk Masking
// ============================================================================

/**
 * Mask all sensitive fields in an object
 */
export function maskSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  fieldsToMask: string[]
): T {
  const masked = { ...obj };
  
  for (const field of fieldsToMask) {
    if (field in masked && typeof masked[field] === 'string') {
      (masked as Record<string, unknown>)[field] = redact(String(masked[field]));
    }
  }
  
  return masked;
}

/**
 * Remove L1 fields completely (never return to client)
 */
export function removeL1Fields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const l1Fields = [
    'password', 'passwordHash', 'salt', 'creditCard', 'cvv', 
    'idCard', 'ssn', 'secretKey', 'privateKey', 'apiKey',
  ];
  
  const cleaned: Record<string, unknown> = { ...obj };
  
  for (const field of l1Fields) {
    delete cleaned[field];
  }
  
  return cleaned as Partial<T>;
}

/**
 * Mask L2 fields for client display
 */
export function maskL2Fields<T extends Record<string, unknown>>(obj: T): T {
  const masked = { ...obj };
  
  const l2Fields: Record<string, (val: unknown) => string> = {
    phone: (v) => maskPhone(String(v)),
    email: (v) => maskEmail(String(v)),
    realName: (v) => maskName(String(v)),
    name: (v) => maskName(String(v)),
    address: (v) => maskAddress(String(v)),
    ipAddress: (v) => maskIP(String(v)),
    idCard: (v) => maskIDCard(String(v)),
    creditCardNumber: (v) => maskCreditCard(String(v)),
  };
  
  for (const [field, masker] of Object.entries(l2Fields)) {
    if (field in masked && typeof masked[field] === 'string') {
      (masked as Record<string, unknown>)[field] = masker(masked[field]);
    }
  }
  
  return masked as T;
}

// ============================================================================
// CSS Class for preventing selection
// ============================================================================

/**
 * Get CSS class name for preventing text selection/copy
 * Used in components to protect sensitive data display
 */
export function getNoSelectClass(): string {
  return 'select-none user-select-none';
}

// ============================================================================
// Exports
// ============================================================================

export const masking = {
  maskPhone,
  maskPhonePartial,
  maskEmail,
  maskEmailMinimal,
  maskIDCard,
  maskName,
  maskNameFirst,
  maskNameLast,
  maskAddress,
  maskAddressMinimal,
  maskCreditCard,
  maskBankAccount,
  maskIP,
  maskIPForLog,
  maskMiddle,
  maskStart,
  maskEnd,
  redact,
  remove,
  placeholder,
  maskUser,
  safeUserDisplay,
  safeOrderDisplay,
  maskSensitiveFields,
  removeL1Fields,
  maskL2Fields,
  getNoSelectClass,
};

export default masking;
