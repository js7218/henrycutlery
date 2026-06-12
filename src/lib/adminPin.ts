import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

const ADMIN_PIN_COOKIE = 'admin_panel_verified';
const ADMIN_PIN_MAX_AGE_SECONDS = 30 * 60;

function getSigningSecret() {
  return `${process.env.JWT_SECRET || 'dev-secret'}:${getConfiguredAdminPin() || ''}`;
}

export function getConfiguredAdminPin() {
  return (process.env.ADMIN_PANEL_PIN || process.env.ADMIN_PANNEL_PIN || '').trim();
}

export function isAdminPinConfigured() {
  return Boolean(getConfiguredAdminPin());
}

function sign(value: string) {
  return createHmac('sha256', getSigningSecret()).update(value).digest('hex');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyAdminPin(pin: string) {
  const configuredPin = getConfiguredAdminPin();
  return Boolean(configuredPin && safeEqual(pin.trim(), configuredPin));
}

export async function setAdminPinCookie(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_PIN_MAX_AGE_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_PIN_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ADMIN_PIN_MAX_AGE_SECONDS,
    path: '/',
    priority: 'high',
  });
}

export async function clearAdminPinCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_PIN_COOKIE);
}

export async function isAdminPinVerified(userId: string) {
  if (!isAdminPinConfigured()) return false;

  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_PIN_COOKIE)?.value;
  if (!value) return false;

  const parts = value.split('.');
  if (parts.length !== 3) return false;

  const [cookieUserId, expiresAtRaw, signature] = parts;
  if (cookieUserId !== userId) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;

  const payload = `${cookieUserId}.${expiresAtRaw}`;
  return safeEqual(signature, sign(payload));
}
