/**
 * Shipping-fee negotiation helpers.
 *
 * The assistant is only allowed to lower the shipping fee. The floor is
 * computed here on the server and is never exposed to the model or the
 * browser. Accepted amounts are signed into a short-lived quote token that
 * the order API re-verifies before charging.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export interface NegotiationSettings {
  enabled: boolean;
  maxDiscountPct: number;
  floorRatio: number;
  minShippingUsd: number;
}

export const DEFAULT_NEGOTIATION_SETTINGS: NegotiationSettings = {
  enabled: true,
  maxDiscountPct: 30,
  floorRatio: 0.7,
  minShippingUsd: 5,
};

export interface ShippingQuote {
  countryCode: string;
  weightKg: number;
  amountUsd: number;
  exp: number;
}

const QUOTE_TTL_SECONDS = 2 * 60 * 60;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export async function getNegotiationSettings(): Promise<NegotiationSettings> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    `SELECT enabled, max_discount_pct, floor_ratio, min_shipping_usd
     FROM negotiation_settings
     WHERE id = 'default'
     LIMIT 1`
  );

  const row = result.rows[0];
  if (!row) return { ...DEFAULT_NEGOTIATION_SETTINGS };

  return {
    enabled: row.enabled === true,
    maxDiscountPct: finiteOr(Number(row.max_discount_pct), DEFAULT_NEGOTIATION_SETTINGS.maxDiscountPct),
    floorRatio: finiteOr(Number(row.floor_ratio), DEFAULT_NEGOTIATION_SETTINGS.floorRatio),
    minShippingUsd: finiteOr(Number(row.min_shipping_usd), DEFAULT_NEGOTIATION_SETTINGS.minShippingUsd),
  };
}

/**
 * Lowest shipping fee we are willing to accept for this quote.
 * Never above the quote, never negative.
 */
export function floorPriceUsd(quoteUsd: number, s: NegotiationSettings): number {
  const quote = Number.isFinite(quoteUsd) && quoteUsd > 0 ? quoteUsd : 0;
  if (quote <= 0) return 0;

  const byDiscount = quote * (1 - s.maxDiscountPct / 100);
  const byRatio = quote * s.floorRatio;
  const value = round2(Math.max(byDiscount, byRatio, s.minShippingUsd));

  return Math.min(quote, Math.max(0, value));
}

function negotiationSecret(): string {
  const secret = process.env.NEGOTIATION_SECRET || process.env.JWT_SECRET || '';
  if (!secret) {
    throw new Error('NEGOTIATION_SECRET or JWT_SECRET must be configured.');
  }
  return secret;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export interface SignShippingQuoteInput {
  countryCode: string;
  weightKg: number;
  amountUsd: number;
}

export function signShippingQuote(input: SignShippingQuoteInput): string {
  const payload = {
    c: input.countryCode,
    w: input.weightKg,
    a: input.amountUsd,
    exp: Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS,
  };
  const body = base64Url(JSON.stringify(payload));
  const signature = base64Url(createHmac('sha256', negotiationSecret()).update(body).digest());
  return `${body}.${signature}`;
}

export function verifyShippingQuote(token: string): ShippingQuote | null {
  if (typeof token !== 'string' || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  try {
    const expected = createHmac('sha256', negotiationSecret()).update(body).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length) return null;
    if (!timingSafeEqual(given, expected)) return null;

    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      c?: unknown;
      w?: unknown;
      a?: unknown;
      exp?: unknown;
    };
    const countryCode = typeof decoded.c === 'string' ? decoded.c : '';
    const weightKg = Number(decoded.w);
    const amountUsd = Number(decoded.a);
    const exp = Number(decoded.exp);

    if (!Number.isFinite(weightKg) || !Number.isFinite(amountUsd) || !Number.isFinite(exp)) {
      return null;
    }
    if (exp <= Math.floor(Date.now() / 1000)) return null;

    return { countryCode, weightKg, amountUsd, exp };
  } catch {
    return null;
  }
}
