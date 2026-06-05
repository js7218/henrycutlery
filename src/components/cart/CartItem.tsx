'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatPrice } from '@/lib/utils';

export default function CartItem({ item }: { item: { product: any; quantity: number } }) {
  const { updateQuantity, removeFromCart } = useApp();

  return (
    <div className="flex flex-col sm:flex-row gap-4 p-4 bg-surface border border-border rounded-lg">
      {/* Product Image */}
      <Link href={`/product/${item.product.id}`} className="flex-shrink-0">
        <div className="relative w-full sm:w-28 h-28 rounded-lg overflow-hidden bg-surfaceLight">
          <Image
            src={item.product.images[0]}
            alt={item.product.name}
            fill
            className="object-cover"
          />
        </div>
      </Link>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <div>
            <Link href={`/product/${item.product.id}`} className="block">
              <h3 className="text-foreground font-medium hover:text-gold transition-colors line-clamp-1">
                {item.product.name}
              </h3>
            </Link>
            <p className="text-sm text-steel mt-1">{item.product.brand}</p>
            <p className="text-xs text-gray-500 mt-1">
              {item.product.specs.bladeLength} · {item.product.specs.bladeMaterial}
            </p>
          </div>
          <button
            onClick={() => removeFromCart(item.product.id)}
            className="p-2 text-gray-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {/* Price & Quantity */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
              className="w-8 h-8 flex items-center justify-center border border-border rounded hover:border-gold transition-colors"
            >
              <Minus className="w-4 h-4 text-gray-400" />
            </button>
            <span className="w-10 text-center text-foreground">{item.quantity}</span>
            <button
              onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
              disabled={item.quantity >= item.product.stock}
              className="w-8 h-8 flex items-center justify-center border border-border rounded hover:border-gold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gold">
              {formatPrice(item.product.price * item.quantity)}
            </p>
            {item.quantity > 1 && (
              <p className="text-xs text-gray-500">
                单价: {formatPrice(item.product.price)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyCart() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <ShoppingBag className="w-16 h-16 text-gray-600 mb-4" />
      <h3 className="text-xl font-medium text-gray-400 mb-2">购物车是空的</h3>
      <p className="text-sm text-gray-500 mb-6">快去挑选心仪的刀具吧</p>
      <Link href="/products" className="btn-primary">
        浏览商品
      </Link>
    </div>
  );
}
