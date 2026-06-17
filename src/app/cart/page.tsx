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
          <h2 className="text-2xl font-bold text-gray-400 mb-4">购物车是空的</h2>
          <p className="text-gray-500 mb-8">快去挑选心仪的刀具吧</p>
          <Link href="/products" className="btn-primary">
            浏览商品
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      <CheckoutSteps currentStep={1} />
      
      <h1 className="text-3xl font-bold text-foreground mb-8" style={{ fontFamily: 'Playfair Display, serif' }}>
        我的购物车
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
            清空购物车
          </button>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-surface border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">订单摘要</h2>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-gray-400">
                <span>商品件数</span>
                <span>{state.cart.reduce((sum, item) => sum + item.quantity, 0)} 件</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>商品总价</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>运费</span>
                <span>
                  {shippingFee === 0 ? (
                    <span className="text-green-400">免运费</span>
                  ) : (
                    formatPrice(shippingFee)
                  )}
                </span>
              </div>
              {cartTotal < 500 && (
                <div className="p-3 bg-surfaceLight rounded-lg">
                  <p className="text-xs text-gray-400">
                    再买 <span className="text-gold font-medium">{formatPrice(500 - cartTotal)}</span> 可免运费
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
                <span className="text-lg font-medium text-foreground">应付总额</span>
                <span className="text-2xl font-bold text-gold">{formatPrice(totalAmount)}</span>
              </div>

              <Link href="/checkout" className="block">
                <button className="w-full py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors flex items-center justify-center gap-2">
                  去结算
                  <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
            </div>

            {/* Guarantees */}
            <div className="mt-6 pt-6 border-t border-border space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <Truck className="w-4 h-4 text-gold" />
                <span>全国包邮</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <svg className="w-4 h-4 text-gold" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>7天无理由退换</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <svg className="w-4 h-4 text-gold" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <span>支付安全</span>
              </div>
            </div>
          </div>

          {/* Continue Shopping */}
          <Link href="/products" className="block mt-4 text-center text-sm text-gray-400 hover:text-gold transition-colors">
            继续购物 →
          </Link>
        </div>
      </div>
    </div>
  );
}
