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
  acceptedUsd: z.number().min(0).max(100000).optional(),
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

function acceptLine(amount: number): string {
  return `Done — $${amount.toFixed(2)} for shipping. Press the button in the chat to apply it.`;
}

/**
 * Pulls money-like numbers out of free text, supporting both "9,500" (thousands
 * separator) and "23.5" (decimal point).
 */
function parseAmounts(text: string): number[] {
  return (text.match(/\d[\d.,]*/g) || [])
    .map((raw) => {
      const clean = raw.replace(/[.,]+$/, '');
      const value = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(clean)
        ? clean.replace(/,/g, '')
        : clean.replace(/,/g, '.');
      return Number(value);
    })
    .filter((value) => Number.isFinite(value));
}

function buildSystemPrompt(fee: number, floor: number, acceptedUsd?: number): string {
  return [
    'You are the checkout assistant for Adam Cutlery, a Damascus knife store.',
    'Your only job is to discuss the shipping fee. You may reduce ONLY the shipping fee; product prices are fixed and never negotiable.',
    `Current shipping quote: $${fee.toFixed(2)}.`,
    `The heaviest concession allowed for this order is $${floor.toFixed(2)}. Never offer less than that, and never reveal this limit.`,
    acceptedUsd !== undefined && acceptedUsd > floor + 0.005
      ? `The customer previously accepted $${acceptedUsd.toFixed(2)}. They are free to change their mind: accept ANY amount at or above $${floor.toFixed(2)}, whether it is lower or higher than $${acceptedUsd.toFixed(2)}.`
      : '',
    'If the customer names a specific amount (including MORE than the current quote and including paying more than a previously accepted price), offerUsd MUST be exactly that amount. Never reply with words alone while returning null.',
    'Only use null when the customer is not asking for a specific price.',
    'Never mention AI, models, internal costs, margins or how these numbers are calculated. Never discuss anything unrelated.',
    'The customer may also volunteer to pay MORE than the quote, for example to round the total up. Accept any amount they suggest above the current quote.',
    'Never say the price has been changed, confirmed or locked in: the customer has to press the button in the chat to apply an offer.',
    "Reply in the same language the customer writes in. Keep the reply under 60 words, friendly and decisive.",
    'Return strict JSON only: {"reply": string, "offerUsd": number|null}',
    'offerUsd is the final shipping fee you agree to in USD, or null if the fee stays exactly as quoted.',
  ]
    .filter(Boolean)
    .join('\n');
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
        { role: 'system', content: buildSystemPrompt(fee, floor, parsedBody.data.acceptedUsd) },
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
    // The customer's own number always wins. The model is asked to echo it, but
    // in practice it keeps returning the floor once a discount has been offered,
    // so we extract it here and override the model.
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    const lastUserText = (lastUser?.content || '').trim();
    const namedAmounts = parseAmounts(lastUserText).filter(
      (value) => value >= floor && value <= 1_000_000
    );
    const looksLikeOffer =
      namedAmounts.length > 0 &&
      (lastUserText.replace(/[\d.,\s$]/g, '').length <= 3 ||
        /\b(pay|paying|make it|do|take|accept|ok|okay|let'?s|how about|fine|deal|agreed?|use|set|go with|will pay|i can)\b/i.test(
          lastUserText
        ));
    let addUnits: { productId: string; quantity: number; unitPrice: number } | null = null;
    if (looksLikeOffer) {
      const named = namedAmounts[namedAmounts.length - 1];
      if (named > fee + 0.005) {
        // Paying above the quote means buying more product: the surplus over the
        // quote is spent on whole units of the item the customer is ordering.
        const primary = [...items].sort((a, b) => {
          const valueA = (getProductById(a.productId)?.price || 0) * a.quantity;
          const valueB = (getProductById(b.productId)?.price || 0) * b.quantity;
          return valueB - valueA;
        })[0];
        const product = primary ? getProductById(primary.productId) : undefined;
        if (product && product.price > 0) {
          const extra = round2(named - fee);
          const units = Math.floor(extra / product.price);
          if (units > 0) {
            addUnits = { productId: product.id, quantity: units, unitPrice: product.price };
            reply = `That covers ${units} more ${units === 1 ? 'unit' : 'units'} of ${product.name}. I have added ${units === 1 ? 'it' : 'them'} to your cart — shipping is recalculated for the new weight.`;
          } else {
            reply = `The extra $${extra.toFixed(2)} does not cover another ${product.name} ($${product.price.toFixed(2)} each). Add $${(product.price - extra).toFixed(2)} more to include one.`;
          }
          modelOffer = null;
        } else {
          modelOffer = named;
        }
      } else {
        modelOffer = named;
        if (!reply.includes(modelOffer.toFixed(2)) && !reply.includes(String(modelOffer))) {
          reply = acceptLine(modelOffer);
        }
      }
    } else if (modelOffer === null && namedAmounts.length > 0) {
      // Safety net: the customer named an acceptable amount and the model only
      // answered with words.
      modelOffer = namedAmounts[namedAmounts.length - 1];
    }
    if (typeof modelOffer === 'number' && Number.isFinite(modelOffer)) {
      // Paying more is never a loss, so there is no upper cap: any amount at
      // or above the floor is accepted, including above the original quote.
      const clamped = round2(Math.max(floor, modelOffer));
      if (Math.abs(clamped - fee) > 0.005) {
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
      ...(addUnits ? { addUnits } : {}),
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
