/**
 * Security Utilities
 * Simplified version
 */

import { createHash, randomBytes } from 'crypto';

// Rate limiting
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore: Record<string, RateLimitEntry> = {};

export function rateLimiter(
  identifier: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; resetTime: number; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore[identifier];
  
  if (!entry || now > entry.resetTime) {
    rateLimitStore[identifier] = { count: 1, resetTime: now + windowMs };
    return { success: true, remaining: limit - 1, resetTime: now + windowMs };
  }
  
  if (entry.count < limit) {
    entry.count++;
    return { success: true, remaining: limit - entry.count, resetTime: entry.resetTime };
  }
  
  return {
    success: false,
    remaining: 0,
    resetTime: entry.resetTime,
    retryAfter: Math.ceil((entry.resetTime - now) / 1000),
  };
}

export function getClientIP(request: Request): string {
  const headers = request.headers as Headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIP = headers.get('x-real-ip');
  if (realIP) return realIP;
  return 'unknown';
}

// Sanitization
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

// Validation
export function validateEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  if (typeof phone !== 'string') return false;
  return /^1[3-9]\d{9}$/.test(phone);
}

export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/[a-z]/.test(password)) errors.push('Password must contain lowercase');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain uppercase');
  if (!/[0-9]/.test(password)) errors.push('Password must contain number');
  if (!/[!@#$%^&*]/.test(password)) errors.push('Password must contain special character');
  return { valid: errors.length === 0, errors };
}

// Password hashing (simplified)
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(password + salt).digest('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    const [salt, hash] = hashedPassword.split(':');
    if (!salt || !hash) return false;
    const newHash = createHash('sha256').update(password + salt).digest('hex');
    return newHash === hash;
  } catch { return false; }
}

// CSRF
export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

export function generateSecureToken(length = 32): string {
  return randomBytes(length).toString('hex');
}

// Masking
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 11) return '';
  return `${phone.substring(0, 3)}****${phone.substring(7)}`;
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function maskName(name: string): string {
  if (!name || name.length === 0) return '';
  if (name.length === 1) return name;
  return `${name[0]}${'*'.repeat(name.length - 1)}`;
}

export const security = {
  rateLimiter,
  getClientIP,
  sanitizeInput,
  validateEmail,
  validatePhone,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  generateCSRFToken,
  generateSecureToken,
  maskPhone,
  maskEmail,
  maskName,
};

export default security;
