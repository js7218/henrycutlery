import Link from 'next/link';
import { products } from '@/data/products';
import SampleRequestForm from './SampleRequestForm';

export const metadata = {
  title: 'Request a Sample · Adam Cutlery',
  description: 'Request a physical sample of Adam Cutlery Damascus knives before placing a bulk order.',
};

export default async function SampleRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const params = await searchParams;
  const productId = typeof params.product === 'string' ? params.product.slice(0, 120) : '';
  const product = products.find((item) => item.id === productId);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-16">
      <Link href="/products" className="text-sm text-gray-400 hover:text-gold">
        ← Back to products
      </Link>
      <h1 className="text-3xl font-bold mt-6 mb-2">Request a sample</h1>
      <p className="text-sm text-gray-400 mb-8">
        Most buyers want to hold the knife before committing to a bulk order. Tell us what you
        need and we will reply with the sample price, courier cost and lead time.
      </p>
      <SampleRequestForm productId={product?.id || productId} productName={product?.name || ''} />
    </div>
  );
}
