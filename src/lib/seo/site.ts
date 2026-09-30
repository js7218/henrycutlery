/**
 * 站点级 SEO 常量。所有 metadata / sitemap / robots / JSON-LD 都从这里取，
 * 避免域名在多处硬编码后互相漂移。
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://adamcutlery.com'
).replace(/\/+$/, '');

export const SITE_NAME = 'Adam Cutlery';

/** 绝对 URL 拼接，用于 canonical / og:url / sitemap。 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}