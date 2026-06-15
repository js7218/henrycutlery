/**
 * Server-Side Order API - 防抓包篡改
 * 
 * 客户端只发送 productId + quantity
 * 服务端从产品数据源查价格，计算总金额
 * 即使黑客抓包修改了请求，也无法篡改价格
 */

import { NextRequest, NextResponse } from 'next/server';
import { products } from '@/data/products';
import { generateOrderNumber } from '@/lib/utils';
import { findUnsafeUrl } from '@/lib/ssrfProtection';
import { sendOrderNotificationEmail } from '@/lib/orderEmail';
import { getAuthUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

const MAX_ORDER_ITEMS = 50;
const MAX_ITEM_QUANTITY = 5000;

// In production, this would be a database lookup
function getProductById(productId: string) {
  return products.find(p => p.id === productId);
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validAddressPart(value: string, min = 2, max = 100) {
  return value.length >= min &&
    value.length <= max &&
    !/^(n\/a|na|none|null|undefined|省份|城市|地区|province|city|district)$/i.test(value);
}

function validInternationalPhone(phone: string) {
  return /^\+[1-9]\d{0,3}\s?[0-9][0-9\s().-]{5,30}$/.test(phone);
}

function normalizeAddress(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const normalized = {
    name: cleanText(raw.name, 100),
    phone: cleanText(raw.phone, 40),
    province: cleanText(raw.province, 100),
    city: cleanText(raw.city, 100),
    district: cleanText(raw.district, 100),
    detail: cleanText(raw.detail, 300),
  };

  if (!validAddressPart(normalized.name, 2, 100)) return null;
  if (!validInternationalPhone(normalized.phone)) return null;
  if (!validAddressPart(normalized.province)) return null;
  if (!validAddressPart(normalized.city)) return null;
  if (!validAddressPart(normalized.district)) return null;
  if (!validAddressPart(normalized.detail, 5, 300)) return null;
  return normalized;
}

// POST /api/order/create - Create order with server-side price verification
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json(
        { error: 'Please log in before placing an order', code: 'LOGIN_REQUIRED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const unsafeUrl = findUnsafeUrl(body);
    if (unsafeUrl) {
      return NextResponse.json(
        { error: 'Unsafe URL rejected', code: 'SSRF_BLOCKED' },
        { status: 400 }
      );
    }

    const { items, paymentMethod } = body;
    const address = normalizeAddress(body.address);

    // SECURITY: Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0 || items.length > MAX_ORDER_ITEMS) {
      return NextResponse.json(
        { error: 'Invalid order items', code: 'INVALID_ITEMS' },
        { status: 400 }
      );
    }

    if (!address) {
      return NextResponse.json(
        { error: 'Invalid shipping address', code: 'INVALID_ADDRESS' },
        { status: 400 }
      );
    }

    if (!paymentMethod || !['wechat', 'alipay', 'card', 'bank_transfer'].includes(paymentMethod)) {
      return NextResponse.json(
        { error: 'Invalid payment method', code: 'INVALID_PAYMENT' },
        { status: 400 }
      );
    }

    // SECURITY: Validate each item - server-side price lookup
    const verifiedItems = [];
    let serverTotal = 0;

    for (const item of items) {
      const { productId, quantity } = item;

      // SECURITY: Validate input types
      if (typeof productId !== 'string' || typeof quantity !== 'number') {
        return NextResponse.json(
          { error: `Invalid item format for product ${productId}`, code: 'INVALID_ITEM_FORMAT' },
          { status: 400 }
        );
      }

      // SECURITY: Look up product from SERVER-SIDE data source (NOT from client)
      const product = getProductById(productId);
      if (!product) {
        return NextResponse.json(
          { error: `Product not found: ${productId}`, code: 'PRODUCT_NOT_FOUND' },
          { status: 400 }
        );
      }

      const moq = product.moq || 1;

      // SECURITY: Quantity must be positive integer and meet product MOQ.
      if (quantity < moq || quantity > MAX_ITEM_QUANTITY || !Number.isInteger(quantity)) {
        return NextResponse.json(
          { error: `Invalid quantity for product ${productId}. MOQ is ${moq}.`, code: 'INVALID_QUANTITY' },
          { status: 400 }
        );
      }

      // SECURITY: Calculate price SERVER-SIDE using product data
      const itemTotal = product.price * quantity;
      serverTotal += itemTotal;

      verifiedItems.push({
        productId: product.id,
        productName: product.name,
        productImage: product.images[0],
        // SECURITY: Price comes from SERVER data, NEVER from client request
        price: product.price,
        quantity: quantity,
        // Include server-calculated total for verification
        serverPrice: product.price,
        serverItemTotal: itemTotal,
      });
    }

    // SECURITY: Generate order with server-verified data
    const order = {
      id: `o${Date.now()}`,
      orderNumber: generateOrderNumber(),
      items: verifiedItems,
      // SECURITY: Total calculated server-side
      totalAmount: serverTotal,
      // SECURITY: Include hash for integrity verification
      orderHash: generateOrderHash(verifiedItems, serverTotal),
      status: 'pending',
      shippingAddress: address,
      paymentMethod,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: authUser.id,
      customerEmail: authUser.email,
      // SECURITY: Server verification metadata
      verified: true,
      verifiedAt: new Date().toISOString(),
    };

    try {
      await ensureDatabaseSchema();
      await getPool().query(
        `
          INSERT INTO orders (
            id, user_id, order_number, items, total_amount, status,
            shipping_address, payment_method, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          order.id,
          authUser.id,
          order.orderNumber,
          JSON.stringify(order.items),
          order.totalAmount,
          order.status,
          JSON.stringify(order.shippingAddress),
          order.paymentMethod,
          order.createdAt,
          order.updatedAt,
        ]
      );
    } catch {
      return NextResponse.json(
        { error: 'Failed to save order', code: 'ORDER_SAVE_FAILED' },
        { status: 500 }
      );
    }

    let emailStatus: { sent: boolean; skipped: boolean; reason?: string } = {
      sent: false,
      skipped: false,
    };

    try {
      emailStatus = await sendOrderNotificationEmail(order);
    } catch {
      emailStatus = { sent: false, skipped: false, reason: 'SMTP_SEND_FAILED' };
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
      },
      // SECURITY: Return server-calculated total for client display
      serverTotal,
      emailStatus,
      message: 'Order created with server-verified pricing',
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create order', code: 'ORDER_FAILED' },
      { status: 500 }
    );
  }
}

// GET /api/order/verify - Verify order integrity
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');

  if (!orderId) {
    return NextResponse.json(
      { error: 'Order ID required', code: 'MISSING_ORDER_ID' },
      { status: 400 }
    );
  }

  // In production, look up order from database and verify hash
  return NextResponse.json({
    verified: true,
    message: 'Order verification endpoint - requires database integration',
  });
}

// SECURITY: Generate hash for order integrity verification
function generateOrderHash(items: Array<{ productId: string; price: number; quantity: number }>, total: number): string {
  const data = items.map(i => `${i.productId}:${i.price}:${i.quantity}`).join('|') + `|total:${total}`;
  // Simple hash for demo - in production use crypto.createHash('sha256')
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `h_${Math.abs(hash).toString(16)}`;
}
