import { type ClassValue, clsx } from 'clsx';
import type { CartItem } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPrice(price: number): string {
  return `$${price.toLocaleString('en-US')}`;
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD${timestamp}${random}`;
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Calculate shipping fee.
 *
 * Rules:
 * - Items flagged `freeShipping: true` always contribute $0 to shipping
 *   regardless of cart subtotal (per-product free shipping override).
 * - For the remaining (chargeable) items, free shipping kicks in when their
 *   subtotal reaches the FREE_SHIPPING_THRESHOLD; otherwise a flat fee applies.
 * - If the entire cart consists of freeShipping items, total shipping is $0.
 */
export const FREE_SHIPPING_THRESHOLD = 500;
export const FLAT_SHIPPING_FEE = 50;

export function calculateShippingFee(cart: CartItem[]): number {
  const chargeableSubtotal = cart.reduce((sum, item) => {
    if (item.product.freeShipping) return sum;
    return sum + item.product.price * item.quantity;
  }, 0);

  if (chargeableSubtotal <= 0) return 0;
  if (chargeableSubtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return FLAT_SHIPPING_FEE;
}
