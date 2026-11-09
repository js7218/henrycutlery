import type { Order } from '@/types';

/**
 * Statuses in which the payment has been confirmed and the customer is allowed
 * to see the official order number. While an order is still `pending` the
 * customer only gets a payment reference; the order number is issued after the
 * payment is verified.
 */
const PAYMENT_CONFIRMED_STATUSES = new Set([
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]);

export function paymentReferenceFor(orderNumber: string): string {
  return String(orderNumber || '').slice(-8).toUpperCase();
}

/**
 * Returns the order-number fields that are safe to expose to the customer.
 */
export function customerOrderNumberFields(
  orderNumber: string,
  status: string
): { orderNumber: string; paymentReference: string } {
  if (PAYMENT_CONFIRMED_STATUSES.has(status)) {
    return { orderNumber: String(orderNumber || ''), paymentReference: '' };
  }
  return { orderNumber: '', paymentReference: paymentReferenceFor(orderNumber) };
}

export function maskOrderForCustomer(order: Order): Order {
  return {
    ...order,
    ...customerOrderNumberFields(order.orderNumber, order.status),
  };
}
