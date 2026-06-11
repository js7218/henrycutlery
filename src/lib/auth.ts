/**
 * Authentication Security Module
 * Simplified version without Map iteration issues
 */

import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const ACCESS_TOKEN_EXPIRY = 60 * 60;
const REFRESH_TOKEN_EXPIRY = 60 * 60 * 24 * 7;

function base64URLEncode(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64URLDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

export function createJWT(payload: { userId: string; email: string; role: 'user' | 'admin' }): string {
  const header = base64URLEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = base64URLEncode(JSON.stringify({ ...payload, iat: now, exp: now + ACCESS_TOKEN_EXPIRY }));
  const signature = base64URLEncode(createHash('sha256').update(`${header}.${fullPayload}${JWT_SECRET}`).digest('hex'));
  return `${header}.${fullPayload}.${signature}`;
}

export function verifyJWT(token: string): { userId: string; email: string; role: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expectedSig = base64URLEncode(createHash('sha256').update(`${header}.${payload}${JWT_SECRET}`).digest('hex'));
    if (signature !== expectedSig) return null;
    const decoded = JSON.parse(base64URLDecode(payload));
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: decoded.userId, email: decoded.email, role: decoded.role };
  } catch { return null; }
}

export async function setAuthCookies(accessToken: string, refreshToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_EXPIRY,
    path: '/',
    priority: 'high',
  });
  cookieStore.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_EXPIRY,
    path: '/',
    priority: 'high',
  });
}

export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('access_token');
  cookieStore.delete('refresh_token');
}

export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('access_token')?.value || null;
}

export async function getAuthUser(): Promise<{ id: string; email: string; name: string; role: string } | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const payload = verifyJWT(token);
  if (!payload) return null;
  return { id: payload.userId, email: payload.email, name: '', role: payload.role };
}

export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) throw new Error('请先登录');
  return user;
}

export class AuthError extends Error {
  constructor(message: string, public statusCode = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

// Session store using object
const sessions: Record<string, { loginAttempts: number; lockedUntil: number | null }> = {};

export function recordLoginAttempt(identifier: string): { allowed: boolean; attemptsLeft?: number; lockedUntil?: number } {
  const now = Date.now();
  if (!sessions[identifier]) {
    sessions[identifier] = { loginAttempts: 0, lockedUntil: null };
  }
  
  const session = sessions[identifier];
  
  if (session.lockedUntil && now < session.lockedUntil) {
    return { allowed: false, lockedUntil: session.lockedUntil };
  }
  
  if (session.lockedUntil && now >= session.lockedUntil) {
    session.loginAttempts = 0;
    session.lockedUntil = null;
  }
  
  session.loginAttempts++;
  
  if (session.loginAttempts >= 5) {
    session.lockedUntil = now + 15 * 60 * 1000;
    return { allowed: false, lockedUntil: session.lockedUntil };
  }
  
  return { allowed: true, attemptsLeft: 5 - session.loginAttempts };
}

export function resetLoginAttempts(identifier: string): void {
  if (sessions[identifier]) {
    sessions[identifier].loginAttempts = 0;
    sessions[identifier].lockedUntil = null;
  }
}

export const auth = {
  createJWT,
  verifyJWT,
  setAuthCookies,
  clearAuthCookies,
  getAccessToken,
  getAuthUser,
  requireAuth,
  recordLoginAttempt,
  resetLoginAttempts,
  AuthError,
};

export default auth;
