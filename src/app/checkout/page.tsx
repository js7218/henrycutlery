'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowLeft, Copy, MapPin, CreditCard, AlertCircle, ShieldCheck, Globe, Package } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatPrice } from '@/lib/utils';
import { shippingFeeFor, type ShippingRate } from '@/lib/shipping';
import { securityLogger } from '@/lib/securityLogger';
import { Address, PaymentMethod } from '@/types';
import { products as currentProducts } from '@/data/products';
import CheckoutSteps from '@/components/checkout/CheckoutSteps';
import PaymentSelector from '@/components/checkout/PaymentSelector';
import ThreeDButton from '@/components/animation/ThreeDButton';
import NegotiationChat from '@/components/NegotiationChat';

type CheckoutStep = 'confirm' | 'payment' | 'complete';

type ComplianceRule = {
  countryCode: string;
  countryName: string;
  riskLevel: 'medium' | 'high';
  restrictedTypes: string;
  message: string;
  sourceUrl: string;
  disclaimer: string;
};

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
  // Stable key for one checkout attempt. A retried request carrying the same
  // key resolves to the same order server-side instead of creating a duplicate.
  const idempotencyKeyRef = useRef('');
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    orderNumber: string;
    paymentReference?: string;
    totalAmount: number;
    createdAt: string;
  } | null>(null);
  const [inquiryPrompt, setInquiryPrompt] = useState<{
    reasons: string[];
    totalAmount: number;
    items: Array<{ productId: string; productName: string; price: number; quantity: number; lineTotal: number }>;
  } | null>(null);
  const [inquiryForm, setInquiryForm] = useState({
    company: '',
    phone: '',
    expectedDelivery: '',
    customization: '',
    notes: '',
  });
  const [submittingInquiry, setSubmittingInquiry] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  // Buyer contact email, prefilled from the account but editable so a
  // purchasing agent can receive the order updates.
  const [contactEmail, setContactEmail] = useState('');
  const contactEmailTouchedRef = useRef(false);

  useEffect(() => {
    if (!contactEmailTouchedRef.current && state.user?.email) {
      setContactEmail(state.user.email);
    }
  }, [state.user?.email]);

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

  // Shipping = total weight x per-kg rate of the destination country.
  const [shippingConfig, setShippingConfig] = useState<{ rates: ShippingRate[]; weights: Record<string, number> }>({
    rates: [],
    weights: {},
  });
  // Destination country used for the shipping estimate. Empty means "derive
  // it from the phone number", which is the default. Customers can override it
  // when the phone and the delivery country are not the same.
  const [shipToCountry, setShipToCountry] = useState('');
  const [customerArrangesShipping, setCustomerArrangesShipping] = useState(false);
  // Signed shipping quote returned by the negotiation assistant. The original
  // computed fee stays intact; only the displayed/charged fee is replaced.
  const [negotiatedShipping, setNegotiatedShipping] = useState<{ amountUsd: number; token: string } | null>(null);
  // Live stock from the database, used for the pre-flight quantity check.
  const [liveStock, setLiveStock] = useState<Record<string, number>>({});
  // Destination-country import guidance for bladed items. Advisory only: the
  // customer must tick the acknowledgement before an affected order proceeds.
  const [complianceRule, setComplianceRule] = useState<ComplianceRule | null>(null);
  const [complianceAck, setComplianceAck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/products/stock')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success) return;
        setLiveStock(data.stock || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/shipping/rates')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success) return;
        setShippingConfig({
          rates: data.rates || [],
          weights: data.weights || {},
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const shipping = shippingFeeFor(
    state.cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
    selectedAddress?.phone || '',
    shippingConfig.rates,
    shippingConfig.weights,
    shipToCountry || undefined
  );
  const shippingQuoted = !shipping.complete && !customerArrangesShipping;
  const shippingFee = customerArrangesShipping || !shipping.complete ? 0 : shipping.fee;
  const effectiveShippingFee = negotiatedShipping ? negotiatedShipping.amountUsd : shippingFee;
  const totalAmount = cartTotal + effectiveShippingFee;
  const shippingCountry = shipping.countryCode;

  // Load the destination's import guidance whenever the shipping country
  // changes. Failing to load it must never block checkout.
  useEffect(() => {
    setComplianceAck(false);
    if (!shippingCountry) {
      setComplianceRule(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/compliance/rule?country=${encodeURIComponent(shippingCountry)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setComplianceRule(data?.success && data.rule ? (data.rule as ComplianceRule) : null);
      })
      .catch(() => {
        if (!cancelled) setComplianceRule(null);
      });

    return () => {
      cancelled = true;
    };
  }, [shippingCountry]);

  // A quote is only valid for the exact fee and shipping choice it was
  // negotiated against, so drop it whenever either changes.
  useEffect(() => {
    setNegotiatedShipping(null);
  }, [shippingFee, customerArrangesShipping]);

  useEffect(() => {
    if (selectedAddress || !state.user?.addresses?.length) return;
    setSelectedAddress(
      state.user.addresses.find((address) => address.isDefault) || state.user.addresses[0]
    );
  }, [state.user, selectedAddress]);

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
    if (complianceRule && !complianceAck) {
      setAddressError(
        `Please confirm the import notice for ${complianceRule.countryName} before continuing.`
      );
      return;
    }
    setAddressError('');
    setFieldErrors({});
    setPaymentError('');

    // Large orders become an inquiry and must not depend on address
    // geocoding, so this check runs first.
    const bulkReasons: string[] = [];
    if (cartTotal >= 10000) bulkReasons.push('order_value');
    if (state.cart.some((item) => item.quantity >= 1300)) bulkReasons.push('bulk_quantity');
    if (state.cart.some((item) => item.quantity > (liveStock[item.product.id] ?? item.product.stock))) bulkReasons.push('insufficient_stock');
    if (bulkReasons.length > 0) {
      setInquiryPrompt({
        reasons: bulkReasons,
        totalAmount: cartTotal,
        items: state.cart.map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          lineTotal: item.product.price * item.quantity,
        })),
      });
      setInquirySent(false);
      setInquiryForm({
        company: '',
        phone: selectedAddress?.phone || '',
        expectedDelivery: '',
        customization: '',
        notes: '',
      });
      return;
    }

    // Best-effort geocoding. A "no result" response is common for factory and
    // rural addresses in OpenStreetMap, so it must never block the checkout.
    if (selectedAddress) {
      setIsValidatingAddress(true);
      const geo = await validateAddressGeocoding(selectedAddress);
      setIsValidatingAddress(false);
      setGeocodingValid(geo.valid);
    }

    setCurrentStep('payment');
  };

  const getOrCreateIdempotencyKey = () => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `k${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return idempotencyKeyRef.current;
  };

  const submitOrder = async (force: boolean) => {
    if (!selectedAddress) {
      setPaymentError('Please select a shipping address before paying.');
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
          idempotencyKey: getOrCreateIdempotencyKey(),
          force,
          shippingSelfArranged: customerArrangesShipping,
          shippingCountryCode: shipToCountry || undefined,
          shippingQuoteToken: negotiatedShipping?.token || undefined,
          contactEmail: contactEmail.trim() || undefined,
          complianceConfirmed: complianceRule ? complianceAck : undefined,
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
        // Bulk orders ($10,000+, 1,300+ units, or beyond stock) become an
        // inquiry instead of a self-service order.
        if (response.status === 422 && result.code === 'INQUIRY_REQUIRED' && result.inquiry) {
          setInquiryPrompt(result.inquiry);
          setInquirySent(false);
          setInquiryForm({
            company: '',
            phone: selectedAddress?.phone || '',
            expectedDelivery: '',
            customization: '',
            notes: '',
          });
          setIsProcessing(false);
          return;
        }
        if (response.status === 409 && result.code === 'INSUFFICIENT_STOCK') {
          const stockMessage = result.error || 'One of your items no longer has enough stock.';
          setPaymentError(stockMessage);
          setAddressError(stockMessage);
          setCurrentStep('confirm');
          setIsProcessing(false);
          return;
        }
        // Identical order placed less than a minute ago: ask for confirmation
        // before forcing a second one through.
        if (response.status === 409 && result.code === 'DUPLICATE_ORDER') {
          setPendingDuplicate(
            result.duplicateOrder || {
              orderNumber: '',
              totalAmount: 0,
              createdAt: new Date().toISOString(),
            }
          );
          setIsProcessing(false);
          return;
        }
        const errorCode = result.code ? ` (${result.code})` : '';
        securityLogger.log('PRICE_TAMPERING_ATTEMPT', `Order API rejected: ${result.error || result.code || response.status}`);
        // If server returns a specific field error, surface it so the user knows what to fix.
        if (result.field) {
          setFieldErrors({ [result.field]: result.error || 'Invalid value' });
          setAddressError(result.error || 'Please correct the highlighted field.');
          setPaymentError(result.error || 'Please correct the highlighted field.');
          setCurrentStep('confirm');
        } else {
          setPaymentError(result.error ? `${result.error}${errorCode}` : `Order failed (Error ${response.status}). Please try again.`);
        }
        setIsProcessing(false);
        return;
      }

      // SECURITY: Use server-verified order data. While the order is pending
      // the server withholds the official order number and sends only a
      // payment reference.
      const serverOrder = result.order;
      const reference = serverOrder.paymentReference || String(serverOrder.orderNumber || '').slice(-8).toUpperCase();
      setOrderNumber(reference);

      // Add order to local state using server-verified data
      dispatch({ type: 'ADD_ORDER', order: serverOrder });
      dispatch({ type: 'CLEAR_CART' });

      // This checkout attempt is finished; the next one needs a fresh key.
      idempotencyKeyRef.current = '';

      securityLogger.log('ORDER_CREATED', `Server-verified order created, payment reference ${reference}, total: ${result.serverTotal}`);
      setCurrentStep('complete');
      setIsProcessing(false);
    } catch (error) {
      securityLogger.log('ORDER_FAILED', 'Failed to create order via API');
      setPaymentError('Network error. Please check your connection and try again.');
      setIsProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedAddress) {
      setPaymentError('Please select a shipping address before paying.');
      return;
    }
    if (isProcessing) return;
    const now = Date.now();
    if (now - lastPaymentAttemptRef.current < 3000) return;
    lastPaymentAttemptRef.current = now;

    const addressValidation = validateAddress(selectedAddress);
    if (addressValidation) {
      securityLogger.log('INPUT_VALIDATION_FAILURE', 'Checkout: incomplete address');
      setAddressError(addressValidation);
      setPaymentError(addressValidation);
      return;
    }

    await submitOrder(false);
  };

  const handleConfirmDuplicate = async () => {
    setPendingDuplicate(null);
    await submitOrder(true);
  };

  const handleSubmitInquiry = async () => {
    if (!inquiryPrompt || submittingInquiry) return;
    // Accept "2026/12/01", "2026.12.01" and "2026-12-01" instead of forcing a picker.
    const deliveryDate = inquiryForm.expectedDelivery.trim().replace(/[/.]/g, '-');
    const formError = !inquiryForm.company.trim()
      ? 'Please enter your company name.'
      : !/^\+[1-9]\d{0,3}[\s.-]?[0-9][0-9\s().-]{5,30}$/.test(inquiryForm.phone.trim())
        ? 'Please enter your phone with a country code, e.g. +1 415 555 0123.'
        : !deliveryDate
          ? 'Please enter the expected delivery date.'
          : !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || Number.isNaN(Date.parse(deliveryDate))
            ? 'Please enter the delivery date as YYYY-MM-DD, e.g. 2026-12-01.'
            : inquiryForm.customization.trim().length < 2
              ? 'Please describe your customization requirements.'
              : '';
    if (formError) {
      setPaymentError(formError);
      return;
    }
    setSubmittingInquiry(true);
    setPaymentError('');
    try {
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: inquiryPrompt.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          contactName: selectedAddress?.name || state.user?.name || '',
          contactPhone: inquiryForm.phone || selectedAddress?.phone || '',
          company: inquiryForm.company,
          expectedDelivery: deliveryDate,
          customization: inquiryForm.customization,
          notes: inquiryForm.notes,
          reason: inquiryPrompt.reasons.join(','),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setPaymentError(data?.error || 'Failed to submit inquiry. Please try again.');
        setSubmittingInquiry(false);
        return;
      }
      setInquirySent(true);
    } catch {
      setPaymentError('Network error. Please try again.');
    }
    setSubmittingInquiry(false);
  };

  const handleCopyOrderNumber = () => {
    navigator.clipboard.writeText(orderNumber.slice(-8).toUpperCase());
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
                  {state.user?.addresses?.length ? (
                    state.user.addresses.map((address) => {
                      const active = selectedAddress?.id === address.id;
                      return (
                        <button
                          key={address.id}
                          type="button"
                          onClick={() => {
                            setSelectedAddress(address);
                            setAddressError('');
                            setGeocodingValid(null);
                          }}
                          className={`w-full text-left p-4 border-2 rounded-lg transition-colors ${
                            active ? 'border-gold bg-gold/5' : 'border-border hover:border-gray-600'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <p className="font-medium text-foreground">{address.name}</p>
                              <p className="text-sm text-gray-400 mt-1">
                                {address.province} {address.city} {address.district} {address.detail}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {address.isDefault && (
                                <span className="px-2 py-1 bg-gold/20 text-gold text-xs rounded">Default</span>
                              )}
                              {active && <CheckCircle className="w-5 h-5 text-gold" />}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : selectedAddress ? (
                    <div className="p-4 border-2 border-gold bg-gold/5 rounded-lg">
                      <p className="font-medium text-foreground">{selectedAddress.name}</p>
                      <p className="text-sm text-gray-400 mt-1">
                        {selectedAddress.province} {selectedAddress.city} {selectedAddress.district} {selectedAddress.detail}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-center py-8">No shipping address</p>
                  )}

                  {/* A newly typed address is not saved to the account until
                      the order is placed, so show it when it is the selection. */}
                  {selectedAddress &&
                    state.user?.addresses?.length &&
                    !state.user.addresses.some((address) => address.id === selectedAddress.id) && (
                      <div className="p-4 border-2 border-gold bg-gold/5 rounded-lg">
                        <p className="font-medium text-foreground">{selectedAddress.name}</p>
                        <p className="text-sm text-gray-400 mt-1">
                          {selectedAddress.province} {selectedAddress.city} {selectedAddress.district} {selectedAddress.detail}
                        </p>
                      </div>
                    )}

                  {geocodingValid === true && selectedAddress && (
                    <div className="flex items-center gap-1 text-xs text-green-400">
                      <ShieldCheck className="w-3 h-3" />
                      Address verified
                    </div>
                  )}
                </div>
              )}
              {selectedAddress && (
                <div className="mt-5">
                  <label htmlFor="checkout-contact-email" className="block text-sm font-medium text-foreground mb-2">
                    Contact email <span className="text-gray-500 font-normal">(order updates go here)</span>
                  </label>
                  <input
                    id="checkout-contact-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={contactEmail}
                    onChange={(event) => {
                      contactEmailTouchedRef.current = true;
                      setContactEmail(event.target.value);
                    }}
                    placeholder="you@company.com"
                    className="w-full px-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground text-base placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  />
                  {contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail.trim()) && (
                    <p className="mt-2 text-sm text-red-400">Please enter a valid email address.</p>
                  )}
                  <p className="mt-2 text-sm text-gray-400">
                    We send the order confirmation and payment instructions to this address.
                  </p>
                </div>
              )}
              {selectedAddress && (
                <div className="mt-4">
                  <label className="block text-sm text-gray-400 mb-2">Ship to country</label>
                  <select
                    value={shipToCountry || shipping.countryCode}
                    onChange={(e) => setShipToCountry(e.target.value)}
                    className="input-field w-full"
                  >
                    {!(shipToCountry || shipping.countryCode) && (
                      <option value="" disabled>Select country</option>
                    )}
                    {shippingConfig.rates.map((rate) => (
                      <option key={rate.countryCode} value={rate.countryCode}>
                        {rate.countryName} — ${rate.perKgUsd}/kg
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Preselected from your phone number. Change it if the delivery country is different.
                  </p>
                </div>
              )}
              {complianceRule && (
                <div
                  className={`mt-4 rounded-lg border p-4 ${
                    complianceRule.riskLevel === 'high'
                      ? 'border-red-500/40 bg-red-500/10'
                      : 'border-yellow-500/40 bg-yellow-500/10'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      className={`w-5 h-5 mt-0.5 shrink-0 ${
                        complianceRule.riskLevel === 'high' ? 'text-red-400' : 'text-yellow-400'
                      }`}
                    />
                    <div className="text-sm">
                      <p
                        className={`font-medium ${
                          complianceRule.riskLevel === 'high' ? 'text-red-300' : 'text-yellow-300'
                        }`}
                      >
                        Import notice for {complianceRule.countryName}
                      </p>
                      <p className="mt-1 text-gray-300">{complianceRule.message}</p>
                      {complianceRule.restrictedTypes && (
                        <p className="mt-1 text-gray-400">
                          Restricted categories: {complianceRule.restrictedTypes}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">{complianceRule.disclaimer}</p>
                      {complianceRule.sourceUrl && (
                        <a
                          href={complianceRule.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-gold underline"
                        >
                          Official source
                        </a>
                      )}
                      <label className="mt-3 flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={complianceAck}
                          onChange={(e) => setComplianceAck(e.target.checked)}
                          className="mt-0.5 accent-gold"
                        />
                        <span className="text-gray-300">
                          I have checked my local import rules and confirm this order may be
                          imported into {complianceRule.countryName}.
                        </span>
                      </label>
                    </div>
                  </div>
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
                  <span>{negotiatedShipping ? 'Negotiated shipping' : 'Estimated Shipping'}</span>
                  <span className="text-gold">
                    {negotiatedShipping
                      ? formatPrice(negotiatedShipping.amountUsd)
                      : shippingQuoted
                        ? 'To Be Quoted'
                        : formatPrice(shippingFee)}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {shippingQuoted
                    ? 'Per-unit weights are not configured for every item, so shipping will be quoted by email.'
                    : `${shipping.kg} kg at ${formatPrice(shipping.perKgUsd)}/kg to ${shipping.countryName}.`}
                  {customerArrangesShipping ? ' Shipping excluded — you arrange your own carrier.' : ' Final shipping is confirmed by email.'}
                </p>
                {shippingFee > 0 && !customerArrangesShipping && !shippingQuoted && (
                  <NegotiationChat
                    items={state.cart.map((item) => ({
                      productId: item.product.id,
                      quantity: item.quantity,
                    }))}
                    countryCode={shipToCountry || shipping.countryCode}
                    quoteUsd={shippingFee}
                    onQuote={setNegotiatedShipping}
                    onAddUnits={(productId, quantity) => {
                      const current = state.cart.find((item) => item.product.id === productId);
                      if (!current) return;
                      dispatch({
                        type: 'UPDATE_QUANTITY',
                        productId,
                        quantity: current.quantity + quantity,
                      });
                    }}
                    onRemoveUnits={(productId, quantity) => {
                      const current = state.cart.find((item) => item.product.id === productId);
                      if (!current) return;
                      dispatch({
                        type: 'UPDATE_QUANTITY',
                        productId,
                        quantity: Math.max(1, current.quantity - quantity),
                      });
                    }}
                  />
                )}
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
                  <span>Shipping quoted after order review</span>
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
                  <span>{negotiatedShipping ? 'Negotiated shipping' : 'Estimated Shipping'}</span>
                  <span className="text-gold">
                    {negotiatedShipping
                      ? formatPrice(negotiatedShipping.amountUsd)
                      : shippingQuoted
                        ? 'To Be Quoted'
                        : formatPrice(shippingFee)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 pt-2">
                  Order confirmation and secure payment arrangement will be handled by email.
                </p>
                <label className="flex items-start gap-2 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customerArrangesShipping}
                    onChange={(e) => setCustomerArrangesShipping(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-gray-400">
                    I will arrange my own shipping (shipping fee excluded)
                  </span>
                </label>
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
          <h2 className="text-2xl font-bold text-foreground mb-2">Order Received</h2>
          <p className="text-gray-400 mb-2">Thank you. Your order is awaiting payment.</p>
          <p className="text-sm text-yellow-400/90 mb-8">
            The order number will be issued once we confirm your payment.
          </p>

          <div className="bg-surface border border-border rounded-lg p-6 mb-8">
            <p className="text-sm text-gray-400 mb-2">Payment Reference</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl font-mono text-gold">{orderNumber.slice(-8).toUpperCase()}</span>
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
                  <p><span className="text-gray-500">Account Name:</span> {process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'Adam Cutlery'}{!/adam cutlery/i.test(process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'Adam Cutlery') && ' (registered company behind Adam Cutlery)'}</p>
                  <p><span className="text-gray-500">Account Number:</span> <span className="font-mono text-gold">{process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || 'Contact us for details'}</span></p>
                  <p><span className="text-gray-500">Bank:</span> {process.env.NEXT_PUBLIC_BANK_NAME || 'HSBC'}</p>
                </div>
                <div className="mt-4 p-3 bg-gold/10 border border-gold/30 rounded-lg">
                  <p className="text-sm text-gold font-medium mb-1">Important:</p>
                  <p className="text-sm text-gray-300">
                    Please include your payment reference <span className="font-mono text-gold">{orderNumber.slice(-8).toUpperCase()}</span> in the transfer reference/remark.
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

      {/* Duplicate order confirmation: an identical order was placed < 60s ago */}
      {pendingDuplicate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Place this order again?</h2>
            <p className="text-sm text-gray-400 mb-4">
              You placed an identical order less than a minute ago
              {pendingDuplicate.paymentReference || pendingDuplicate.orderNumber ? (
                <>
                  {' '}(<span className="font-mono text-gold">{pendingDuplicate.paymentReference || pendingDuplicate.orderNumber.slice(-8).toUpperCase()}</span>)
                </>
              ) : null}
              . Place another one only if that was intentional.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setPendingDuplicate(null)}
                className="flex-1 px-4 py-3 border border-border text-gray-300 rounded-lg hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDuplicate}
                disabled={isProcessing}
                className="flex-1 px-4 py-3 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors disabled:opacity-60"
              >
                {isProcessing ? 'Placing...' : 'Yes, place another'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk order inquiry form */}
      {inquiryPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 my-auto">
            {inquirySent ? (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-2">Inquiry received</h2>
                <p className="text-sm text-gray-400 mb-6">
                  Thank you. Our team will review your bulk order request and contact you at{' '}
                  <span className="text-foreground">{state.user?.email}</span> shortly.
                </p>
                <button
                  onClick={() => {
                    setInquiryPrompt(null);
                    setInquirySent(false);
                    setPaymentError('');
                  }}
                  className="w-full px-4 py-3 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-2">Bulk Order Inquiry</h2>
                <p className="text-sm text-gray-400 mb-4">
                  This order qualifies for a volume quote, so it will not be placed directly. Send us an inquiry and our
                  team will confirm pricing, stock, and lead time.
                </p>

                <div className="mb-4 rounded-lg border border-gold/30 bg-gold/10 p-3 text-xs text-gold space-y-1">
                  {inquiryPrompt.reasons.map((reason) => (
                    <p key={reason}>
                      {reason === 'order_value'
                        ? 'Order value is $10,000 or above'
                        : reason === 'bulk_quantity'
                          ? 'A single product quantity is 1,300 units or above'
                          : reason === 'insufficient_stock'
                            ? 'A quantity exceeds current stock'
                            : reason}
                    </p>
                  ))}
                  <p className="text-gray-300">
                    Estimated reference total: {formatPrice(inquiryPrompt.totalAmount)}
                  </p>
                </div>

                <div className="mb-4 max-h-32 overflow-y-auto rounded-lg border border-border bg-surfaceLight p-3 text-xs text-gray-300 space-y-1">
                  {inquiryPrompt.items.map((item) => (
                    <p key={item.productId} className="flex justify-between gap-3">
                      <span>{item.productName} × {item.quantity}</span>
                      <span className="text-gold">{formatPrice(item.lineTotal)}</span>
                    </p>
                  ))}
                </div>

                <div className="space-y-3">
                  <input
                    value={inquiryForm.company}
                    onChange={(event) => setInquiryForm((prev) => ({ ...prev, company: event.target.value }))}
                    placeholder="Company name (required)"
                    className="w-full px-3 py-2 bg-surfaceLight border border-border rounded-lg text-foreground text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  />
                  <input
                    value={inquiryForm.phone}
                    onChange={(event) => setInquiryForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="Your contact phone with country code (required)"
                    className="w-full px-3 py-2 bg-surfaceLight border border-border rounded-lg text-foreground text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={inquiryForm.expectedDelivery}
                    onChange={(event) => setInquiryForm((prev) => ({ ...prev, expectedDelivery: event.target.value }))}
                    placeholder="Expected delivery date, e.g. 2026-12-01 (required)"
                    className="w-full px-3 py-2 bg-surfaceLight border border-border rounded-lg text-foreground text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  />
                  <textarea
                    value={inquiryForm.customization}
                    onChange={(event) => setInquiryForm((prev) => ({ ...prev, customization: event.target.value }))}
                    placeholder="Customization requirements, e.g. logo, blade steel, packaging (required)"
                    rows={2}
                    className="w-full px-3 py-2 bg-surfaceLight border border-border rounded-lg text-foreground text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold resize-none"
                  />
                  <textarea
                    value={inquiryForm.notes}
                    onChange={(event) => setInquiryForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Anything else we should know?"
                    rows={2}
                    className="w-full px-3 py-2 bg-surfaceLight border border-border rounded-lg text-foreground text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold resize-none"
                  />
                </div>

                {paymentError && (
                  <p className="mt-3 text-sm text-red-400">{paymentError}</p>
                )}

                <div className="mt-5 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => {
                      setInquiryPrompt(null);
                      setPaymentError('');
                    }}
                    disabled={submittingInquiry}
                    className="flex-1 px-4 py-3 border border-border text-gray-300 rounded-lg hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitInquiry}
                    disabled={submittingInquiry || !inquiryForm.phone.trim() || !inquiryForm.company.trim()}
                    className="flex-1 px-4 py-3 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors disabled:opacity-60"
                  >
                    {submittingInquiry ? 'Submitting...' : 'Submit Inquiry'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
