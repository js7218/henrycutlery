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
      temperature: 0.8,
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
  return `Honestly, $${amount.toFixed(2)} is as far as I can go on this one — anything lower and we lose money on the parcel.`;
}

function acceptLine(amount: number): string {
  return `Sure thing — $${amount.toFixed(2)} for shipping works. Tap the button below and I'll apply it to this order.`;
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

/**
 * Detects "add one more knife" / "再加两把" style requests and returns how many
 * units the customer wants to buy. Returns null when the message is not asking
 * for more units.
 */
function parseUnitIntent(text: string): number | null {
  if (!text) return null;

  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const cn: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  const toNumber = (raw: string) => {
    if (/^\d+$/.test(raw)) return Number(raw);
    if (words[raw] !== undefined) return words[raw];
    if (cn[raw] !== undefined) return cn[raw];
    return [...raw].reduce((sum, char) => sum + (cn[char] ?? 0), 0);
  };

  // Removing units is expressed as a negative intent.
  const removeEnglish =
    /\b(?:remove|delete|drop|take away)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(text) ||
    /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:less|fewer)\b/i.exec(text);
  if (removeEnglish) {
    const amount = toNumber(removeEnglish[1].toLowerCase());
    if (amount > 0 && amount <= 500) return -amount;
  }
  const removeChinese = /(?:减少|减掉|减去|去掉|删掉|删去|少买|减)\s*([一二三四五六七八九十两\d]{1,3})\s*(?:把|件|个|支)/.exec(text);
  if (removeChinese) {
    const amount = toNumber(removeChinese[1]);
    if (amount > 0 && amount <= 500) return -amount;
  }

  const spelled = /\b(?:add|another|more)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(text);
  const wordBeforeMore = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+more\b/i.exec(text);
  const digitsWithNoun =
    /\b(?:add|another|plus)\s+(\d{1,3})\s*(?:knife|knives|unit|units|piece|pieces|pcs|pce)\b/i.exec(text);
  const plusSign = /\+\s*(\d{1,3})\b/.exec(text);

  const english = spelled || wordBeforeMore || digitsWithNoun || plusSign;
  if (english) {
    const raw = english[1].toLowerCase();
    const amount = /^\d+$/.test(raw) ? Number(raw) : words[raw];
    if (amount > 0 && amount <= 500) return amount;
  }

  const chinese = /(?:再加|再买|多加|多买|加买|加)\s*([一二三四五六七八九十两\d]{1,3})\s*(?:把|件|个|支)/.exec(text);
  if (chinese) {
    const amount = toNumber(chinese[1]);
    if (amount > 0 && amount <= 500) return amount;
  }

  return null;
}

function buildSystemPrompt(fee: number, floor: number, acceptedUsd?: number): string {
  return [
    'You are Mia, the person who looks after shipping at Adam Cutlery, a small Damascus knife workshop that sells to buyers overseas.',
    'Write like a real human replying on WhatsApp: warm, relaxed, direct. Use contractions, short sentences and the occasional natural touch ("thanks for asking", "honestly", "sure thing"). Never sound like a script or a call-centre bot.',
    'You know the trade from the inside: ocean freight moves with the season, space gets tight before Chinese New Year, remote destinations and bulky parcels cost more, and a repeat buyer is worth more than one shipment.',
    'Read the person, not just the number. If they mention a first order, a sample run, a deadline, a trade show, an old relationship or a bigger order later, acknowledge it in your own words before you answer on price.',
    'When you cannot go lower, give one short, honest reason and, if it fits, a practical alternative: consolidating with their next order, an economy service, or adding a unit or two to spread the per-kg cost. Never invent policies, services or timelines.',
    'Be gracious but not desperate. No begging, no over-apologising, no sob stories, no hard sell. A warm, clear no lands better than a discount you should not give.',
    'Do not open every reply the same way. Vary the shape: sometimes answer the price first, sometimes react to what they said, sometimes ask one short question.',
    'If they give their name, use it once, naturally. Close with a light line that keeps the door open (hold the quote while they check, wish them a smooth order) without promising anything.',
    'Never promise free shipping, free samples, credit terms, duty or tax coverage, customs clearance guarantees, or delivery dates you do not control. You only discuss the shipping fee.',
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
    'Vary your wording between messages so it never looks copy-pasted. Avoid corporate filler like "I understand your concern" or "As per your request". At most one emoji, and only if it fits.',
    "Reply in the same language the customer writes in. Keep it under 60 words and sound like a person who actually ships knives for a living.",
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
    // "Make the shipping 110" / "freight at 95" pins the number to the freight
    // even without a verb like "pay" or "let's".
    const amountNextToShipping =
      /(?:shipping|freight|postage)[^.!?]{0,15}?\$?\d[\d.,]*|\$?\d[\d.,]*[^.!?]{0,12}?(?:shipping|freight|postage)/i.test(
        lastUserText
      );
    const looksLikeOffer =
      namedAmounts.length > 0 &&
      (amountNextToShipping ||
        lastUserText.replace(/[\d.,\s$]/g, '').length <= 3 ||
        /\b(pay|paying|make it|do|take|accept|ok|okay|let'?s|how about|fine|deal|agreed?|use|set|go with|will pay|i can)\b/i.test(
          lastUserText
        ));
    let addUnits: { productId: string; quantity: number; unitPrice: number } | null = null;
    const primaryItem = [...items].sort((a, b) => {
      const valueA = (getProductById(a.productId)?.price || 0) * a.quantity;
      const valueB = (getProductById(b.productId)?.price || 0) * b.quantity;
      return valueB - valueA;
    })[0];
    const primaryProduct = primaryItem ? getProductById(primaryItem.productId) : undefined;

    const addUnitsToCart = async (wanted: number) => {
      if (!primaryProduct || primaryProduct.price <= 0) return 0;
      const stockResult = await db.query('SELECT stock FROM product_stock WHERE product_id = $1', [
        primaryProduct.id,
      ]);
      const inCart = items
        .filter((item) => item.productId === primaryProduct.id)
        .reduce((sum, item) => sum + item.quantity, 0);
      const available = Math.max(0, Number(stockResult.rows[0]?.stock ?? 0) - inCart);
      return Math.min(wanted, available, Math.max(0, 1200 - inCart));
    };

    const unitIntent = parseUnitIntent(lastUserText);
    let removeUnits: { productId: string; quantity: number } | null = null;
    if (primaryProduct && primaryProduct.price > 0 && unitIntent !== null) {
      modelOffer = null;
      if (unitIntent > 0) {
        // "Add one more knife" / "再加两把": buy whole units of the item directly.
        const units = await addUnitsToCart(unitIntent);
        if (units > 0) {
          addUnits = { productId: primaryProduct.id, quantity: units, unitPrice: primaryProduct.price };
          reply = `Done — added ${units} more of ${primaryProduct.name} to your cart. Shipping recalculated for the heavier parcel.`;
        } else {
          reply = `Ah, I don't have any more of ${primaryProduct.name} to add right now, sorry.`;
        }
      } else {
        // "Remove one knife" / "减一把": never drop below the minimum order quantity.
        const inCart = items
          .filter((item) => item.productId === primaryProduct.id)
          .reduce((sum, item) => sum + item.quantity, 0);
        const moq = Math.max(1, Number(primaryProduct.moq) || 1);
        const target = Math.max(moq, inCart + unitIntent);
        const removed = inCart - target;
        if (removed > 0) {
          removeUnits = { productId: primaryProduct.id, quantity: removed };
          reply = `No problem — I took ${removed} off. You're at ${target} now, and the shipping adjusts to the lighter parcel.`;
        } else {
          reply = `${primaryProduct.name} is already at the smallest batch we ship (${moq}), so I can't take one off.`;
        }
      }
    } else if (looksLikeOffer) {
      const named = namedAmounts[namedAmounts.length - 1];
      if (named > fee + 0.005) {
        // Paying above the quote means buying more product: the surplus over the
        // quote is spent on whole units of the item the customer is ordering.
        const product = primaryProduct;
        if (product && product.price > 0) {
          const extra = round2(named - fee);
          let units = Math.floor(extra / product.price);
          // "Add $1,200" is often typed as the extra amount instead of the new
          // shipping total. When the typed amount is an exact multiple of the
          // product price, treat it as the extra amount.
          if (units === 0) {
            const asExtra = Math.floor(named / product.price);
            if (asExtra > 0 && named - asExtra * product.price <= product.price * 0.02) {
              units = asExtra;
            }
          }
          const wantedUnits = units;
          // Never let a chat message push the cart past what can actually ship.
          units = await addUnitsToCart(units);
          if (units > 0) {
            addUnits = { productId: product.id, quantity: units, unitPrice: product.price };
            reply = `Nice, that covers ${units} more of ${product.name} — I've put ${units === 1 ? 'it' : 'them'} in your cart, and the shipping follows the new weight.`;
            modelOffer = null;
          } else if (wantedUnits > 0) {
            reply = `Ah, I don't have any more of ${product.name} to add right now, sorry.`;
            modelOffer = null;
          } else {
            // The surplus is smaller than one unit. Customers often just want
            // to round the freight up, so take it as a voluntary top-up
            // instead of pushing them to buy another knife.
            modelOffer = named;
            if (!reply.includes(modelOffer.toFixed(2)) && !reply.includes(String(modelOffer))) {
              reply = acceptLine(modelOffer);
            }
          }
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
      ...(removeUnits ? { removeUnits } : {}),
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
