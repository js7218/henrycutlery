/**
 * API Protection Middleware - Simplified
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter, getClientIP } from '@/lib/security';

export function apiResponse<T>(data: T, options?: { status?: number }): NextResponse {
  return NextResponse.json({ success: true, data, timestamp: Date.now() }, { status: options?.status || 200 });
}

export function apiError(message: string, options?: { status?: number }): NextResponse {
  return NextResponse.json(
    { success: false, error: message, timestamp: Date.now() },
    { status: options?.status || 400 }
  );
}

export function applyRateLimit(
  request: NextRequest,
  limit: number = 60,
  windowMs: number = 60000
): NextResponse | null {
  const ip = getClientIP(request as unknown as Request);
  const result = rateLimiter(ip, limit, windowMs);
  
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: '请求过于频繁', retryAfter: result.retryAfter },
      { status: 429, headers: { 'Retry-After': String(result.retryAfter || 60) } }
    );
  }
  
  return null;
}

export const apiProtection = { apiResponse, apiError, applyRateLimit };
export default apiProtection;
