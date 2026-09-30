#!/usr/bin/env node
/**
 * SEO 内容发布脚本
 *
 * 从 Postgres 读取 status='approved' 的 SEO 草稿，写回
 * src/data/seo-content.json，供产品页 / sitemap / llms.txt 使用。
 *
 * 仅在内容真正变化时才落盘并写入 scripts/.seo-changed 标记，
 * 由 GitHub Action 据此决定是否提交 —— 没有变化就不产生提交。
 *
 * 环境变量：
 *   DATABASE_URL  —— 必填（生产用 Neon）
 *
 * 用法：
 *   node scripts/publish-seo-content.mjs
 *   node scripts/publish-seo-content.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CONTENT_PATH = path.join(ROOT, 'src', 'data', 'seo-content.json');
const MARKER_PATH = path.join(__dirname, '.seo-changed');

const DRY_RUN = process.argv.includes('--dry-run');

function log(message) {
  console.log(`[publish-seo] ${message}`);
}

function warn(message) {
  console.log(`::warning::[publish-seo] ${message}`);
}

function readExisting() {
  try {
    const raw = fs.readFileSync(CONTENT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { generated_at: null, items: {} };
  } catch {
    return { generated_at: null, items: {} };
  }
}

/** 稳定序列化：键顺序固定，便于幂等比较。 */
function serialize(content) {
  const itemKeys = Object.keys(content.items || {}).sort();
  const normalized = {
    generated_at: content.generated_at || null,
    items: Object.fromEntries(itemKeys.map((key) => [key, content.items[key]])),
  };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function normalizeItem(row) {
  const content = row.content || {};
  return {
    productId: row.product_id,
    seoTitle: content.seoTitle || '',
    metaDescription: content.metaDescription || '',
    slug: content.slug || '',
    summary: content.summary || '',
    longDescription: content.longDescription || '',
    keywords: Array.isArray(content.keywords) ? content.keywords : [],
    altTexts: Array.isArray(content.altTexts) ? content.altTexts : [],
    generatedAt: content.generatedAt || '',
    model: content.model || '',
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    warn('DATABASE_URL is not configured; nothing to publish.');
    process.exit(1);
  }

  const url = new URL(connectionString);
  if (!url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'require');
  }

  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  let rows;
  try {
    // 幂等兜底：生产库可能尚未部署新版应用（ensureDatabaseSchema 未执行过），
    // 这里先确保目标表存在。定义需与 src/lib/db.ts 的 ensureDatabaseSchema 保持一致。
    await client.query(`
      CREATE TABLE IF NOT EXISTS seo_drafts (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft',
        content JSONB NOT NULL DEFAULT '{}'::jsonb,
        model TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS seo_drafts_status_idx ON seo_drafts(status);`,
    );

    const result = await client.query(
      `SELECT product_id, content
       FROM seo_drafts
       WHERE status = 'approved'
       ORDER BY product_id ASC`,
    );
    rows = result.rows;
  } finally {
    await client.end();
  }

  if (rows.length === 0) {
    log('No approved drafts found.');
  }

  const items = {};
  for (const row of rows) {
    items[row.product_id] = normalizeItem(row);
  }

  // generated_at 只在内容变化时更新，避免每天产生无意义 diff
  const existing = readExisting();
  const existingSerialized = serialize(existing);

  const candidate = {
    generated_at: existing.generated_at,
    items,
  };

  if (serialize(candidate) === existingSerialized) {
    log(`No changes. ${rows.length} approved item(s) already published.`);
    return;
  }

  candidate.generated_at = new Date().toISOString();
  const nextSerialized = serialize(candidate);

  if (DRY_RUN) {
    log(`[dry-run] Would publish ${rows.length} item(s):`);
    for (const key of Object.keys(items)) {
      log(`  - ${key}: ${items[key].seoTitle}`);
    }
    return;
  }

  fs.writeFileSync(CONTENT_PATH, nextSerialized, 'utf8');
  fs.writeFileSync(MARKER_PATH, `${new Date().toISOString()}\n`, 'utf8');

  log(`Published ${rows.length} item(s) to ${path.relative(ROOT, CONTENT_PATH)}`);
}

main().catch((err) => {
  console.error(`[publish-seo] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});