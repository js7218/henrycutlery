import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ensureDatabaseSchema, getPool, getUserById } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { classifyReview } from '@/lib/reviewClassifier';
import { products } from '@/data/products';

export const dynamic = 'force-dynamic';

const REVIEW_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const REVIEW_RATE_LIMIT_MAX = 3;
const MAX_REVIEW_LENGTH = 2000;
const reviewSubmissions = new Map<string, number[]>();

function rateLimitKey(req: NextRequest, userId: string | null): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  return `${userId || 'anon'}:${ip}`;
}

function takeRateLimitToken(key: string): boolean {
  const now = Date.now();
  const recent = (reviewSubmissions.get(key) || []).filter(
    (ts) => now - ts < REVIEW_RATE_LIMIT_WINDOW_MS
  );
  if (recent.length >= REVIEW_RATE_LIMIT_MAX) {
    reviewSubmissions.set(key, recent);
    return false;
  }
  recent.push(now);
  reviewSubmissions.set(key, recent);
  return true;
}

function hashIp(req: NextRequest): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '';
  if (!ip) return '';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

/**
 * GET /api/reviews?productId=xxx
 *
 * Public endpoint: returns ONLY approved reviews. Pending and rejected ones
 * stay invisible to other customers.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const url = new URL(request.url);
    const productId = (url.searchParams.get('productId') || '').trim();
    if (!productId) {
      return NextResponse.json(
        { success: false, error: '缺少 productId' },
        { status: 400 }
      );
    }

    const result = await getPool().query(
      `
        SELECT id, author_name, rating, content, created_at
        FROM product_reviews
        WHERE product_id = $1 AND status = 'approved'
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [productId]
    );

    const response = NextResponse.json({
      success: true,
      reviews: result.rows.map((row) => ({
        id: row.id,
        author: row.author_name || 'Customer',
        rating: row.rating,
        content: row.content,
        createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
      })),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('[reviews] list failed', err);
    return NextResponse.json(
      { success: false, error: '加载评论失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reviews
 *
 * Submit a review. The classifier decides if it goes straight to "approved",
 * stays "pending" for moderation, or gets "rejected".
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const session = await getAuthUser();
    if (!session) {
      return NextResponse.json(
        { success: false, error: '请先登录后再发表评论' },
        { status: 401 }
      );
    }

    const dbUser = await getUserById(session.id);
    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: '账号无效' },
        { status: 401 }
      );
    }

    const limitKey = rateLimitKey(request, dbUser.id);
    if (!takeRateLimitToken(limitKey)) {
      return NextResponse.json(
        { success: false, error: '提交太频繁，请稍后再试' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const productId = String(body?.productId || '').trim();
    const content = String(body?.content || '').trim();
    const rating = Number(body?.rating);
    if (!productId) {
      return NextResponse.json(
        { success: false, error: '缺少 productId' },
        { status: 400 }
      );
    }
    if (!products.some((product) => product.id === productId)) {
      return NextResponse.json(
        { success: false, error: '商品不存在' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: '评分必须是 1-5 的整数' },
        { status: 400 }
      );
    }
    if (content.length < 3 || content.length > MAX_REVIEW_LENGTH) {
      return NextResponse.json(
        { success: false, error: '评论内容必须为 3-2000 个字符' },
        { status: 400 }
      );
    }

    const classification = classifyReview({ content, rating });
    if (classification.status === 'rejected') {
      // Persist a rejected record so admins can audit abuse if they want to,
      // but never show this to other customers.
      await getPool().query(
        `INSERT INTO product_reviews
            (id, product_id, user_id, author_name, rating, content, status, risk_score, risk_reason, ip_hash, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, 'rejected', $7, $8, $9, $10)`,
        [
          crypto.randomUUID(),
          productId,
          dbUser.id,
          dbUser.name || dbUser.email.split('@')[0],
          rating,
          content,
          classification.score,
          classification.reason,
          hashIp(request),
          (request.headers.get('user-agent') || '').slice(0, 200),
        ]
      );
      return NextResponse.json(
        { success: false, error: '评论包含不允许的内容', reason: classification.reason },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    await getPool().query(
      `INSERT INTO product_reviews
         (id, product_id, user_id, author_name, rating, content, status, risk_score, risk_reason, ip_hash, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        productId,
        dbUser.id,
        dbUser.name || dbUser.email.split('@')[0],
        rating,
        content,
        classification.status,
        classification.score,
        classification.reason,
        hashIp(request),
        (request.headers.get('user-agent') || '').slice(0, 200),
      ]
    );

    return NextResponse.json({
      success: true,
      status: classification.status,
      message:
        classification.status === 'approved'
          ? '评论已发布'
          : '评论已提交，将在审核通过后展示',
    });
  } catch (err) {
    console.error('[reviews] submit failed', err);
    return NextResponse.json(
      { success: false, error: '提交评论失败' },
      { status: 500 }
    );
  }
}
