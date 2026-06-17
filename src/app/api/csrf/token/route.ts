/**
 * CSRF Token Generation Endpoint
 * GET /api/csrf/token
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds

function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

export async function GET(request: NextRequest) {
  const token = generateCSRFToken();

  const response = NextResponse.json({
    success: true,
    token,
  });

  // Set double-submit cookie with SameSite=Strict
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JavaScript for header injection
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TOKEN_EXPIRY,
    path: '/',
  });

  return response;
}
