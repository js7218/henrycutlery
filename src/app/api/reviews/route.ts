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

function sanitizeHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
 * Check if a user has a verified purchase for a product.
 * A verified purchase means the user has an order containing this product
 * with status not 'cancelled'.
 */
async function hasVerifiedPurchase(userId: string, productId: string): Promise<boolean> {
  try {
    const result = await getPool().query(
      `
        SELECT 1 FROM orders
        WHERE user_id = $1
          AND status != 'cancelled'
          AND items @> $2::jsonb
        LIMIT 1
      `,
      [userId, JSON.stringify([{ productId }])]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * GET /api/reviews?productId=xxx
 *
 * Public endpoint: returns ONLY approved reviews. Pending and rejected ones
 * stay invisible to other customers.
 * Includes verified_purchase flag, helpfulness counts, and moderation_status.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const url = new URL(request.url);
    const productId = (url.searchParams.get('productId') || '').trim();
    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'Missing productId.' },
        { status: 400 }
      );
    }

    const result = await getPool().query(
      `
        SELECT id, author_name, rating, content, created_at,
               verified_purchase, helpful_count, not_helpful_count, moderation_status
        FROM product_reviews
        WHERE product_id = $1 AND status = 'approved'
        ORDER BY verified_purchase DESC, helpful_count DESC, created_at DESC
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
        verifiedPurchase: row.verified_purchase,
        helpfulCount: row.helpful_count,
        notHelpfulCount: row.not_helpful_count,
        moderationStatus: row.moderation_status,
      })),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('[reviews] list failed', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Failed to load reviews.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reviews
 *
 * Submit a review. The classifier decides if it goes straight to "approved",
 * stays "pending" for moderation, or gets "rejected".
 * Only verified purchasers can submit reviews.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const session = await getAuthUser();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Please log in before posting a review.' },
        { status: 401 }
      );
    }

    const dbUser = await getUserById(session.id);
    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'Invalid account.' },
        { status: 401 }
      );
    }

    const limitKey = rateLimitKey(request, dbUser.id);
    if (!takeRateLimitToken(limitKey)) {
      return NextResponse.json(
        { success: false, error: 'Submissions are too frequent, please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const productId = String(body?.productId || '').trim();
    const content = sanitizeHtml(String(body?.content || '').trim());
    const title = sanitizeHtml(String(body?.title || '').trim());
    const rating = Number(body?.rating);
    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'Missing productId' },
        { status: 400 }
      );
    }
    if (!products.some((product) => product.id === productId)) {
      return NextResponse.json(
        { success: false, error: 'Product does not exist.' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: 'Rating must be an integer between 1 and 5.' },
        { status: 400 }
      );
    }
    if (content.length < 3 || content.length > MAX_REVIEW_LENGTH) {
      return NextResponse.json(
        { success: false, error: 'Review content must be between 3 and 2000 characters.' },
        { status: 400 }
      );
    }

    // Verify purchase before allowing review
    const isVerified = await hasVerifiedPurchase(dbUser.id, productId);
    if (!isVerified) {
      return NextResponse.json(
        { success: false, error: 'Only verified purchasers can submit reviews.' },
        { status: 403 }
      );
    }

    // SECURITY: Check for duplicate review from same user on same product
    const existingReview = await getPool().query(
      `SELECT id FROM product_reviews WHERE user_id = $1 AND product_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [dbUser.id, productId]
    );
    if (existingReview.rowCount) {
      return NextResponse.json({ success: false, error: 'You have already reviewed this product' }, { status: 409 });
    }

    const sanitizedAuthorName = sanitizeHtml(dbUser.name || dbUser.email.split('@')[0]);

    const classification = classifyReview({ content, rating });
    if (classification.status === 'rejected') {
      // Persist a rejected record so admins can audit abuse if they want to,
      // but never show this to other customers.
      await getPool().query(
        `INSERT INTO product_reviews
            (id, product_id, user_id, author_name, rating, content, status, moderation_status, risk_score, risk_reason, ip_hash, user_agent, verified_purchase)
         VALUES ($1, $2, $3, $4, $5, $6, 'rejected', 'rejected', $7, $8, $9, $10, $11)`,
        [
          crypto.randomUUID(),
          productId,
          dbUser.id,
          sanitizedAuthorName,
          rating,
          content,
          classification.score,
          classification.reason,
          hashIp(request),
          (request.headers.get('user-agent') || '').slice(0, 200),
          true,
        ]
      );
      return NextResponse.json(
        { success: false, error: 'Review contains disallowed content.', reason: classification.reason },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    await getPool().query(
      `INSERT INTO product_reviews
         (id, product_id, user_id, author_name, rating, content, status, moderation_status, risk_score, risk_reason, ip_hash, user_agent, verified_purchase)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        productId,
        dbUser.id,
        sanitizedAuthorName,
        rating,
        content,
        classification.status,
        classification.score,
        classification.reason,
        hashIp(request),
        (request.headers.get('user-agent') || '').slice(0, 200),
        true,
      ]
    );

    return NextResponse.json({
      success: true,
      status: classification.status,
      message:
        classification.status === 'approved'
          ? 'Review published.'
          : 'Review submitted and will be displayed after approval.',
    });
  } catch (err) {
    console.error('[reviews] submit failed', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Failed to submit review.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/reviews
 *
 * Vote on review helpfulness.
 * Body: { reviewId: string, isHelpful: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const session = await getAuthUser();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Please log in to vote.' },
        { status: 401 }
      );
    }

    const dbUser = await getUserById(session.id);
    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'Invalid account.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const reviewId = String(body?.reviewId || '').trim();
    const isHelpful = Boolean(body?.isHelpful);

    if (!reviewId) {
      return NextResponse.json(
        { success: false, error: 'Missing reviewId.' },
        { status: 400 }
      );
    }

    // Prevent self-voting
    const reviewResult = await getPool().query(
      `SELECT user_id FROM product_reviews WHERE id = $1`,
      [reviewId]
    );
    if (reviewResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Review not found.' },
        { status: 404 }
      );
    }
    if (reviewResult.rows[0].user_id === dbUser.id) {
      return NextResponse.json(
        { success: false, error: 'You cannot vote on your own review.' },
        { status: 403 }
      );
    }

    // Upsert vote
    const voteId = crypto.randomUUID();
    await getPool().query(
      `
        INSERT INTO review_votes (id, review_id, user_id, is_helpful)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (review_id, user_id)
        DO UPDATE SET is_helpful = EXCLUDED.is_helpful
      `,
      [voteId, reviewId, dbUser.id, isHelpful]
    );

    // Recalculate counts
    await getPool().query(
      `
        UPDATE product_reviews
        SET helpful_count = (
          SELECT COUNT(*) FROM review_votes WHERE review_id = $1 AND is_helpful = TRUE
        ),
        not_helpful_count = (
          SELECT COUNT(*) FROM review_votes WHERE review_id = $1 AND is_helpful = FALSE
        )
        WHERE id = $1
      `,
      [reviewId]
    );

    return NextResponse.json({
      success: true,
      message: 'Vote recorded.',
    });
  } catch (err) {
    console.error('[reviews] vote failed', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Failed to record vote.' },
      { status: 500 }
    );
  }
}
