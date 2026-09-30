/**
 * SEO 内容的类型定义。
 *
 * SeoGeneratedContent —— LLM 生成、经人工确认后发布的内容（落在 seo-content.json）。
 * SeoDraft            —— 审核队列中的条目（存在 Postgres，带状态与审核信息）。
 */

export type SeoStatus = 'draft' | 'approved' | 'rejected';

export interface SeoGeneratedContent {
  /** 关联的产品 id（src/data/products.ts 中的 id）。 */
  productId: string;
  /** 面向搜索的长尾标题，含核心关键词与 MOQ。 */
  seoTitle: string;
  /** meta description，建议 120-160 字符。 */
  metaDescription: string;
  /** 关键词化 URL slug（/product/<slug>）。 */
  slug: string;
  /** 一段话摘要，用于列表页与 AI 摘要。 */
  summary: string;
  /** 完整英文产品说明（多段）。 */
  longDescription: string;
  /** 目标关键词。 */
  keywords: string[];
  /** 每张产品图对应的英文 alt 文本，顺序与 product.images 对齐。 */
  altTexts: string[];
  /** 生成时间（ISO）。 */
  generatedAt: string;
  /** 生成所用模型标识。 */
  model: string;
}

export interface SeoDraft extends SeoGeneratedContent {
  id: string;
  status: SeoStatus;
  createdAt: string;
  updatedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}