import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/adminGuard';
import { products } from '@/data/products';
import { generateSeoForProduct } from '@/lib/seo/generate';
import { isLlmConfigured, llmModelName } from '@/lib/seo/llm';
import { listDrafts, saveDraft } from '@/lib/seo/drafts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 单次请求最多生成多少条，避免超时与限流。 */
const MAX_BATCH = 10;

const bodySchema = z.object({
  productIds: z.array(z.string().min(1)).max(MAX_BATCH).optional(),
  /** 为 true 时覆盖已有草稿（会重置审核状态）。 */
  force: z.boolean().optional(),
});

/**
 * POST /api/admin/seo/generate
 * Body: { productIds?: string[], force?: boolean }
 *
 * 未指定 productIds 时，自动挑选「还没有草稿」的产品，单批最多 10 条。
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  if (!isLlmConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: 'DEEPSEEK_API_KEY is not configured on the server.',
        code: 'LLM_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body.' },
        { status: 400 },
      );
    }

    const { productIds, force } = parsed.data;
    const existing = await listDrafts();
    const existingProducts = new Set(existing.map((d) => d.productId));

    let targets = productIds?.length
      ? products.filter((p) => productIds.includes(p.id))
      : products.filter((p) => force || !existingProducts.has(p.id));

    const remainingAfterBatch = Math.max(0, targets.length - MAX_BATCH);
    targets = targets.slice(0, MAX_BATCH);

    const generated: Array<{ id: string; productId: string; status: string; model: string }> = [];
    const failures: Array<{ productId: string; error: string }> = [];

    for (const product of targets) {
      try {
        const content = await generateSeoForProduct(product);
        const draft = await saveDraft(content);
        generated.push({
          id: draft.id,
          productId: draft.productId,
          status: draft.status,
          model: draft.model,
        });
      } catch (err) {
        failures.push({
          productId: product.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      model: llmModelName(),
      generatedCount: generated.length,
      failedCount: failures.length,
      remainingAfterBatch,
      generated,
      failures,
    });
  } catch (err) {
    console.error(
      '[admin/seo/generate] failed',
      err instanceof Error ? err.message : 'Unknown error',
    );
    return NextResponse.json(
      { success: false, error: 'Failed to generate SEO drafts.' },
      { status: 500 },
    );
  }
}