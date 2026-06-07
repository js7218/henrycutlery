'use client';

import Link from 'next/link';
import { ShoppingBag, Truck, ArrowRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatPrice } from '@/lib/utils';
import CartItem from '@/components/cart/CartItem';
import CheckoutSteps from '@/components/checkout/CheckoutSteps';

export default function CartPage() {
  const { state, cartTotal, clearCart } = useApp();
  const shippingFee = cartTotal >= 500 ? 0 : 50;
  const totalAmount = cartTotal + shippingFee;

  if (state.cart.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-20">
        <CheckoutSteps currentStep={1} />
        <div className="flex flex-col items-center justify-center py-20">
          <ShoppingBag className="w-20 h-20 text-gray-600 mb-6" />
          <h2 className="text-2xl font-bold text-gray-400 mb-4">Your Shopping Cart is Empty</h2>
          <p className="text-gray-500 mb-8">Go pick your favorite knives</p>
          <Link href="/products" className="btn-primary">
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      <CheckoutSteps currentStep={1} />

      <h1 className="text-3xl font-bold text-foreground mb-8" style={{ fontFamily: 'Playfair Display, serif' }}>
        My Shopping Cart
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {state.cart.map((item) => (
            <CartItem key={item.product.id} item={item} />
          ))}

          <button
            onClick={clearCart}
            className="text-sm text-gray-500 hover:text-red-400 transition-colors mt-4"
          >
            Clear Shopping Cart
          </button>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-surface border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Order Summary</h2>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-gray-400">
                <span>Items</span>
                <span>{state.cart.reduce((sum, item) => sum + item.quantity, 0)} pcs</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Subtotal</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Shipping</span>
                <span>
                  {shippingFee === 0 ? (
                    <span className="text-green-400">Free Shipping</span>
                  ) : (
                    formatPrice(shippingFee)
                  )}
                </span>
              </div>
              {cartTotal < 500 && (
                <div className="p-3 bg-surfaceLight rounded-lg">
                  <p className="text-xs text-gray-400">
                    Add <span className="text-gold font-medium">{formatPrice(500 - cartTotal)}</span> more for free shipping
                  </p>
                  <div className="mt-2 h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gold rounded-full transition-all"
                      style={{ width: `${Math.min(100, (cartTotal / 500) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-medium text-foreground">Total</span>
                <span className="text-2xl font-bold text-gold">{formatPrice(totalAmount)}</span>
              </div>

              <Link href="/checkout" className="block">
                <button className="w-full py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors flex items-center justify-center gap-2">
                  Checkout
                  <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
            </div>

            {/* Guarantees */}
            <div className="mt-6 pt-6 border-t border-border space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <Truck className="w-4 h-4 text-gold" />
                <span>Free Shipping Nationwide</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <svg className="w-4 h-4 text-gold" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>7-Day Return Policy</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <svg className="w-4 h-4 text-gold" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <span>Secure Payment</span>
              </div>
            </div>
          </div>

          {/* Continue Shopping */}
          <Link href="/products" className="block mt-4 text-center text-sm text-gray-400 hover:text-gold transition-colors">
            Continue Shopping →
          </Link>
        </div>
      </div>
    </div>
  );
}
