import rawContent from '@/data/seo-content.json';
import { products } from '@/data/products';
import type { SeoGeneratedContent } from './types';

interface SeoContentFile {
  generated_at?: string | null;
  items?: Record<string, SeoGeneratedContent>;
}

const file = rawContent as SeoContentFile;
const items: Record<string, SeoGeneratedContent> = file.items || {};

/** 取某个产品「已发布」的 SEO 内容覆盖（无则返回 null）。 */
export function getPublishedSeo(productId: string): SeoGeneratedContent | null {
  return items[productId] || null;
}

/** 全部已发布内容，按产品 id 索引。 */
export function getAllPublishedSeo(): Record<string, SeoGeneratedContent> {
  return items;
}

export function getSeoContentGeneratedAt(): string | null {
  return file.generated_at || null;
}

/**
 * 把 URL 参数解析成产品 id。
 * 先按 id 命中（保持老链接可用），再按 slug 命中（关键词化链接）。
 */
export function resolveProductId(param: string): string | null {
  if (products.some((p) => p.id === param)) return param;

  for (const [id, content] of Object.entries(items)) {
    if (content.slug === param) return id;
  }

  return null;
}

/** 产品的对外链接路径：有已发布 slug 则用 slug，否则退回 id。 */
export function productPath(productId: string): string {
  const published = getPublishedSeo(productId);
  return `/product/${published?.slug || productId}`;
}