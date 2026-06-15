'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowLeft, Copy, MapPin, CreditCard, AlertCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatPrice, calculateShippingFee } from '@/lib/utils';
import { securityLogger } from '@/lib/securityLogger';
import { Address, PaymentMethod } from '@/types';
import CheckoutSteps from '@/components/checkout/CheckoutSteps';
import PaymentSelector from '@/components/checkout/PaymentSelector';

type CheckoutStep = 'confirm' | 'payment' | 'complete';

const COUNTRY_CODES = [
  { code: '+86', label: 'China +86' },
  { code: '+1', label: 'US/Canada +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+61', label: 'Australia +61' },
  { code: '+49', label: 'Germany +49' },
  { code: '+33', label: 'France +33' },
  { code: '+39', label: 'Italy +39' },
  { code: '+34', label: 'Spain +34' },
  { code: '+81', label: 'Japan +81' },
  { code: '+82', label: 'Korea +82' },
  { code: '+65', label: 'Singapore +65' },
  { code: '+60', label: 'Malaysia +60' },
  { code: '+66', label: 'Thailand +66' },
  { code: '+971', label: 'UAE +971' },
  { code: '+966', label: 'Saudi Arabia +966' },
  { code: '+91', label: 'India +91' },
  { code: '+52', label: 'Mexico +52' },
  { code: '+55', label: 'Brazil +55' },
  { code: '+27', label: 'South Africa +27' },
];

function validAddressPart(value?: string, min = 2, max = 100) {
  const clean = (value || '').trim();
  return clean.length >= min &&
    clean.length <= max &&
    !/^(n\/a|na|none|null|undefined|省份|城市|地区|province|city|district)$/i.test(clean);
}

function validInternationalPhone(phone?: string) {
  return /^\+[1-9]\d{0,3}\s?[0-9][0-9\s().-]{5,30}$/.test((phone || '').trim());
}

function validateAddress(address: Address | null): string {
  if (!address) return 'Please add a shipping address.';
  if (!validAddressPart(address.name, 2, 100)) return 'Please enter a valid name.';
  if (!validInternationalPhone(address.phone)) return 'Please enter a valid phone number with country code, e.g. +86 13800138000.';
  if (!validAddressPart(address.province)) return 'Please enter a valid province/state.';
  if (!validAddressPart(address.city)) return 'Please enter a valid city.';
  if (!validAddressPart(address.district)) return 'Please enter a valid district/area.';
  if (!validAddressPart(address.detail, 5, 300)) return 'Please enter a complete detailed address.';
  return '';
}

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
  const [addressError, setAddressError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [countryCode, setCountryCode] = useState('+86');
  const lastPaymentAttemptRef = useRef(0);

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
    const error = validateAddress(selectedAddress);
    if (error) {
      setAddressError(error);
      return;
    }
    setAddressError('');
    setPaymentError('');
    setCurrentStep('payment');
  };

  const handlePayment = async () => {
    if (!selectedAddress) return;
    if (isProcessing) return;
    const now = Date.now();
    if (now - lastPaymentAttemptRef.current < 3000) return;
    lastPaymentAttemptRef.current = now;

    const addressValidation = validateAddress(selectedAddress);
    if (addressValidation) {
      securityLogger.log('INPUT_VALIDATION_FAILURE', 'Checkout: incomplete address');
      setAddressError(addressValidation);
      return;
    }

    setIsProcessing(true);
    setPaymentError('');

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

      let result;
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok || !result.success) {
        if (response.status === 401 || result.code === 'LOGIN_REQUIRED') {
          router.replace('/login?next=/checkout');
          setIsProcessing(false);
          return;
        }
        const errorCode = result.code ? ` (${result.code})` : '';
        securityLogger.log('PRICE_TAMPERING_ATTEMPT', `Order API rejected: ${result.error || result.code || response.status}`);
        setPaymentError(result.error ? `${result.error}${errorCode}` : `Order failed (Error ${response.status}). Please try again.`);
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
      setPaymentError('Network error. Please check your connection and try again.');
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
                      placeholder="Name"
                      value={newAddress.name}
                      onChange={e => setNewAddress({ ...newAddress, name: e.target.value })}
                      className="input-field"
                    />
                    <div className="grid grid-cols-[140px_1fr] gap-2">
                      <select
                        value={countryCode}
                        onChange={e => setCountryCode(e.target.value)}
                        className="input-field"
                      >
                        {COUNTRY_CODES.map((item) => (
                          <option key={item.code} value={item.code}>{item.label}</option>
                        ))}
                      </select>
                      <input
                        placeholder="Phone Number"
                        value={newAddress.phone}
                        onChange={e => setNewAddress({ ...newAddress, phone: e.target.value })}
                        className="input-field"
                      />
                    </div>
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
                        const cleanPhone = `${countryCode} ${String(newAddress.phone || '').replace(/^\+\d{1,4}\s*/, '').trim()}`;
                        const addr: Address = {
                          id: `a${Date.now()}`,
                          name: String(newAddress.name || '').trim(),
                          phone: cleanPhone.trim(),
                          province: String(newAddress.province || '').trim(),
                          city: String(newAddress.city || '').trim(),
                          district: String(newAddress.district || '').trim(),
                          detail: String(newAddress.detail || '').trim(),
                          isDefault: newAddress.isDefault || false,
                        };
                        const error = validateAddress(addr);
                        if (error) {
                          setAddressError(error);
                          return;
                        }
                        setSelectedAddress(addr);
                        setAddressError('');
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
              {addressError && (
                <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  {addressError}
                </p>
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
                  disabled={!selectedAddress || Boolean(validateAddress(selectedAddress))}
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
              {paymentError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}
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

            {/* HSBC Payment Instructions */}
            {paymentMethod === 'bank_transfer' && (
              <div className="mt-6 text-left bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                <h3 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  HSBC Bank Transfer Details
                </h3>
                <div className="space-y-2 text-sm text-gray-300">
                  <p><span className="text-gray-500">Account Name:</span> Adam Cutlery</p>
                  <p><span className="text-gray-500">Account Number:</span> <span className="font-mono text-gold">147-6411161-838</span></p>
                  <p><span className="text-gray-500">Bank:</span> HSBC</p>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Please transfer the total amount to the above account. We will confirm your payment and arrange shipment within 24 hours.
                </p>
              </div>
            )}

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
