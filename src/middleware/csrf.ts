/**
 * CSRF Protection Middleware
 * Implements double-submit cookie pattern for CSRF protection
 */

import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

// Cookie name for CSRF token
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

// Token validity duration (1 hour)
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000;

// In-memory token store (use Redis in production)
const tokenStore = new Map<string, { token: string; expiresAt: number }>();

/**
 * Generate a new CSRF token
 */
export function generateCSRFToken(sessionId: string): string {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + CSRF_TOKEN_EXPIRY;

  // Store token with session association
  tokenStore.set(sessionId, { token, expiresAt });

  // Clean up expired tokens
  cleanupExpiredTokens();

  return token;
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(
  sessionId: string,
  token: string
): { valid: boolean; error?: string } {
  if (!token) {
    return { valid: false, error: 'CSRF token is missing' };
  }

  if (!sessionId) {
    return { valid: false, error: 'Session ID is missing' };
  }

  const stored = tokenStore.get(sessionId);

  if (!stored) {
    return { valid: false, error: 'CSRF token not found' };
  }

  // Check expiration
  if (Date.now() > stored.expiresAt) {
    tokenStore.delete(sessionId);
    return { valid: false, error: 'CSRF token has expired' };
  }

  // Constant-time comparison
  if (!timingSafeEqual(token, stored.token)) {
    return { valid: false, error: 'Invalid CSRF token' };
  }

  return { valid: true };
}

/**
 * Get CSRF token from request
 */
export function getCSRFToken(request: NextRequest): string | null {
  // Try header first
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken) {
    return headerToken;
  }

  // Try cookie
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

/**
 * Set CSRF cookie with SameSite=Strict
 */
export async function setCSRFCookie(): Promise<string> {
  const token = randomBytes(32).toString('hex');

  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Needs to be readable by JS for header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TOKEN_EXPIRY / 1000,
    path: '/',
  });

  return token;
}

/**
 * Set any cookie with SameSite=Strict
 */
export async function setStrictCookie(
  name: string,
  value: string,
  options: { httpOnly?: boolean; maxAge?: number; path?: string } = {}
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(name, value, {
    httpOnly: options.httpOnly ?? true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: options.maxAge,
    path: options.path || '/',
  });
}

/**
 * CSRF token generation endpoint handler
 * GET /api/csrf/token
 */
export async function csrfTokenEndpoint(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.cookies.get('access_token')?.value || randomBytes(16).toString('hex');
  const token = generateCSRFToken(sessionId);

  // Set the token in a cookie as well (double-submit pattern)
  const response = NextResponse.json({ success: true, token });
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TOKEN_EXPIRY / 1000,
    path: '/',
  });

  return response;
}

/**
 * Enhanced CSRF middleware function for API routes
 * Validates CSRF tokens on ALL state-changing requests (POST/PUT/DELETE/PATCH)
 */
export function csrfProtection(
  request: NextRequest,
  sessionId?: string
): NextResponse | null {
  // Only validate POST, PUT, DELETE, PATCH methods
  const sensitiveMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

  if (!sensitiveMethods.includes(request.method)) {
    return null; // Skip for GET, HEAD, OPTIONS
  }

  // Skip CSRF validation for specific safe paths (webhooks, health checks)
  const path = request.nextUrl.pathname;
  const skipPaths = ['/api/webhook', '/api/health', '/api/csrf/token'];
  if (skipPaths.some(skip => path.startsWith(skip))) {
    return null;
  }

  // Get session ID from access_token cookie or generate a fallback
  const effectiveSessionId = sessionId || request.cookies.get('access_token')?.value || '';

  const token = getCSRFToken(request);
  const validation = validateCSRFToken(effectiveSessionId, token || '');

  if (!validation.valid) {
    console.warn(`[CSRF] Validation failed for path ${path}: ${validation.error}`);

    return NextResponse.json(
      {
        success: false,
        error: 'CSRF validation failed',
        code: 'CSRF_INVALID',
      },
      {
        status: 403,
        headers: {
          'X-CSRF-Status': 'invalid',
        },
      }
    );
  }

  return null; // Valid CSRF token, continue
}

/**
 * Validate CSRF for state-changing requests in middleware
 * Use this in the main middleware for comprehensive protection
 */
export function validateCSRFMiddleware(request: NextRequest): boolean {
  const sensitiveMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (!sensitiveMethods.includes(request.method)) {
    return true;
  }

  const path = request.nextUrl.pathname;
  const skipPaths = ['/api/webhook', '/api/health', '/api/csrf/token'];
  if (skipPaths.some(skip => path.startsWith(skip))) {
    return true;
  }

  const sessionId = request.cookies.get('access_token')?.value || '';
  const token = getCSRFToken(request);

  if (!token) {
    return false;
  }

  const validation = validateCSRFToken(sessionId, token);
  return validation.valid;
}

/**
 * Create CSRF error response
 */
export function csrfError(message = 'CSRF token validation failed'): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: 'CSRF_ERROR',
    },
    {
      status: 403,
      headers: {
        'X-CSRF-Status': 'invalid',
      },
    }
  );
}

/**
 * Get or create CSRF token for a session
 */
export async function getOrCreateCSRFToken(sessionId: string): Promise<string> {
  const existing = tokenStore.get(sessionId);

  if (existing && Date.now() < existing.expiresAt) {
    return existing.token;
  }

  return generateCSRFToken(sessionId);
}

/**
 * Clean up expired tokens
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  tokenStore.forEach((value, key) => {
    if (now > value.expiresAt) keysToDelete.push(key);
  });
  keysToDelete.forEach(key => tokenStore.delete(key));
}

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// ============================================================================
// React Hook Helper (for client components)
// ============================================================================

/**
 * Generate CSRF token for client-side usage
 * This would be called from an API route and returned to the client
 */
export async function createCSRFTokenForClient(): Promise<string> {
  const token = randomBytes(32).toString('hex');

  const cookieStore = await cookies();
  await cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TOKEN_EXPIRY / 1000,
    path: '/',
  });

  return token;
}

// ============================================================================
// Exports
// ============================================================================

export const csrfProtectionModule = {
  generateCSRFToken,
  validateCSRFToken,
  getCSRFToken,
  setCSRFCookie,
  setStrictCookie,
  csrfProtection,
  validateCSRFMiddleware,
  csrfTokenEndpoint,
  csrfError,
  getOrCreateCSRFToken,
  createCSRFTokenForClient,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
};

export default csrfProtectionModule;
