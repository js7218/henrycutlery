import type { Metadata } from 'next';
import { getProductById } from '@/data/products';
import { getPublishedSeo, resolveProductId, productPath } from '@/lib/seo/content';
import { SITE_NAME, absoluteUrl } from '@/lib/seo/site';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * 产品页的 SEO 外壳（服务端）。
 * page.tsx 是交互用的 client 组件，metadata 与结构化数据放在这层注入，
 * 避免把整个页面拆成两块。
 */

function buildFallbackDescription(name: string, description: string): string {
  const trimmed = description.trim();
  if (trimmed.length <= 158) return trimmed;
  return `${trimmed.slice(0, 155).trimEnd()}...`;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { id } = await params;
  const productId = resolveProductId(id) || id;
  const product = getProductById(productId);

  if (!product) {
    return { title: 'Product not found', robots: { index: false, follow: false } };
  }

  const published = getPublishedSeo(productId);
  const title = published?.seoTitle || `${product.name} | OEM & Wholesale | ${SITE_NAME}`;
  const description =
    published?.metaDescription ||
    buildFallbackDescription(product.name, product.description);
  const canonicalPath = productPath(productId);
  const images = product.images.slice(0, 1).map((src) => absoluteUrl(src));

  return {
    title,
    description,
    keywords: published?.keywords,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: absoluteUrl(canonicalPath),
      siteName: SITE_NAME,
      title,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images,
    },
  };
}

function buildProductJsonLd(productId: string) {
  const product = getProductById(productId);
  if (!product) return null;

  const published = getPublishedSeo(productId);
  const url = absoluteUrl(productPath(productId));

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: published?.seoTitle || product.name,
    description: published?.metaDescription || product.description,
    sku: product.id,
    category: product.category,
    brand: { '@type': 'Brand', name: product.brand || SITE_NAME },
    image: product.images.map((src) => absoluteUrl(src)),
    material: product.specs?.bladeMaterial || undefined,
    keywords: published?.keywords?.join(', ') || product.tags.join(', '),
    offers: {
      '@type': 'Offer',
      url,
      price: product.price,
      priceCurrency: 'USD',
      availability:
        product.stock > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: SITE_NAME },
      ...(product.moq
        ? {
            eligibleQuantity: {
              '@type': 'QuantitativeValue',
              value: product.moq,
              unitCode: 'C62',
            },
          }
        : {}),
    },
    ...(product.specs
      ? {
          additionalProperty: Object.entries(product.specs)
            .filter(([, value]) => Boolean(value))
            .map(([key, value]) => ({
              '@type': 'PropertyValue',
              name: key,
              value,
            })),
        }
      : {}),
  };
}

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = resolveProductId(id) || id;
  const jsonLd = buildProductJsonLd(productId);

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}