'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowLeft, Copy, MapPin, CreditCard } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatPrice, calculateShippingFee } from '@/lib/utils';
import { securityLogger } from '@/lib/securityLogger';
import { Address, PaymentMethod } from '@/types';
import CheckoutSteps from '@/components/checkout/CheckoutSteps';
import PaymentSelector from '@/components/checkout/PaymentSelector';

type CheckoutStep = 'confirm' | 'payment' | 'complete';

export default function CheckoutPage() {
  const { state, dispatch, cartTotal } = useApp();
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<CheckoutStep>('confirm');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat');
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

  const shippingFee = calculateShippingFee(state.cart);
  const totalAmount = cartTotal + shippingFee;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!state.user && currentStep !== 'complete') {
        router.replace('/login?next=/checkout');
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [state.user, currentStep, router]);

  if (!state.user && currentStep !== 'complete') {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-20">
        <CheckoutSteps currentStep={2} />
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-gray-400 mb-4">Please Sign In to Checkout</h2>
          <p className="text-gray-500 mb-8">You need to log in or register before placing an order.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login?next=/checkout" className="btn-primary">
              Sign In
            </Link>
            <Link href="/register?next=/checkout" className="px-6 py-3 border border-gold text-gold rounded-lg hover:bg-gold/10 transition-colors">
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state.cart.length === 0 && currentStep !== 'complete') {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-20">
        <CheckoutSteps currentStep={2} />
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-gray-400 mb-4">Shopping Cart is Empty</h2>
          <Link href="/products" className="btn-primary">
            Go Shopping
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

    // SECURITY: Validate address fields (rebuild trigger)
    if (!selectedAddress.name || !selectedAddress.phone || !selectedAddress.detail) {
      securityLogger.log('INPUT_VALIDATION_FAILURE', 'Checkout: incomplete address');
      return;
    }

    setIsProcessing(true);

    try {
      // SECURITY: Call server-side API to create order
      // Client only sends productId + quantity, server looks up prices
      const orderItems = state.cart.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
      }));

      const response = await fetch('/api/order/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: orderItems,
          address: selectedAddress,
          paymentMethod,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (response.status === 401 || result.code === 'LOGIN_REQUIRED') {
          router.replace('/login?next=/checkout');
          return;
        }
        securityLogger.log('PRICE_TAMPERING_ATTEMPT', `Order API rejected: ${result.error || result.code}`);
        setIsProcessing(false);
        return;
      }

      // SECURITY: Use server-verified order data
      const serverOrder = result.order;
      setOrderNumber(serverOrder.orderNumber);
      
      // Add order to local state using server-verified data
      dispatch({ type: 'ADD_ORDER', order: serverOrder });
      dispatch({ type: 'CLEAR_CART' });
      
      securityLogger.log('ORDER_CREATED', `Server-verified order ${serverOrder.orderNumber}, total: ${result.serverTotal}`);
      setCurrentStep('complete');
    } catch (error) {
      securityLogger.log('ORDER_FAILED', 'Failed to create order via API');
    } finally {
      setIsProcessing(false);
    }
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
        {currentStep === 'confirm' && 'Confirm Order'}
        {currentStep === 'payment' && 'Select Payment Method'}
        {currentStep === 'complete' && 'Order Complete'}
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
                  Shipping Address
                </h2>
                {!showNewAddressForm && (
                  <button 
                    onClick={() => setShowNewAddressForm(true)}
                    className="text-sm text-gold hover:underline"
                  >
                    + Add New Address
                  </button>
                )}
              </div>

              {showNewAddressForm ? (
                <div className="space-y-4 p-4 bg-surfaceLight rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      placeholder="Recipient Name"
                      value={newAddress.name}
                      onChange={e => setNewAddress({ ...newAddress, name: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="Phone Number"
                      value={newAddress.phone}
                      onChange={e => setNewAddress({ ...newAddress, phone: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <input
                      placeholder="Province"
                      value={newAddress.province}
                      onChange={e => setNewAddress({ ...newAddress, province: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="City"
                      value={newAddress.city}
                      onChange={e => setNewAddress({ ...newAddress, city: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="District"
                      value={newAddress.district}
                      onChange={e => setNewAddress({ ...newAddress, district: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <input
                    placeholder="Detailed Address"
                    value={newAddress.detail}
                    onChange={e => setNewAddress({ ...newAddress, detail: e.target.value })}
                    className="input-field"
                  />
                  <div className="flex justify-end gap-4">
                    <button
                      onClick={() => setShowNewAddressForm(false)}
                      className="px-4 py-2 text-gray-400 hover:text-foreground"
                    >
                      Cancel
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
                      Save Address
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
                          <span className="px-2 py-1 bg-gold/20 text-gold text-xs rounded">Default</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-center py-8">No shipping address</p>
                  )}
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className="bg-surface border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Order Items</h2>
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
                      <p className="text-foreground font-medium line-clamp-1">{item.product.name.toUpperCase()}</p>
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
              <h2 className="text-lg font-semibold text-foreground mb-6">Order Total</h2>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal</span>
                  <span>{formatPrice(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Shipping</span>
                  <span>{shippingFee === 0 ? <span className="text-green-400">Free Shipping</span> : formatPrice(shippingFee)}</span>
                </div>
                <p className="text-xs text-gray-500">
                  International shipping is available. Final delivery details will be confirmed by email.
                </p>
              </div>
              <div className="pt-4 border-t border-border">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-lg font-medium text-foreground">Total</span>
                  <span className="text-2xl font-bold text-gold">{formatPrice(totalAmount)}</span>
                </div>
                <button
                  onClick={handleConfirmOrder}
                  disabled={!selectedAddress}
                  className="w-full py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm Order
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
                Select Payment Method
              </h2>
              <PaymentSelector selected={paymentMethod} onSelect={setPaymentMethod} />
            </div>

            {/* Order Summary */}
            <div className="bg-surface border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Order Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Shipping Address</span>
                  <span className="text-foreground">
                    {selectedAddress?.province} {selectedAddress?.city} {selectedAddress?.district}
                  </span>
                </div>
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
                  <span>{shippingFee === 0 ? <span className="text-green-400">Free Shipping</span> : formatPrice(shippingFee)}</span>
                </div>
                <p className="text-xs text-gray-500 pt-2">
                  Order confirmation and secure payment arrangement will be handled by email.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-surface border border-border rounded-lg p-6">
              <div className="text-center mb-6">
                <p className="text-sm text-gray-400 mb-2">Total Amount</p>
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
                    Processing...
                  </>
                ) : (
                  <>Confirm Payment</>
                )}
              </button>
              <button
                onClick={() => setCurrentStep('confirm')}
                className="w-full mt-4 py-3 text-gray-400 hover:text-gold transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Edit
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
          <h2 className="text-2xl font-bold text-foreground mb-2">Order Submitted Successfully</h2>
          <p className="text-gray-400 mb-8">Thank you for your purchase!</p>

          <div className="bg-surface border border-border rounded-lg p-6 mb-8">
            <p className="text-sm text-gray-400 mb-2">Order Number</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl font-mono text-gold">{orderNumber}</span>
              <button
                onClick={handleCopyOrderNumber}
                className="p-2 text-gray-400 hover:text-gold transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            {copied && <p className="text-xs text-green-400 mt-2">Copied</p>}
            <p className="text-sm text-gray-500 mt-4">
              We will ship your order as soon as possible. Please check email notifications.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              For international orders, delivery and payment details will be confirmed by email before shipment.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/profile?tab=orders">
              <button className="w-full sm:w-auto px-8 py-3 border border-gold text-gold rounded-lg hover:bg-gold/10 transition-colors">
                View Orders
              </button>
            </Link>
            <Link href="/products">
              <button className="w-full sm:w-auto px-8 py-3 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors">
                Continue Shopping
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
