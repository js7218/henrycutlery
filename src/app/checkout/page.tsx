'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowLeft, Copy, MapPin, CreditCard, AlertCircle, ShieldCheck, Globe, Package } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatPrice, calculateShippingFee } from '@/lib/utils';
import { securityLogger } from '@/lib/securityLogger';
import { Address, PaymentMethod } from '@/types';
import { products as currentProducts } from '@/data/products';
import CheckoutSteps from '@/components/checkout/CheckoutSteps';
import PaymentSelector from '@/components/checkout/PaymentSelector';
import ThreeDButton from '@/components/animation/ThreeDButton';

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
    !/^(n\/a|na|none|null|undefined|province|city|district)$/i.test(clean);
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

/**
 * Simple geocoding validation using OpenStreetMap Nominatim API.
 * Returns true if the address appears valid (got at least one result).
 */
async function validateAddressGeocoding(address: Address): Promise<{ valid: boolean; displayName?: string }> {
  try {
    const query = encodeURIComponent(`${address.detail}, ${address.district}, ${address.city}, ${address.province}`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return { valid: true }; // Fail open if API is down
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { valid: true, displayName: data[0].display_name };
    }
    return { valid: false };
  } catch {
    return { valid: true }; // Fail open
  }
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [paymentError, setPaymentError] = useState('');
  const [countryCode, setCountryCode] = useState('+86');
  const [geocodingValid, setGeocodingValid] = useState<boolean | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
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
            <ThreeDButton href="/login?next=/checkout" variant="primary">
              Sign In
            </ThreeDButton>
            <ThreeDButton href="/register?next=/checkout" variant="outline">
              Register
            </ThreeDButton>
          </div>
        </div>
      </div>
    );
  }

  // SECURITY: Filter out products that have been removed from catalog
  const validProductIds = new Set(currentProducts.map(p => p.id));
  const validCartItems = state.cart.filter(item => validProductIds.has(item.product.id));
  const removedCartItems = state.cart.filter(item => !validProductIds.has(item.product.id));

  // Auto-remove deleted products from cart
  useEffect(() => {
    if (removedCartItems.length > 0) {
      removedCartItems.forEach(item => {
        securityLogger.log('BUSINESS_LOGIC_VIOLATION', `Auto-removed deleted product from checkout: ${item.product.id}`);
        dispatch({ type: 'REMOVE_FROM_CART', productId: item.product.id });
      });
    }
  }, []);

  if ((validCartItems.length === 0 || state.cart.length === 0) && currentStep !== 'complete') {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-20">
        <CheckoutSteps currentStep={2} />
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-gray-400 mb-4">
            {removedCartItems.length > 0 ? 'Some items are no longer available' : 'Shopping Cart is Empty'}
          </h2>
          <p className="text-gray-500 mb-8">
            {removedCartItems.length > 0
              ? 'The items in your cart have been removed from our catalog. Please browse our current products.'
              : 'You need to add items to your cart before checkout.'}
          </p>
          <ThreeDButton href="/products" variant="primary">
            Go Shopping
          </ThreeDButton>
        </div>
      </div>
    );
  }

  const handleConfirmOrder = async () => {
    const error = validateAddress(selectedAddress);
    if (error) {
      setAddressError(error);
      return;
    }
    setAddressError('');
    setFieldErrors({});
    setPaymentError('');

    // Geocoding validation
    if (selectedAddress) {
      setIsValidatingAddress(true);
      const geo = await validateAddressGeocoding(selectedAddress);
      setIsValidatingAddress(false);
      setGeocodingValid(geo.valid);
      if (!geo.valid) {
        setAddressError('Address could not be verified. Please check your address details.');
        return;
      }
    }

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
      // Filter out products that have been removed from catalog before sending
      const validProductIds = new Set(currentProducts.map(p => p.id));
      const orderItems = state.cart
        .filter(item => validProductIds.has(item.product.id))
        .map(item => ({
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
        // If server returns a specific field error, surface it so the user knows what to fix.
        if (result.field) {
          setFieldErrors({ [result.field]: result.error || 'Invalid value' });
          setAddressError(result.error || 'Please correct the highlighted field.');
        } else {
          setPaymentError(result.error ? `${result.error}${errorCode}` : `Order failed (Error ${response.status}). Please try again.`);
        }
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

  const getStepLabel = () => {
    switch (currentStep) {
      case 'confirm': return 'Step 1 / 3';
      case 'payment': return 'Step 2 / 3';
      case 'complete': return 'Step 3 / 3';
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 'confirm': return 'Confirm Order';
      case 'payment': return 'Select Payment Method';
      case 'complete': return 'Order Complete';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      <CheckoutSteps currentStep={getStepNumber()} />

      {/* Progress Indicator */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>
          {getStepTitle()}
        </h1>
        <span className="text-sm font-medium text-gold bg-gold/10 px-3 py-1 rounded-full">
          {getStepLabel()}
        </span>
      </div>

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
                    <div>
                      <input
                        placeholder="Name"
                        value={newAddress.name}
                        onChange={e => { setNewAddress({ ...newAddress, name: e.target.value }); setFieldErrors(prev => { const n = { ...prev }; delete n.name; return n; }); }}
                        className={`input-field w-full ${fieldErrors.name ? 'border-red-500' : ''}`}
                      />
                      {fieldErrors.name && <p className="text-xs text-red-400 mt-1">{fieldErrors.name}</p>}
                    </div>
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
                      <div>
                        <input
                          placeholder="Phone Number"
                          value={newAddress.phone}
                          onChange={e => { setNewAddress({ ...newAddress, phone: e.target.value }); setFieldErrors(prev => { const n = { ...prev }; delete n.phone; return n; }); }}
                          className={`input-field w-full ${fieldErrors.phone ? 'border-red-500' : ''}`}
                        />
                        {fieldErrors.phone && <p className="text-xs text-red-400 mt-1">{fieldErrors.phone}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <input
                        placeholder="Province"
                        value={newAddress.province}
                        onChange={e => { setNewAddress({ ...newAddress, province: e.target.value }); setFieldErrors(prev => { const n = { ...prev }; delete n.province; return n; }); }}
                        className={`input-field w-full ${fieldErrors.province ? 'border-red-500' : ''}`}
                      />
                      {fieldErrors.province && <p className="text-xs text-red-400 mt-1">{fieldErrors.province}</p>}
                    </div>
                    <div>
                      <input
                        placeholder="City"
                        value={newAddress.city}
                        onChange={e => { setNewAddress({ ...newAddress, city: e.target.value }); setFieldErrors(prev => { const n = { ...prev }; delete n.city; return n; }); }}
                        className={`input-field w-full ${fieldErrors.city ? 'border-red-500' : ''}`}
                      />
                      {fieldErrors.city && <p className="text-xs text-red-400 mt-1">{fieldErrors.city}</p>}
                    </div>
                    <div>
                      <input
                        placeholder="District"
                        value={newAddress.district}
                        onChange={e => { setNewAddress({ ...newAddress, district: e.target.value }); setFieldErrors(prev => { const n = { ...prev }; delete n.district; return n; }); }}
                        className={`input-field w-full ${fieldErrors.district ? 'border-red-500' : ''}`}
                      />
                      {fieldErrors.district && <p className="text-xs text-red-400 mt-1">{fieldErrors.district}</p>}
                    </div>
                  </div>
                  <div>
                    <input
                      placeholder="Detailed Address"
                      value={newAddress.detail}
                      onChange={e => { setNewAddress({ ...newAddress, detail: e.target.value }); setFieldErrors(prev => { const n = { ...prev }; delete n.detail; return n; }); }}
                      className={`input-field w-full ${fieldErrors.detail ? 'border-red-500' : ''}`}
                    />
                    {fieldErrors.detail && <p className="text-xs text-red-400 mt-1">{fieldErrors.detail}</p>}
                  </div>
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
                      {geocodingValid === true && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-green-400">
                          <ShieldCheck className="w-3 h-3" />
                          Address verified
                        </div>
                      )}
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
                        sizes="80px"
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

          {/* Order Summary - Sticky Sidebar */}
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
                  disabled={!selectedAddress || Boolean(validateAddress(selectedAddress)) || isValidatingAddress}
                  className="w-full py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isValidatingAddress ? (
                    <>
                      <span className="w-5 h-5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      Verifying Address...
                    </>
                  ) : (
                    <>Confirm Order</>
                  )}
                </button>
              </div>
              {/* Trust Badges */}
              <div className="mt-6 pt-4 border-t border-border space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <ShieldCheck className="w-4 h-4 text-green-500" />
                  <span>Secure SSL Checkout</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Globe className="w-4 h-4 text-blue-500" />
                  <span>International Shipping Available</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Package className="w-4 h-4 text-gold" />
                  <span>Free Shipping on Orders Over $500</span>
                </div>
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

          {/* Sticky Payment Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-surface border border-border rounded-lg p-6">
              <div className="text-center mb-6">
                <p className="text-sm text-gray-400 mb-2">Total Amount</p>
                <p className="text-3xl font-bold text-gold">{formatPrice(totalAmount)}</p>
              </div>
              {/* Payment Method Icons */}
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-8 h-5 bg-gray-700 rounded flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-500" fill="currentColor">
                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.406-.03zm-1.834 2.994c.536 0 .969.44.969.983a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.433-.983.97-.983zm4.857 0c.536 0 .969.44.969.983a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.433-.983.969-.983z"/>
                  </svg>
                </div>
                <div className="w-8 h-5 bg-gray-700 rounded flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-500" fill="currentColor">
                    <path d="M12.39 1.199c-3.223-.05-6.063 1.532-7.323 4.084C3.818 6.912 3 9.13 3 11.538c0 3.237 1.86 6.09 4.638 7.41.33.158.738-.024.738-.329V17.16c0-.13.096-.225.225-.225h.825c.117 0 .217.085.232.2l.054.468c.009.086-.016.172-.07.235l-2.52 2.9c-.18.208-.014.525.28.525h3.81c.14 0 .256-.112.256-.249v-.393c0-.137.116-.25.256-.25h3.256c.205 0 .377-.164.377-.364 0-.105-.047-.203-.123-.268l-3.982-3.35a.522.522 0 0 1-.103-.205c0-.057.023-.11.063-.147l.14-.127c.158-.147.394-.235.631-.235h.805c.393 0 .726-.305.764-.697.003-.04.001-.08-.005-.12l-.36-3.58c-.043-.429.284-.805.713-.805h.33c.393 0 .718.313.718.703v2.927c0 .14.113.253.253.253h.253c.139 0 .253-.113.253-.253v-1.253a.258.258 0 0 0-.016-.092l-.37-2.28c-.06-.37-.374-.63-.744-.63h-3.256a.753.753 0 0 0-.744.608l-.54 2.58c-.058.278-.305.48-.59.48h-.81c-.393 0-.726-.305-.764-.697l-.21-2.1c-.018-.18-.14-.335-.31-.4l-3.24-1.23c-.15-.058-.25-.2-.25-.355 0-.18.13-.33.31-.368l.37-.08z"/>
                  </svg>
                </div>
                <div className="w-8 h-5 bg-gray-700 rounded flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-gray-300" />
                </div>
                <div className="w-8 h-5 bg-red-700 rounded flex items-center justify-center">
                  <span className="text-[8px] font-bold text-white">HSBC</span>
                </div>
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
                  <p><span className="text-gray-500">Account Name:</span> {process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'Adam Cutlery'}</p>
                  <p><span className="text-gray-500">Account Number:</span> <span className="font-mono text-gold">{process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || 'Contact us for details'}</span></p>
                  <p><span className="text-gray-500">Bank:</span> {process.env.NEXT_PUBLIC_BANK_NAME || 'HSBC'}</p>
                </div>
                <div className="mt-4 p-3 bg-gold/10 border border-gold/30 rounded-lg">
                  <p className="text-sm text-gold font-medium mb-1">Important:</p>
                  <p className="text-sm text-gray-300">
                    Please include your order number <span className="font-mono text-gold">{orderNumber}</span> in the transfer reference/remark.
                    This helps us confirm your payment faster.
                  </p>
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
