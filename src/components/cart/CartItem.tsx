'use client';
import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatPrice } from '@/lib/utils';
import { useCallback, useRef, useEffect } from 'react';

export default function CartItem({ item }: { item: { product: any; quantity: number } }) {
  const { updateQuantity, removeFromCart } = useApp();

  // Hold-to-repeat refs
  const incrementIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const decrementIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const incrementTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const decrementTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hold-to-increment logic
  const startIncrement = useCallback(() => {
    if (item.quantity >= item.product.stock) return;
    updateQuantity(item.product.id, item.quantity + 1);
    
    incrementTimeoutRef.current = setTimeout(() => {
      incrementIntervalRef.current = setInterval(() => {
        updateQuantity(item.product.id, (prev: number) => {
          if (prev >= item.product.stock) {
            stopIncrement();
            return prev;
          }
          return prev + 1;
        });
      }, 100);
    }, 400);
  }, [item.quantity, item.product.stock, item.product.id, updateQuantity]);

  const stopIncrement = useCallback(() => {
    if (incrementTimeoutRef.current) {
      clearTimeout(incrementTimeoutRef.current);
      incrementTimeoutRef.current = null;
    }
    if (incrementIntervalRef.current) {
      clearInterval(incrementIntervalRef.current);
      incrementIntervalRef.current = null;
    }
  }, []);

  // Hold-to-decrement logic
  const startDecrement = useCallback(() => {
    const minQty = item.product.moq || 1;
    if (item.quantity <= minQty) return;
    updateQuantity(item.product.id, item.quantity - 1);
    
    decrementTimeoutRef.current = setTimeout(() => {
      decrementIntervalRef.current = setInterval(() => {
        const min = item.product.moq || 1;
        if (item.quantity <= min) {
          stopDecrement();
          return;
        }
        updateQuantity(item.product.id, item.quantity - 1);
      }, 100);
    }, 400);
  }, [item.quantity, item.product.moq, item.product.id, updateQuantity]);

  const stopDecrement = useCallback(() => {
    if (decrementTimeoutRef.current) {
      clearTimeout(decrementTimeoutRef.current);
      decrementTimeoutRef.current = null;
    }
    if (decrementIntervalRef.current) {
      clearInterval(decrementIntervalRef.current);
      decrementIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopIncrement();
      stopDecrement();
    };
  }, [stopIncrement, stopDecrement]);

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
          <div className="flex items-center space-x-3 select-none">
            <button
              onMouseDown={startDecrement}
              onMouseUp={stopDecrement}
              onMouseLeave={stopDecrement}
              onTouchStart={startDecrement}
              onTouchEnd={stopDecrement}
              disabled={item.product.moq && item.quantity <= item.product.moq}
              className="w-8 h-8 flex items-center justify-center border border-border rounded hover:border-gold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Minus className="w-4 h-4 text-gray-400" />
            </button>
            <span className="w-10 text-center text-foreground">{item.quantity}</span>
            <button
              onMouseDown={startIncrement}
              onMouseUp={stopIncrement}
              onMouseLeave={stopIncrement}
              onTouchStart={startIncrement}
              onTouchEnd={stopIncrement}
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
                Unit price: {formatPrice(item.product.price)}
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
      <h3 className="text-xl font-medium text-gray-400 mb-2">Your cart is empty</h3>
      <p className="text-sm text-gray-500 mb-6">Browse our premium knife collection</p>
      <Link href="/products" className="btn-primary">
        Browse Products
      </Link>
    </div>
  );
}
