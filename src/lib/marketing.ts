/**
 * Marketing consent and new-product announcements.
 *
 * Rules implemented here:
 * - Only addresses that explicitly opted in are emailed.
 * - Every email carries a one-click unsubscribe link.
 * - A product is announced once per subscriber, ever (marketing_sends).
 * - At most one product is announced per daily run, so a batch of new items
 *   never turns into a burst of emails.
 */

import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import { products } from '@/data/products';
import { ensureDatabaseSchema, getPool } from './db';
import { formatPrice } from './utils';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://adamcutlery.com').replace(/\/$/, '');

export function marketingEmailReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function smtpTransport() {
  const port = Number(process.env.SMTP_PORT || '587');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Record an opt-in. Re-subscribing the same address flips consent back on and
 * clears the unsubscribe date instead of creating a duplicate row.
 */
export async function subscribeToMarketing(input: {
  email: string;
  source?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ email: string; alreadySubscribed: boolean }> {
  await ensureDatabaseSchema();
  const email = input.email.trim().toLowerCase().slice(0, 200);
  const db = getPool();

  const existing = await db.query(
    `SELECT id, consent, unsubscribed_at FROM marketing_subscribers WHERE LOWER(email) = $1 LIMIT 1`,
    [email]
  );

  if (existing.rowCount) {
    const row = existing.rows[0];
    const alreadySubscribed = row.consent === true && !row.unsubscribed_at;
    await db.query(
      `UPDATE marketing_subscribers
       SET consent = TRUE, unsubscribed_at = NULL, updated_at = NOW(),
           source = COALESCE(NULLIF($2, ''), source)
       WHERE id = $1`,
      [row.id, input.source || '']
    );
    return { email, alreadySubscribed };
  }

  await db.query(
    `INSERT INTO marketing_subscribers (id, email, consent, source, ip, user_agent, unsubscribe_token)
     VALUES ($1, $2, TRUE, $3, $4, $5, $6)`,
    [
      `ms_${randomUUID()}`,
      email,
      (input.source || 'popup').slice(0, 100),
      (input.ip || '').slice(0, 100),
      (input.userAgent || '').slice(0, 300),
      randomUUID(),
    ]
  );

  return { email, alreadySubscribed: false };
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!token || token.length < 10) return false;
  await ensureDatabaseSchema();
  const result = await getPool().query(
    `UPDATE marketing_subscribers
     SET consent = FALSE, unsubscribed_at = NOW(), updated_at = NOW()
     WHERE unsubscribe_token = $1
     RETURNING id`,
    [token]
  );
  return Boolean(result.rowCount);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildProductEmail(product: (typeof products)[number], token: string) {
  const url = `${SITE_URL}/product/${product.id}`;
  const unsubscribeUrl = `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
  const price = formatPrice(product.price);
  const imagePath = product.images?.[0] || '';
  const image = imagePath
    ? imagePath.startsWith('http')
      ? imagePath
      : `${SITE_URL}${imagePath}`
    : '';
  const text = [
    `New at Adam Cutlery: ${product.name}`,
    '',
    product.description || '',
    `Price: ${price}`,
    url,
    '',
    `You are receiving this because you asked to hear about new arrivals.`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `
    <div style="max-width:560px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;color:#1f1f1f;">
      <h2 style="font-size:20px;margin:0 0 6px;">New at Adam Cutlery</h2>
      <h3 style="font-size:18px;margin:0 0 12px;">${escapeHtml(product.name)}</h3>
      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" style="width:100%;max-width:520px;border-radius:8px;border:1px solid #eee;" />` : ''}
      <p style="font-size:15px;line-height:1.6;color:#444;">${escapeHtml(product.description || '')}</p>
      <p style="font-size:18px;font-weight:bold;margin:12px 0;">${escapeHtml(price)}</p>
      <p style="margin:18px 0;">
        <a href="${escapeHtml(url)}" style="background:#c9a962;color:#111;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block;">
          View product
        </a>
      </p>
      <p style="font-size:12px;color:#888;line-height:1.6;margin-top:28px;">
        You are receiving this because you agreed to hear about new arrivals.
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#888;">Unsubscribe</a>.
      </p>
    </div>
  `;

  return { subject: `New at Adam Cutlery: ${product.name}`, text, html };
}

type CampaignResult = {
  productId?: string;
  productName?: string;
  sent: number;
  skipped: number;
  reason?: string;
};

/**
 * Seed the baseline once: every product that already exists when this feature
 * ships counts as "already announced". Only products added afterwards produce
 * a campaign, so the owner does not blast old stock to new subscribers.
 */
async function ensureBaseline() {
  const db = getPool();
  const marker = await db.query(
    `INSERT INTO app_migrations (id) VALUES ('marketing-baseline') ON CONFLICT (id) DO NOTHING RETURNING id`
  );
  if (!marker.rowCount) return;
  for (const product of products) {
    await db.query(
      `INSERT INTO marketing_campaigns (id, product_id, subject, recipients, sent_at)
       VALUES ($1, $2, 'baseline', 0, NOW())
       ON CONFLICT (product_id) DO NOTHING`,
      [`mc_${randomUUID()}`, product.id]
    );
  }
}

/**
 * Send one new-product announcement. Returns a summary instead of throwing so
 * the cron endpoint always reports something useful.
 */
export async function sendNextProductCampaign(limit = 300): Promise<CampaignResult> {
  if (!marketingEmailReady()) {
    return { sent: 0, skipped: 0, reason: 'SMTP_NOT_CONFIGURED' };
  }

  await ensureDatabaseSchema();
  const db = getPool();
  await ensureBaseline();

  const announced = await db.query(`SELECT product_id FROM marketing_campaigns`);
  const announcedIds = new Set(announced.rows.map((row) => String(row.product_id)));
  const nextProduct = products.find((product) => !announcedIds.has(product.id)) || null;

  if (!nextProduct) {
    return { sent: 0, skipped: 0, reason: 'NOTHING_NEW' };
  }

  const subscribers = await db.query(
    `SELECT email, unsubscribe_token
     FROM marketing_subscribers
     WHERE consent = TRUE AND unsubscribed_at IS NULL
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  const transporter = smtpTransport();
  let sent = 0;
  let skipped = 0;

  for (const row of subscribers.rows) {
    const email = String(row.email || '').toLowerCase();
    if (!email) continue;

    const seen = await db.query(
      `SELECT 1 FROM marketing_sends WHERE product_id = $1 AND email = $2 LIMIT 1`,
      [nextProduct.id, email]
    );
    if (seen.rowCount) {
      skipped += 1;
      continue;
    }

    const { subject, text, html } = buildProductEmail(nextProduct, String(row.unsubscribe_token));
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject,
        text,
        html,
      });
      await db.query(
        `INSERT INTO marketing_sends (product_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [nextProduct.id, email]
      );
      sent += 1;
    } catch (err) {
      console.error(
        '[marketing] send failed:',
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  }

  // Mark the product as announced once every subscriber has been processed.
  await db.query(
    `INSERT INTO marketing_campaigns (id, product_id, subject, recipients, sent_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (product_id) DO NOTHING`,
    [`mc_${randomUUID()}`, nextProduct.id, `New at Adam Cutlery: ${nextProduct.name}`, sent]
  );

  return {
    productId: nextProduct.id,
    productName: nextProduct.name,
    sent,
    skipped,
  };
}
