import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import type { SeoDraft, SeoGeneratedContent, SeoStatus } from './types';

/**
 * SEO 草稿的持久化。
 *
 * 草稿与审核状态存在 Postgres（生产接 Neon），因为 Vercel 运行时文件系统只读，
 * 站内审核无法直接改写仓库文件。发布由 GitHub Action 读取 status='approved'
 * 的记录后写回 src/data/seo-content.json 并提交。
 */

interface DraftRow {
  id: string;
  product_id: string;
  status: string;
  content: SeoGeneratedContent | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rowToDraft(row: DraftRow): SeoDraft {
  const content = (row.content || {}) as Partial<SeoGeneratedContent>;
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
    id: row.id,
    status: row.status as SeoStatus,
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
    reviewedBy: row.reviewed_by,
    reviewedAt: toIso(row.reviewed_at),
  };
}

export async function listDrafts(status?: SeoStatus): Promise<SeoDraft[]> {
  await ensureDatabaseSchema();
  const pool = getPool();

  const result = status
    ? await pool.query<DraftRow>(
        `SELECT * FROM seo_drafts WHERE status = $1 ORDER BY updated_at DESC`,
        [status],
      )
    : await pool.query<DraftRow>(`SELECT * FROM seo_drafts ORDER BY updated_at DESC`);

  return result.rows.map(rowToDraft);
}

export async function getDraft(id: string): Promise<SeoDraft | null> {
  await ensureDatabaseSchema();
  const result = await getPool().query<DraftRow>(
    `SELECT * FROM seo_drafts WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? rowToDraft(result.rows[0]) : null;
}

/**
 * 写入/覆盖某产品的草稿。重新生成时状态回到 draft 并清空审核信息，
 * 保证改动过的东西必须重新过一遍人工审核。
 */
export async function saveDraft(content: SeoGeneratedContent): Promise<SeoDraft> {
  await ensureDatabaseSchema();
  const result = await getPool().query<DraftRow>(
    `
      INSERT INTO seo_drafts (id, product_id, status, content, model, created_at, updated_at)
      VALUES ($1, $2, 'draft', $3::jsonb, $4, NOW(), NOW())
      ON CONFLICT (product_id) DO UPDATE SET
        status = 'draft',
        content = EXCLUDED.content,
        model = EXCLUDED.model,
        updated_at = NOW(),
        reviewed_by = NULL,
        reviewed_at = NULL
      RETURNING *
    `,
    [randomUUID(), content.productId, JSON.stringify(content), content.model || ''],
  );

  return rowToDraft(result.rows[0]);
}

/** 局部更新草稿内容（人工编辑后调用），状态回到 draft。 */
export async function updateDraftContent(
  id: string,
  patch: Partial<SeoGeneratedContent>,
): Promise<SeoDraft | null> {
  await ensureDatabaseSchema();
  const result = await getPool().query<DraftRow>(
    `
      UPDATE seo_drafts
      SET content = content || $2::jsonb,
          status = 'draft',
          updated_at = NOW(),
          reviewed_by = NULL,
          reviewed_at = NULL
      WHERE id = $1
      RETURNING *
    `,
    [id, JSON.stringify(patch)],
  );

  return result.rows[0] ? rowToDraft(result.rows[0]) : null;
}

export async function setDraftStatus(
  id: string,
  status: SeoStatus,
  reviewedBy: string,
): Promise<SeoDraft | null> {
  await ensureDatabaseSchema();
  const result = await getPool().query<DraftRow>(
    `
      UPDATE seo_drafts
      SET status = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, status, reviewedBy],
  );

  return result.rows[0] ? rowToDraft(result.rows[0]) : null;
}

export async function listApprovedDrafts(): Promise<SeoDraft[]> {
  return listDrafts('approved');
}

export async function countDrafts(): Promise<Record<SeoStatus, number>> {
  await ensureDatabaseSchema();
  const result = await getPool().query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM seo_drafts GROUP BY status`,
  );

  const counts: Record<SeoStatus, number> = { draft: 0, approved: 0, rejected: 0 };
  for (const row of result.rows) {
    if (row.status === 'draft' || row.status === 'approved' || row.status === 'rejected') {
      counts[row.status] = Number(row.count);
    }
  }
  return counts;
}