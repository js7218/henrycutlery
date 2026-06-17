'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle, ArrowLeft, ArrowRight, Copy, MapPin, CreditCard } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatPrice, generateOrderNumber } from '@/lib/utils';
import { Address } from '@/types';
import CheckoutSteps from '@/components/checkout/CheckoutSteps';
import PaymentSelector from '@/components/checkout/PaymentSelector';

type CheckoutStep = 'confirm' | 'payment' | 'complete';

export default function CheckoutPage() {
  const router = useRouter();
  const { state, cartTotal, createOrder } = useApp();
  
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('confirm');
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay' | 'card'>('wechat');
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(
    state.user?.addresses.find(a => a.isDefault) || state.user?.addresses[0] || null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [copied, setCopied] = useState(false);

  // New address form
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState<Partial<Address>>({
    name: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    isDefault: false,
  });

  const shippingFee = cartTotal >= 500 ? 0 : 50;
  const totalAmount = cartTotal + shippingFee;

  if (state.cart.length === 0 && currentStep !== 'complete') {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-20">
        <CheckoutSteps currentStep={2} />
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-gray-400 mb-4">购物车是空的</h2>
          <Link href="/products" className="btn-primary">
            去选购
          </Link>
        </div>
      </div>
    );
  }

  const handleConfirmOrder = () => {
    if (!selectedAddress) return;
    setCurrentStep('payment');
  };

  const handlePayment = async () => {
    if (!selectedAddress) return;
    
    setIsProcessing(true);
    
    // Simulate payment process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const order = createOrder(selectedAddress, paymentMethod);
    setOrderNumber(order.orderNumber);
    setCurrentStep('complete');
    setIsProcessing(false);
  };

  const handleCopyOrderNumber = () => {
    navigator.clipboard.writeText(orderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStepNumber = () => {
    switch (currentStep) {
      case 'confirm': return 2;
      case 'payment': return 3;
      case 'complete': return 4;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      <CheckoutSteps currentStep={getStepNumber()} />
      
      <h1 className="text-3xl font-bold text-foreground mb-8" style={{ fontFamily: 'Playfair Display, serif' }}>
        {currentStep === 'confirm' && '确认订单'}
        {currentStep === 'payment' && '选择支付方式'}
        {currentStep === 'complete' && '订单完成'}
      </h1>

      {/* Step 1: Confirm Order */}
      {currentStep === 'confirm' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Addresses & Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Shipping Address */}
            <div className="bg-surface border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-gold" />
                  收货地址
                </h2>
                {!showNewAddressForm && (
                  <button 
                    onClick={() => setShowNewAddressForm(true)}
                    className="text-sm text-gold hover:underline"
                  >
                    + 新增地址
                  </button>
                )}
              </div>

              {showNewAddressForm ? (
                <div className="space-y-4 p-4 bg-surfaceLight rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      placeholder="收货人姓名"
                      value={newAddress.name}
                      onChange={e => setNewAddress({ ...newAddress, name: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="手机号码"
                      value={newAddress.phone}
                      onChange={e => setNewAddress({ ...newAddress, phone: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <input
                      placeholder="省份"
                      value={newAddress.province}
                      onChange={e => setNewAddress({ ...newAddress, province: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="城市"
                      value={newAddress.city}
                      onChange={e => setNewAddress({ ...newAddress, city: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="区县"
                      value={newAddress.district}
                      onChange={e => setNewAddress({ ...newAddress, district: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <input
                    placeholder="详细地址"
                    value={newAddress.detail}
                    onChange={e => setNewAddress({ ...newAddress, detail: e.target.value })}
                    className="input-field"
                  />
                  <div className="flex justify-end gap-4">
                    <button
                      onClick={() => setShowNewAddressForm(false)}
                      className="px-4 py-2 text-gray-400 hover:text-foreground"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        const addr: Address = {
                          id: `a${Date.now()}`,
                          name: newAddress.name || '',
                          phone: newAddress.phone || '',
                          province: newAddress.province || '',
                          city: newAddress.city || '',
                          district: newAddress.district || '',
                          detail: newAddress.detail || '',
                          isDefault: newAddress.isDefault || false,
                        };
                        setSelectedAddress(addr);
                        setShowNewAddressForm(false);
                        setNewAddress({
                          name: '',
                          phone: '',
                          province: '',
                          city: '',
                          district: '',
                          detail: '',
                          isDefault: false,
                        });
                      }}
                      className="px-4 py-2 bg-gold text-background rounded-lg"
                    >
                      保存地址
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedAddress ? (
                    <div 
                      className="p-4 border-2 border-gold bg-gold/5 rounded-lg cursor-pointer"
                      onClick={() => {}}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-foreground">{selectedAddress.name}</p>
                          <p className="text-sm text-gray-400 mt-1">{selectedAddress.phone}</p>
                          <p className="text-sm text-gray-400 mt-1">
                            {selectedAddress.province} {selectedAddress.city} {selectedAddress.district} {selectedAddress.detail}
                          </p>
                        </div>
                        {selectedAddress.isDefault && (
                          <span className="px-2 py-1 bg-gold/20 text-gold text-xs rounded">默认</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-center py-8">暂无收货地址</p>
                  )}
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className="bg-surface border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">商品清单</h2>
              <div className="space-y-4">
                {state.cart.map(item => (
                  <div key={item.product.id} className="flex items-center gap-4 p-4 bg-surfaceLight rounded-lg">
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-background">
                      <Image
                        src={item.product.images[0]}
                        alt={item.product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground font-medium line-clamp-1">{item.product.name}</p>
                      <p className="text-sm text-gray-400">{item.product.brand}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gold font-medium">{formatPrice(item.product.price)}</p>
                      <p className="text-sm text-gray-400">x{item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-surface border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-6">订单金额</h2>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-400">
                  <span>商品总价</span>
                  <span>{formatPrice(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>运费</span>
                  <span>{shippingFee === 0 ? <span className="text-green-400">免运费</span> : formatPrice(shippingFee)}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-lg font-medium text-foreground">应付总额</span>
                  <span className="text-2xl font-bold text-gold">{formatPrice(totalAmount)}</span>
                </div>
                <button
                  onClick={handleConfirmOrder}
                  disabled={!selectedAddress}
                  className="w-full py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  确认订单
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Payment */}
      {currentStep === 'payment' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-gold" />
                选择支付方式
              </h2>
              <PaymentSelector selected={paymentMethod} onSelect={setPaymentMethod} />
            </div>

            {/* Order Summary */}
            <div className="bg-surface border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">订单摘要</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>收货地址</span>
                  <span className="text-foreground">
                    {selectedAddress?.province} {selectedAddress?.city} {selectedAddress?.district}
                  </span>
                </div>
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
                  <span>{shippingFee === 0 ? <span className="text-green-400">免运费</span> : formatPrice(shippingFee)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-surface border border-border rounded-lg p-6">
              <div className="text-center mb-6">
                <p className="text-sm text-gray-400 mb-2">应付总额</p>
                <p className="text-3xl font-bold text-gold">{formatPrice(totalAmount)}</p>
              </div>
              <button
                onClick={handlePayment}
                disabled={isProcessing}
                className="w-full py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <span className="w-5 h-5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    支付中...
                  </>
                ) : (
                  <>确认支付</>
                )}
              </button>
              <button
                onClick={() => setCurrentStep('confirm')}
                className="w-full mt-4 py-3 text-gray-400 hover:text-gold transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                返回修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Complete */}
      {currentStep === 'complete' && (
        <div className="max-w-lg mx-auto text-center py-12">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">订单提交成功</h2>
          <p className="text-gray-400 mb-8">感谢您的购买！</p>

          <div className="bg-surface border border-border rounded-lg p-6 mb-8">
            <p className="text-sm text-gray-400 mb-2">订单号</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl font-mono text-gold">{orderNumber}</span>
              <button
                onClick={handleCopyOrderNumber}
                className="p-2 text-gray-400 hover:text-gold transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            {copied && <p className="text-xs text-green-400 mt-2">已复制</p>}
            <p className="text-sm text-gray-500 mt-4">
              我们将尽快为您发货，请注意查收短信通知
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/profile?tab=orders">
              <button className="w-full sm:w-auto px-8 py-3 border border-gold text-gold rounded-lg hover:bg-gold/10 transition-colors">
                查看订单
              </button>
            </Link>
            <Link href="/products">
              <button className="w-full sm:w-auto px-8 py-3 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors">
                继续购物
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
