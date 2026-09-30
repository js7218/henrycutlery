import { products } from '@/data/products';
import { SITE_URL, SITE_NAME } from '@/lib/seo/site';
import { getPublishedSeo, productPath } from '@/lib/seo/content';

/**
 * /llms.txt —— 给 AI 搜索引擎（ChatGPT / Claude / Perplexity 等）的站点摘要。
 * 采用 llms.txt 约定：一个 H1、一段 blockquote 摘要、若干分节链接。
 */
export const dynamic = 'force-static';

export function GET() {
  const moqs = products
    .map((p) => p.moq)
    .filter((m): m is number => typeof m === 'number');
  const prices = products.map((p) => p.price).filter((n) => Number.isFinite(n) && n > 0);

  const minMoq = moqs.length ? Math.min(...moqs) : null;
  const maxMoq = moqs.length ? Math.max(...moqs) : null;
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  const contact =
    process.env.NEXT_PUBLIC_BUSINESS_EMAIL || 'info@adamcutlery.com';

  const lines: string[] = [];

  lines.push(`# ${SITE_NAME}`);
  lines.push('');
  lines.push(
    '> B2B OEM/ODM knife manufacturer and wholesaler. Custom folding knives, fixed-blade hunting knives, kitchen knives, damascus collections and multi-tools for private-label brands and wholesale buyers. Factory-direct pricing, small-batch customization, worldwide shipping.',
  );
  lines.push('');

  lines.push('## Business model');
  lines.push('');
  lines.push('- OEM / ODM customization: blade steel, handle material, dimensions, logo and packaging');
  lines.push('- Wholesale and private-label supply for knife brands and distributors');
  if (minMoq !== null && maxMoq !== null) {
    lines.push(`- Minimum order quantity: ${minMoq}${minMoq === maxMoq ? '' : `–${maxMoq}`} pcs per SKU`);
  }
  if (minPrice !== null && maxPrice !== null) {
    lines.push(`- Unit price range: $${minPrice}${minPrice === maxPrice ? '' : `–$${maxPrice}`} per piece`);
  }
  lines.push(`- Contact: ${contact}`);
  lines.push('');

  lines.push('## Product catalog');
  lines.push('');
  for (const p of products) {
    const published = getPublishedSeo(p.id);
    const title = published?.seoTitle || p.name;
    const summary = published?.summary || p.description;
    lines.push(`- [${title}](${SITE_URL}${productPath(p.id)}): ${summary}`);
  }
  lines.push('');

  lines.push('## Key pages');
  lines.push('');
  lines.push(`- [Home](${SITE_URL}): company overview and featured knives`);
  lines.push(`- [All products](${SITE_URL}/products): full catalog of folding, hunting, kitchen and collection knives`);
  lines.push(`- [Sitemap](${SITE_URL}/sitemap.xml)`);
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}