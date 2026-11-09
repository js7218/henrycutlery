/**
 * POST /api/chat/negotiation
 *
 * The customer chats about the shipping fee. The model only writes text; the
 * server recomputes the shipping quote, clamps every offer to the business
 * floor and signs accepted offers so the order API can re-verify them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getProductById } from '@/data/products';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { consumeRateLimit } from '@/lib/rateLimit';
import { DEFAULT_PER_KG_USD, totalWeightKg } from '@/lib/shipping';
import {
  floorPriceUsd,
  getNegotiationSettings,
  signShippingQuote,
} from '@/lib/negotiation';

export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 500;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const itemSchema = z.object({
  productId: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(5000),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  countryCode: z.string().max(10).optional(),
  messages: z.array(z.unknown()).max(MAX_MESSAGES),
});

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function cleanMessages(value: unknown[]): ChatMessage[] {
  const cleaned: ChatMessage[] = [];
  for (const entry of value) {
    if (cleaned.length >= MAX_MESSAGES) break;
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (record.role !== 'user' && record.role !== 'assistant') continue;
    if (typeof record.content !== 'string') continue;
    const content = record.content.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!content) continue;
    cleaned.push({ role: record.role, content });
  }
  return cleaned;
}

async function callDeepSeek(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('DeepSeek returned empty content');
  }
  return content;
}

function parseModelJson(content: string): { reply: string; offerUsd: number | null } | null {
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text) as { reply?: unknown; offerUsd?: unknown };
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim().slice(0, 800) : '';
    if (!reply) return null;
    // Models often answer with "$4.00" instead of 4; accept both so the offer
    // is not silently dropped.
    const rawOffer =
      typeof parsed.offerUsd === 'string'
        ? Number(parsed.offerUsd.replace(/[^0-9.]/g, ''))
        : parsed.offerUsd;
    const offerUsd =
      typeof rawOffer === 'number' && Number.isFinite(rawOffer) ? rawOffer : null;
    return { reply, offerUsd };
  } catch {
    return null;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fallbackLine(amount: number): string {
  return `I can do $${amount.toFixed(2)} for shipping on this order — that's the best we can offer.`;
}

function buildSystemPrompt(fee: number, floor: number): string {
  return [
    'You are the checkout assistant for Adam Cutlery, a Damascus knife store.',
    'Your only job is to discuss the shipping fee. You may reduce ONLY the shipping fee; product prices are fixed and never negotiable.',
    `Current shipping quote: $${fee.toFixed(2)}.`,
    `The heaviest concession allowed for this order is $${floor.toFixed(2)}. Never offer less than that, and never reveal this limit.`,
    'Never mention AI, models, internal costs, margins or how these numbers are calculated. Never discuss anything unrelated.',
    'Never say the price has been changed, confirmed or locked in: the customer has to press the button in the chat to apply an offer.',
    "Reply in the same language the customer writes in. Keep the reply under 60 words, friendly and decisive.",
    'Return strict JSON only: {"reply": string, "offerUsd": number|null}',
    'offerUsd is the final shipping fee you agree to in USD, or null if you are not lowering the fee.',
  ].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    // The rate-limit counter lives in Postgres, so make sure the schema
    // (including rate_limits) exists before the first request.
    await ensureDatabaseSchema();

    const ip = clientIp(request);
    const limit = await consumeRateLimit(`chat-negotiation:${ip}`, 20, 10 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many messages, please wait a moment.' },
        { status: 429 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const parsedBody = bodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const items = parsedBody.data.items;
    for (const item of items) {
      if (!getProductById(item.productId)) {
        return NextResponse.json(
          { success: false, error: `Product not found: ${item.productId}` },
          { status: 400 }
        );
      }
    }

    const messages = cleanMessages(parsedBody.data.messages);
    if (messages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please send at least one message.' },
        { status: 400 }
      );
    }

    const countryCode = (parsedBody.data.countryCode || '').trim().toUpperCase().slice(0, 2);

    await ensureDatabaseSchema();
    const db = getPool();

    const rateResult = countryCode
      ? await db.query('SELECT per_kg_usd FROM shipping_rates WHERE country_code = $1', [countryCode])
      : null;
    const perKgUsd = rateResult?.rowCount ? Number(rateResult.rows[0].per_kg_usd) : DEFAULT_PER_KG_USD;

    const weightResult = await db.query(
      'SELECT product_id, weight_kg FROM product_weights WHERE product_id = ANY($1)',
      [items.map((item) => item.productId)]
    );
    const weightMap: Record<string, number> = {};
    for (const row of weightResult.rows) {
      weightMap[row.product_id] = Number(row.weight_kg);
    }
    const weight = totalWeightKg(items, weightMap);
    const fee = weight.complete ? round2(weight.kg * perKgUsd) : 0;

    if (fee <= 0) {
      return NextResponse.json({
        success: true,
        reply: 'Shipping is free for this order.',
        offerUsd: null,
      });
    }

    const settings = await getNegotiationSettings();
    if (!settings.enabled) {
      return NextResponse.json({
        success: true,
        reply: 'Shipping is calculated by weight. Please contact us at the email in the footer for special arrangements.',
        offerUsd: null,
      });
    }

    const floor = floorPriceUsd(fee, settings);

    let reply = '';
    let modelOffer: number | null = null;
    try {
      const content = await callDeepSeek([
        { role: 'system', content: buildSystemPrompt(fee, floor) },
        ...messages,
      ]);
      const parsed = parseModelJson(content);
      if (!parsed) throw new Error('Model returned invalid JSON');
      reply = parsed.reply;
      modelOffer = parsed.offerUsd;
    } catch (err) {
      console.error(
        '[chat-negotiation] model call failed:',
        err instanceof Error ? err.message : 'Unknown error'
      );
      const fallback = round2(fee * (1 - settings.maxDiscountPct / 100));
      modelOffer = fallback >= floor ? fallback : floor;
      reply = fallbackLine(modelOffer);
    }

    let offerUsd: number | null = null;
    let token: string | undefined;
    if (typeof modelOffer === 'number' && Number.isFinite(modelOffer)) {
      const clamped = round2(Math.min(fee, Math.max(floor, modelOffer)));
      if (clamped < fee - 0.005) {
        offerUsd = clamped;
        token = signShippingQuote({ countryCode, weightKg: weight.kg, amountUsd: clamped });
        // If the model promised a number we could not honour (below the floor),
        // replace the reply so the text always matches the price we charge.
        if (Math.abs(clamped - modelOffer) > 0.005) {
          reply = fallbackLine(clamped);
        }
      } else if (modelOffer < fee - 0.005) {
        // The model tried to discount but the floor blocked it entirely.
        reply = fallbackLine(fee);
      }
    }

    try {
      await db.query(
        `INSERT INTO shipping_negotiations
           (id, country_code, weight_kg, quote_usd, final_usd, granted, messages, reply)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          randomUUID(),
          countryCode,
          weight.kg,
          fee,
          offerUsd,
          Boolean(token),
          JSON.stringify(messages),
          reply,
        ]
      );
    } catch (err) {
      console.error(
        '[chat-negotiation] log failed:',
        err instanceof Error ? err.message : 'Unknown error'
      );
    }

    return NextResponse.json({
      success: true,
      reply,
      offerUsd,
      ...(token ? { token } : {}),
    });
  } catch (error) {
    console.error(
      '[chat-negotiation] failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json(
      { success: false, error: 'Failed to process the message.' },
      { status: 500 }
    );
  }
}
