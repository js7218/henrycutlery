/**
 * Database-backed fixed-window rate limiter.
 *
 * Vercel serverless functions run on many isolated instances, so in-memory
 * Maps cannot enforce a global limit. These counters live in Postgres so the
 * limit is consistent across instances.
 */

import { getPool } from './db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Consume one unit from a counter keyed by `key`.
 * A fresh window starts when the previous one is older than `windowMs`.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const result = await getPool().query(
    `
      INSERT INTO rate_limits (key, window_start, count)
      VALUES ($1, NOW(), 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limits.window_start < NOW() - ($2::double precision * INTERVAL '1 millisecond') THEN 1
          ELSE rate_limits.count + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < NOW() - ($2::double precision * INTERVAL '1 millisecond') THEN NOW()
          ELSE rate_limits.window_start
        END
      RETURNING count, window_start
    `,
    [key, windowMs]
  );

  const row = result.rows[0];
  const count = Number(row?.count || 0);
  const windowStart = new Date(row?.window_start || Date.now()).getTime();
  const retryAfterMs = Math.max(0, windowStart + windowMs - Date.now());

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
  };
}

export async function cleanupRateLimits(): Promise<void> {
  await getPool().query(`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`);
}
