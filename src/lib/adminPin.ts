import { cookies, headers } from 'next/headers';
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

async function getRequestFingerprint() {
  const headerStore = await headers();
  const ip =
    headerStore.get('cf-connecting-ip') ||
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headerStore.get('x-real-ip') ||
    'unknown';
  const userAgent = headerStore.get('user-agent') || 'unknown';
  return createHmac('sha256', getSigningSecret())
    .update(`${ip}:${userAgent}`)
    .digest('hex')
    .slice(0, 24);
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
  const fingerprint = await getRequestFingerprint();
  const payload = `${userId}.${expiresAt}.${fingerprint}`;
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
  if (parts.length !== 4) return false;

  const [cookieUserId, expiresAtRaw, fingerprint, signature] = parts;
  if (cookieUserId !== userId) return false;
  if (!safeEqual(fingerprint, await getRequestFingerprint())) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;

  const payload = `${cookieUserId}.${expiresAtRaw}.${fingerprint}`;
  return safeEqual(signature, sign(payload));
}
