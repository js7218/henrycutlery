import { MetadataRoute } from 'next';
import { products } from '@/data/products';
import { SITE_URL } from '@/lib/seo/site';
import { productPath } from '@/lib/seo/content';

export default function sitemap(): MetadataRoute.Sitemap {
  const productUrls = products.map((p) => ({
    url: `${SITE_URL}${productPath(p.id)}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: 'daily', priority: 0.9 },
    ...productUrls,
  ];
}