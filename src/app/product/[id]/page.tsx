import { notFound } from 'next/navigation';
import { getProductById } from '@/data/products';
import { resolveProductId } from '@/lib/seo/content';
import ProductDetailClient from './ProductDetailClient';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * 服务端外壳：商品不存在时在渲染任何页面内容之前返回 404。
 * 客户端组件只负责交互，若把存在性判断放在 client 页面里，
 * 响应头会先以 200 流出，形成软 404。
 */
export default async function ProductPage({ params }: RouteParams) {
  const { id } = await params;
  const productId = resolveProductId(id) || id;

  if (!getProductById(productId)) {
    notFound();
  }

  return <ProductDetailClient />;
}
