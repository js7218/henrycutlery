import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/adminGuard';
import {
  countDrafts,
  listDrafts,
  setDraftStatus,
  updateDraftContent,
} from '@/lib/seo/drafts';
import type { SeoStatus } from '@/lib/seo/types';

export const dynamic = 'force-dynamic';

const STATUS_VALUES = ['draft', 'approved', 'rejected', 'all'] as const;

const patchSchema = z
  .object({
    seoTitle: z.string().min(1).max(200).optional(),
    metaDescription: z.string().min(1).max(400).optional(),
    slug: z.string().min(1).max(80).optional(),
    summary: z.string().min(1).max(600).optional(),
    longDescription: z.string().min(1).max(8000).optional(),
    keywords: z.array(z.string().min(1).max(80)).max(20).optional(),
    altTexts: z.array(z.string().min(1).max(200)).max(30).optional(),
  })
  .strict();

const bodySchema = z.object({
  id: z.string().min(1),
  action: z.enum(['approve', 'reject', 'reset']),
  patch: patchSchema.optional(),
});

/**
 * GET /api/admin/seo/drafts?status=draft|approved|rejected|all
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    const url = new URL(request.url);
    const status = (url.searchParams.get('status') || 'all').toLowerCase();
    if (!STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
      return NextResponse.json({ success: false, error: 'Invalid status.' }, { status: 400 });
    }

    const drafts = await listDrafts(status === 'all' ? undefined : (status as SeoStatus));
    const counts = await countDrafts();

    return NextResponse.json({
      success: true,
      count: drafts.length,
      counts,
      drafts,
    });
  } catch (err) {
    console.error(
      '[admin/seo/drafts] list failed',
      err instanceof Error ? err.message : 'Unknown error',
    );
    return NextResponse.json(
      { success: false, error: 'Failed to load SEO drafts.' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/seo/drafts
 * Body: { id, action: 'approve' | 'reject' | 'reset', patch?: {...} }
 *
 * 若带 patch，先落人工编辑，再执行状态变更。任何编辑都会让状态回到 draft，
 * 避免「改了内容但沿用旧审核结论」。
 */
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body.' },
        { status: 400 },
      );
    }

    const { id, action, patch } = parsed.data;

    if (patch && Object.keys(patch).length > 0) {
      const updated = await updateDraftContent(id, patch);
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Draft not found.' }, { status: 404 });
      }
    }

    const targetStatus: SeoStatus =
      action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'draft';

    const draft = await setDraftStatus(id, targetStatus, guard.user.id);
    if (!draft) {
      return NextResponse.json({ success: false, error: 'Draft not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, draft, counts: await countDrafts() });
  } catch (err) {
    console.error(
      '[admin/seo/drafts] update failed',
      err instanceof Error ? err.message : 'Unknown error',
    );
    return NextResponse.json(
      { success: false, error: 'Failed to update SEO draft.' },
      { status: 500 },
    );
  }
}