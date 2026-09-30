import type { Product, ProductCategory } from '@/types';
import { chatJson, isLlmConfigured, llmModelName } from './llm';
import type { SeoGeneratedContent } from './types';

/**
 * SEO 内容生成。
 *
 * 生成规则提取自 KaiLionCrafts 的独立站模式：
 *  - 标题 = 「强力形容词 + 产品类型 + 特征/材质 + OEM Custom + 使用场景 | MOQ MOQ」
 *  - slug 由标题核心词派生
 *  - meta description 聚焦 B2B 采购意图（OEM/ODM、MOQ、工厂直供）
 *  - 长描述用平实英文，禁止 emoji 与夸张措辞（避免机翻味与 slop）
 *
 * 未配置 DEEPSEEK_API_KEY 时走确定性模板（dry-run），保证链路可测。
 */

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  kitchen: 'Kitchen Knife',
  folding: 'Folding Knife',
  collection: 'Collector Knife',
  hunting: 'Hunting Knife',
  damascus: 'Damascus Knife',
  multitool: 'Multi-Tool Knife',
  edc: 'EDC Pocket Knife',
  tactical: 'Tactical Knife',
  boning: 'Boning Knife',
};

const SYSTEM_PROMPT = `You are an SEO copywriter for a B2B OEM/ODM knife manufacturer that supplies private-label brands and wholesale buyers worldwide.

Write English product content for search and for AI answer engines. Rules:
- seoTitle: long-tail, keyword-rich, max 110 characters. Pattern: "[Strong adjective] [product type], [key material/feature] OEM Custom [use case] | [MOQ] MOQ". No ALL CAPS, no emoji, no hype words like "best ever".
- slug: lowercase kebab-case derived from the core keywords of seoTitle, max 60 characters, ASCII only.
- metaDescription: 120-160 characters, mentions OEM/ODM or wholesale, MOQ and material. No emoji.
- summary: 1-2 plain sentences for list pages and AI summaries.
- longDescription: 3-5 short paragraphs of factual English. Describe material, build, use case and customization options. Only use facts given. No emoji, no "world's best", no unverifiable claims, no pricing promises.
- keywords: 5-8 lowercase search phrases buyers actually type.
- altTexts: exactly one short English alt text per provided image, describing what is visible, max 125 characters.

Return ONLY a JSON object with exactly these keys: seoTitle, slug, metaDescription, summary, longDescription, keywords, altTexts.`;

/** 去掉 emoji 与各类装饰性符号，避免机翻观感。 */
export function stripEmoji(input: string): string {
  return input
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function clampText(input: string, max: number): string {
  const clean = stripEmoji(input).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}\u2026`;
}

function buildMoqLabel(product: Product): string {
  return product.moq ? `${product.moq} MOQ` : 'OEM Orders';
}

function buildProductFacts(product: Product): string {
  const specs = product.specs || ({} as Product['specs']);
  return [
    `Product id: ${product.id}`,
    `Current name: ${product.name}`,
    `Brand: ${product.brand}`,
    `Category: ${CATEGORY_LABELS[product.category] || product.category}`,
    `Unit price: USD ${product.price}`,
    specs.bladeMaterial ? `Blade material: ${specs.bladeMaterial}` : '',
    specs.handleMaterial ? `Handle material: ${specs.handleMaterial}` : '',
    specs.bladeLength ? `Blade length: ${specs.bladeLength}` : '',
    specs.totalLength ? `Overall length: ${specs.totalLength}` : '',
    specs.hardness ? `Hardness: ${specs.hardness}` : '',
    product.moq ? `Minimum order quantity: ${product.moq} pcs` : '',
    product.tags?.length ? `Existing tags: ${product.tags.join(', ')}` : '',
    `Current description: ${product.description}`,
    `Image count: ${product.images.length}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** 无 API key 时的确定性模板输出，用于跑通链路与本地验证。 */
export function buildDryRunContent(product: Product): SeoGeneratedContent {
  const categoryLabel = CATEGORY_LABELS[product.category] || 'Knife';
  const material = product.specs?.bladeMaterial ? `${product.specs.bladeMaterial} ` : '';
  const moqLabel = buildMoqLabel(product);

  const seoTitle = clampText(
    `${titleCase(product.name)} \u2013 ${material}OEM Custom ${categoryLabel} for Private Label | ${moqLabel}`,
    110,
  );

  const slug = slugify(
    `${product.name} ${product.specs?.bladeMaterial || ''} ${categoryLabel}`,
  );

  const metaDescription = clampText(
    `${product.name} with ${material || 'custom '}build, OEM/ODM and private-label ready. ${moqLabel}, factory-direct supply for wholesale knife buyers. Custom blade steel, handle and packaging available.`,
    158,
  );

  const summary = clampText(product.description, 220);

  const longDescription = stripEmoji(product.longDescription || product.description)
    .replace(/\s*Price:.*$/gim, '')
    .replace(/\s*MOQ:.*$/gim, '')
    .replace(/\s*Minimum order.*$/gim, '')
    .trim();

  const keywords = Array.from(
    new Set(
      [
        ...(product.tags || []),
        categoryLabel.toLowerCase(),
        'oem knife',
        'wholesale knife',
        'private label knife',
        'custom knife manufacturer',
      ].map((k) => k.toLowerCase()),
    ),
  ).slice(0, 8);

  const altTexts = product.images.map((_, index) =>
    clampText(`${product.name} ${material}${categoryLabel} product view ${index + 1}`, 120),
  );

  return {
    productId: product.id,
    seoTitle,
    metaDescription,
    slug,
    summary,
    longDescription,
    keywords,
    altTexts,
    generatedAt: new Date().toISOString(),
    model: 'dry-run',
  };
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => stripEmoji(item))
    .filter(Boolean);
}

/** 校验并规范化模型输出，任何缺项回退到 dry-run 结果。 */
function sanitizeContent(
  raw: unknown,
  product: Product,
  fallback: SeoGeneratedContent,
): SeoGeneratedContent {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const seoTitle =
    typeof obj.seoTitle === 'string' && obj.seoTitle.trim()
      ? clampText(obj.seoTitle, 110)
      : fallback.seoTitle;

  const slugSource =
    typeof obj.slug === 'string' && obj.slug.trim() ? obj.slug : fallback.slug;
  const slug = slugify(slugSource) || fallback.slug;

  const metaDescription =
    typeof obj.metaDescription === 'string' && obj.metaDescription.trim()
      ? clampText(obj.metaDescription, 160)
      : fallback.metaDescription;

  const summary =
    typeof obj.summary === 'string' && obj.summary.trim()
      ? clampText(obj.summary, 300)
      : fallback.summary;

  const longDescription =
    typeof obj.longDescription === 'string' && obj.longDescription.trim()
      ? stripEmoji(obj.longDescription)
      : fallback.longDescription;

  const keywords = coerceStringArray(obj.keywords);
  const altTexts = coerceStringArray(obj.altTexts);

  return {
    productId: product.id,
    seoTitle,
    metaDescription,
    slug,
    summary,
    longDescription,
    keywords: keywords.length ? keywords.slice(0, 8) : fallback.keywords,
    altTexts: altTexts.length
      ? altTexts.slice(0, product.images.length).map((t) => clampText(t, 125))
      : fallback.altTexts,
    generatedAt: new Date().toISOString(),
    model: llmModelName(),
  };
}

/**
 * 为单个产品生成 SEO 内容。
 * 未配置 key 时返回 dry-run 结果（model 标记为 dry-run）。
 */
export async function generateSeoForProduct(product: Product): Promise<SeoGeneratedContent> {
  const fallback = buildDryRunContent(product);

  if (!isLlmConfigured()) {
    return fallback;
  }

  const raw = await chatJson([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Generate SEO content for this product.\n\n${buildProductFacts(product)}`,
    },
  ]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('DeepSeek returned invalid JSON');
  }

  return sanitizeContent(parsed, product, fallback);
}