/**
 * API Protection Middleware - Enhanced Rate Limiting
 * Implements per-endpoint rate limits and IP-based sliding window rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/security';

// Per-endpoint rate limit configuration
const ENDPOINT_RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  '/api/auth/login': { limit: 5, windowMs: 60 * 1000 },
  '/api/auth/register': { limit: 3, windowMs: 60 * 1000 },
  '/api/auth/send-code': { limit: 3, windowMs: 60 * 1000 },
  '/api/order/create': { limit: 10, windowMs: 60 * 1000 },
};

// Default rate limit for API routes
const DEFAULT_API_LIMIT = 60;
const DEFAULT_API_WINDOW_MS = 60 * 1000;

interface SlidingWindowEntry {
  requests: number[];
  blockedUntil: number | null;
}

const slidingWindowStore: Record<string, SlidingWindowEntry> = {};

function getEndpointConfig(pathname: string): { limit: number; windowMs: number } | null {
  // Exact match first
  if (ENDPOINT_RATE_LIMITS[pathname]) {
    return ENDPOINT_RATE_LIMITS[pathname];
  }
  // Prefix match
  for (const [prefix, config] of Object.entries(ENDPOINT_RATE_LIMITS)) {
    if (pathname.startsWith(prefix)) {
      return config;
    }
  }
  return null;
}

function getSlidingWindowKey(ip: string, pathname: string): string {
  return `sl:${ip}:${pathname}`;
}

function checkSlidingWindow(
  ip: string,
  pathname: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number; retryAfter?: number } {
  const now = Date.now();
  const key = getSlidingWindowKey(ip, pathname);
  const entry = slidingWindowStore[key];

  if (!entry || (entry.blockedUntil && now > entry.blockedUntil)) {
    slidingWindowStore[key] = {
      requests: [now],
      blockedUntil: null,
    };
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.blockedUntil && now <= entry.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.blockedUntil,
      retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }

  // Remove requests outside the sliding window
  const validRequests = entry.requests.filter(ts => now - ts < windowMs);
  validRequests.push(now);

  if (validRequests.length > limit) {
    const blockDuration = windowMs;
    slidingWindowStore[key] = {
      requests: validRequests,
      blockedUntil: now + blockDuration,
    };
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + blockDuration,
      retryAfter: Math.ceil(blockDuration / 1000),
    };
  }

  slidingWindowStore[key] = {
    requests: validRequests,
    blockedUntil: null,
  };

  return {
    allowed: true,
    remaining: Math.max(0, limit - validRequests.length),
    resetAt: now + windowMs,
  };
}

export function apiResponse<T>(data: T, options?: { status?: number }): NextResponse {
  return NextResponse.json({ success: true, data, timestamp: Date.now() }, { status: options?.status || 200 });
}

export function apiError(message: string, options?: { status?: number }): NextResponse {
  return NextResponse.json(
    { success: false, error: message, timestamp: Date.now() },
    { status: options?.status || 400 }
  );
}

/**
 * Apply enhanced rate limiting with per-endpoint limits and sliding window
 */
export function applyRateLimit(
  request: NextRequest,
  limit?: number,
  windowMs?: number
): NextResponse | null {
  const ip = getClientIP(request as unknown as Request);
  const pathname = request.nextUrl.pathname;

  // Check per-endpoint rate limits first
  const endpointConfig = getEndpointConfig(pathname);
  const effectiveLimit = endpointConfig?.limit ?? limit ?? DEFAULT_API_LIMIT;
  const effectiveWindowMs = endpointConfig?.windowMs ?? windowMs ?? DEFAULT_API_WINDOW_MS;

  const result = checkSlidingWindow(ip, pathname, effectiveLimit, effectiveWindowMs);

  if (!result.allowed) {
    const headers: Record<string, string> = {
      'Retry-After': String(result.retryAfter || 60),
      'X-RateLimit-Limit': String(effectiveLimit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    };

    return NextResponse.json(
      {
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        retryAfter: result.retryAfter || 60,
      },
      { status: 429, headers }
    );
  }

  // Attach rate limit info to response headers via a custom property on request (not ideal but works for middleware chaining)
  // In practice, the caller should set these headers on the final response
  return null;
}

/**
 * Get rate limit status for an IP and endpoint (for middleware chaining)
 */
export function getRateLimitStatus(
  request: NextRequest
): { limit: number; remaining: number; resetAt: number } | null {
  const ip = getClientIP(request as unknown as Request);
  const pathname = request.nextUrl.pathname;
  const endpointConfig = getEndpointConfig(pathname);
  const effectiveLimit = endpointConfig?.limit ?? DEFAULT_API_LIMIT;
  const effectiveWindowMs = endpointConfig?.windowMs ?? DEFAULT_API_WINDOW_MS;

  const key = getSlidingWindowKey(ip, pathname);
  const entry = slidingWindowStore[key];
  const now = Date.now();

  if (!entry) {
    return { limit: effectiveLimit, remaining: effectiveLimit, resetAt: now + effectiveWindowMs };
  }

  const validRequests = entry.requests.filter(ts => now - ts < effectiveWindowMs);
  return {
    limit: effectiveLimit,
    remaining: Math.max(0, effectiveLimit - validRequests.length),
    resetAt: entry.blockedUntil || now + effectiveWindowMs,
  };
}

export const apiProtection = { apiResponse, apiError, applyRateLimit, getRateLimitStatus };
export default apiProtection;
