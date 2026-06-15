/**
 * Payment Security Module
 * Server-side amount calculation and signature verification
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Types
export interface OrderItem {
  productId: string;
  quantity: number;
}

export interface OrderAmount {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}

export interface PaymentSignature {
  orderId: string;
  amount: OrderAmount;
  items: Array<{ productId: string; quantity: number; unitPrice: number; subtotal: number }>;
  timestamp: number;
  signature: string;
}

// Configuration
const ORDER_EXPIRY_MS = 30 * 60 * 1000;

function getPaymentSignSecret(): string {
  const secret = process.env.PAYMENT_SIGN_SECRET || '';
  if (!secret || secret.length < 32) {
    throw new Error('PAYMENT_SIGN_SECRET must be configured with at least 32 characters.');
  }
  return secret;
}

// Mock prices
const PRODUCT_PRICES: Record<string, number> = {
  'p001': 2999,
  'p002': 1899,
  'p003': 1599,
  'p004': 3999,
  'p005': 899,
};

/**
 * Calculate shipping fee
 */
export function calculateShipping(
  subtotal: number,
  address: { province: string; city: string },
  _items: OrderItem[]
): number {
  if (subtotal >= 500) return 0;
  
  const remoteAreas = ['西藏', '新疆', '青海', '内蒙古', '宁夏', '海南'];
  const isRemote = remoteAreas.some(
    area => address.province.includes(area) || address.city.includes(area)
  );
  
  return isRemote ? 80 : 50;
}

/**
 * Calculate discount
 */
export function calculateDiscount(
  subtotal: number,
  couponCode?: string
): { discount: number; couponId?: string } {
  if (!couponCode) return { discount: 0 };

  const coupons: Record<string, { type: 'percentage' | 'fixed'; value: number; minAmount: number }> = {
    'WELCOME10': { type: 'percentage', value: 10, minAmount: 100 },
    'SAVE50': { type: 'fixed', value: 50, minAmount: 200 },
  };

  const coupon = coupons[couponCode.toUpperCase()];
  if (!coupon || subtotal < coupon.minAmount) return { discount: 0 };

  let discount: number;
  if (coupon.type === 'percentage') {
    discount = Math.floor(subtotal * (coupon.value / 100));
  } else {
    discount = coupon.value;
  }

  return { discount: Math.min(discount, subtotal), couponId: couponCode.toUpperCase() };
}

/**
 * Calculate order amount
 */
export function calculateOrderAmount(
  items: OrderItem[],
  address: { province: string; city: string },
  couponCode?: string
): {
  items: Array<{ productId: string; quantity: number; unitPrice: number; subtotal: number }>;
  amount: OrderAmount;
} {
  if (!items || items.length === 0) {
    throw new Error('订单商品不能为空');
  }

  const itemsWithPrices = items.map(item => {
    const unitPrice = PRODUCT_PRICES[item.productId];
    if (unitPrice === undefined) {
      throw new Error(`商品不存在: ${item.productId}`);
    }
    if (item.quantity < 1 || item.quantity > 99) {
      throw new Error(`商品数量无效: ${item.quantity}`);
    }
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      subtotal: unitPrice * item.quantity,
    };
  });

  const subtotal = itemsWithPrices.reduce((sum, item) => sum + item.subtotal, 0);
  const { discount } = calculateDiscount(subtotal, couponCode);
  const shipping = calculateShipping(subtotal, address, items);
  const total = subtotal - discount + shipping;

  return {
    items: itemsWithPrices,
    amount: {
      subtotal,
      discount,
      shipping,
      total: Math.round(total * 100) / 100,
    },
  };
}

/**
 * Generate signature
 */
export function generatePaymentSignature(
  orderId: string,
  amount: OrderAmount,
  items: Array<{ productId: string; quantity: number; unitPrice: number; subtotal: number }>,
  timestamp: number
): string {
  const dataToSign = [
    orderId,
    timestamp,
    amount.subtotal.toFixed(2),
    amount.discount.toFixed(2),
    amount.shipping.toFixed(2),
    amount.total.toFixed(2),
    items.length,
    ...items
      .sort((a, b) => a.productId.localeCompare(b.productId))
      .map((item) => `${item.productId}:${item.quantity}:${item.unitPrice}:${item.subtotal}`),
  ].join('|');

  return createHmac('sha256', getPaymentSignSecret()).update(dataToSign).digest('hex');
}

/**
 * Verify signature
 */
export function verifyPaymentSignature(
  orderId: string,
  amount: OrderAmount,
  items: Array<{ productId: string; quantity: number; unitPrice: number; subtotal: number }>,
  timestamp: number,
  signature: string
): boolean {
  const expected = generatePaymentSignature(orderId, amount, items, timestamp);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Generate order ID
 */
export function generateOrderId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `ORD${timestamp}${random}`.toUpperCase();
}

// Mock storage
const mockOrders = new Map<string, {
  userId: string;
  amount: OrderAmount;
  items: Array<{ productId: string; quantity: number; unitPrice: number; subtotal: number }>;
  timestamp: number;
  expiresAt: number;
  status: string;
}>();

export async function storeOrder(orderId: string, order: {
  userId: string;
  amount: OrderAmount;
  items: Array<{ productId: string; quantity: number; unitPrice: number; subtotal: number }>;
  timestamp: number;
  expiresAt: number;
}): Promise<void> {
  mockOrders.set(orderId, { ...order, status: 'PENDING' });
}

export async function getStoredOrder(orderId: string) {
  return mockOrders.get(orderId) || null;
}

// Audit logging (simplified)
const auditLogs: Array<{ action: string; orderId: string; amount?: number; timestamp: string }> = [];

export function getAuditLogs() {
  return auditLogs;
}

export const paymentSecurity = {
  calculateOrderAmount,
  calculateShipping,
  calculateDiscount,
  generatePaymentSignature,
  verifyPaymentSignature,
  generateOrderId,
  storeOrder,
  getStoredOrder,
  getAuditLogs,
};

export default paymentSecurity;
