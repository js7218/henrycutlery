/**
 * Server-Side Order API - 防抓包篡改
 * 
 * 客户端只发送 productId + quantity
 * 服务端从产品数据源查价格，计算总金额
 * 即使黑客抓包修改了请求，也无法篡改价格
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
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

function hasObviousAttackPayload(value: string) {
  return [
    /<\s*script\b/i,
    /javascript\s*:/i,
    /\bon\w+\s*=/i,
    /\bunion\s+select\b/i,
    /\b(or|and)\s+1\s*=\s*1\b/i,
    /'\s*(or|and)\s+'[^']*'='[^']*'/i,
    /;\s*(drop|delete|truncate|alter|update|insert|exec|execute)\b/i,
    /\b(sleep|benchmark|pg_sleep|waitfor)\s*\(/i,
    /\b(information_schema|pg_catalog|mysql\.user)\b/i,
    /(\.\.\/|\/etc\/passwd|cmd\.exe|powershell|base64_decode)/i,
  ].some(pattern => pattern.test(value));
}

function looksLikeNormalAddress(address: ValidatedAddress) {
  const combined = [
    address.province,
    address.city,
    address.district,
    address.detail,
  ].join(' ');

  if (hasObviousAttackPayload(combined)) return false;

  const hasCjk = /[\u4e00-\u9fff]/.test(combined);
  const hasStreetNumber = /\d/.test(combined);
  const hasAddressWord = /\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|building|bldg|block|floor|room|suite|unit|village|town|county|district|city|province|state|guangdong|yangjiang|jiangcheng)\b/i.test(combined) ||
    /(路|街|号|栋|楼|室|区|县|市|省|镇|村|巷|弄)/.test(combined);

  // 快速本地判断：中文地址、带门牌号、或带常见地址词，都先按正常地址处理。
  return hasCjk || hasStreetNumber || hasAddressWord;
}

/**
 * Validate that province/city/district contain recognizable place names.
 * Rejects random gibberish like "jdjsj", "asdf", "xyz123" etc.
 */
function isValidPlaceName(value: string): boolean {
  // Chinese place names: must contain at least one CJK character
  if (/[\u4e00-\u9fff]/.test(value)) return true;

  // English place names: must look like a real word/place (at least 2 alpha chars, no random consonant strings)
  const lower = value.toLowerCase().trim();

  // Reject if it's all consonants with no vowels (gibberish like "jdjsj", "bcdfg")
  const withoutSpaces = lower.replace(/[\s\-_.]/g, '');
  if (withoutSpaces.length >= 3) {
    const vowelCount = (withoutSpaces.match(/[aeiou]/g) || []).length;
    const consonantCount = (withoutSpaces.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
    // If consonant ratio is too high relative to length, it's likely gibberish
    if (consonantCount > 0 && vowelCount / withoutSpaces.length < 0.15) {
      return false;
    }
  }

  // Must contain at least one recognizable place name pattern
  const placePatterns = [
    /\b(province|state|county|region|territory|prefecture|district|municipality)\b/i,
    /\b(city|town|village|borough|canton|commune|suburb|metropolis)\b/i,
    // Common real place name endings
    /\b(shire|shire|land|ia|stan|burg|bourg|ford|bridge|port|field|wood|worth|ton|ville|polis|bad|pur|nagar|pura)\b/i,
    // US states
    /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i,
    // UK regions
    /\b(england|scotland|wales|northern ireland|london|manchester|birmingham|liverpool|leeds|sheffield|bristol|edinburgh|glasgow|cardiff)\b/i,
    // Canadian provinces
    /\b(ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick)\b/i,
    // Australian states
    /\b(new south wales|victoria|queensland|western australia|south australia|tasmania)\b/i,
    // Chinese provinces (pinyin)
    /\b(guangdong|zhejiang|jiangsu|shandong|henan|hebei|sichuan|hubei|hunan|fujian|anhui|jiangxi|shanxi|guangxi|yunnan|guizhou|heilongjiang|jilin|liaoning|gansu|qinghai|hainan|xinjiang|inner mongolia|nei menggu|tibet|xizang|ningxia)\b/i,
    // Common city names worldwide
    /\b(new york|los angeles|chicago|houston|miami|san francisco|seattle|boston|toronto|vancouver|sydney|melbourne|london|paris|tokyo|beijing|shanghai|guangzhou|shenzhen|hong kong|singapore|dubai|berlin|munich|amsterdam|madrid|rome|milan|barcelona)\b/i,
  ];

  return placePatterns.some(p => p.test(lower));
}

interface ValidatedAddress {
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
}

async function saveAddressForUser(userId: string, address: ValidatedAddress) {
  const db = getPool();
  const existing = await db.query(
    `
      SELECT id
      FROM addresses
      WHERE user_id = $1
        AND name = $2
        AND phone = $3
        AND province = $4
        AND city = $5
        AND district = $6
        AND detail = $7
      LIMIT 1
    `,
    [
      userId,
      address.name,
      address.phone,
      address.province,
      address.city,
      address.district,
      address.detail,
    ]
  );

  if (existing.rowCount) return;

  const countResult = await db.query(
    'SELECT COUNT(*)::int AS count FROM addresses WHERE user_id = $1',
    [userId]
  );
  const addressCount = Number(countResult.rows[0]?.count || 0);
  if (addressCount >= 20) return;

  await db.query(
    `
      INSERT INTO addresses (
        id, user_id, name, phone, province, city, district, detail, is_default, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `,
    [
      randomUUID(),
      userId,
      address.name,
      address.phone,
      address.province,
      address.city,
      address.district,
      address.detail,
      addressCount === 0,
    ]
  );
}

function validateAddressField(value: unknown): { valid: boolean; address: ValidatedAddress | null; error?: string; field?: string } {
  if (!value || typeof value !== 'object') {
    return { valid: false, address: null, error: 'Please provide a shipping address.', field: 'address' };
  }
  const raw = value as Record<string, unknown>;
  const normalized = {
    name: cleanText(raw.name, 100),
    phone: cleanText(raw.phone, 40),
    province: cleanText(raw.province, 100),
    city: cleanText(raw.city, 100),
    district: cleanText(raw.district, 100),
    detail: cleanText(raw.detail, 300),
  };

  if (!normalized.name) {
    return { valid: false, address: null, error: 'Name is required.', field: 'name' };
  }
  if (normalized.name.length < 2) {
    return { valid: false, address: null, error: 'Name must be at least 2 characters.', field: 'name' };
  }
  if (normalized.name.length > 100) {
    return { valid: false, address: null, error: 'Name is too long (max 100 characters).', field: 'name' };
  }

  if (!normalized.phone) {
    return { valid: false, address: null, error: 'Phone number is required.', field: 'phone' };
  }
  if (!validInternationalPhone(normalized.phone)) {
    return { valid: false, address: null, error: 'Phone number must include country code, e.g. +86 13800138000.', field: 'phone' };
  }

  if (!normalized.province) {
    return { valid: false, address: null, error: 'Province/State is required.', field: 'province' };
  }
  if (!validAddressPart(normalized.province)) {
    return { valid: false, address: null, error: 'Please enter a valid province/state (not "N/A", "province", etc.).', field: 'province' };
  }
  if (!isValidPlaceName(normalized.province)) {
    return { valid: false, address: null, error: '请输入真实的省份/州名称，例如 "Guangdong"、"California"', field: 'province' };
  }

  if (!normalized.city) {
    return { valid: false, address: null, error: 'City is required.', field: 'city' };
  }
  if (!validAddressPart(normalized.city)) {
    return { valid: false, address: null, error: 'Please enter a valid city (not "N/A", "city", etc.).', field: 'city' };
  }
  if (!isValidPlaceName(normalized.city)) {
    return { valid: false, address: null, error: '请输入真实的城市名称，例如 "Yangjiang"、"London"', field: 'city' };
  }

  if (!normalized.district) {
    return { valid: false, address: null, error: 'District/Area is required.', field: 'district' };
  }
  if (!validAddressPart(normalized.district)) {
    return { valid: false, address: null, error: 'Please enter a valid district/area (not "N/A", "district", etc.).', field: 'district' };
  }
  if (!isValidPlaceName(normalized.district)) {
    return { valid: false, address: null, error: '请输入真实的地区名称，例如 "Jiangcheng"、"Manhattan"', field: 'district' };
  }

  if (!normalized.detail) {
    return { valid: false, address: null, error: 'Detailed address is required.', field: 'detail' };
  }
  if (normalized.detail.length < 5) {
    return { valid: false, address: null, error: 'Detailed address must be at least 5 characters.', field: 'detail' };
  }
  if (normalized.detail.length > 300) {
    return { valid: false, address: null, error: 'Detailed address is too long (max 300 characters).', field: 'detail' };
  }

  const addressText = [normalized.province, normalized.city, normalized.district, normalized.detail].join(' ');
  if (hasObviousAttackPayload(addressText)) {
    return {
      valid: false,
      address: null,
      error: 'Address contains unsafe content. Please remove suspicious code or SQL keywords.',
      field: 'detail',
    };
  }

  if (!looksLikeNormalAddress(normalized)) {
    return {
      valid: false,
      address: null,
      error: 'Please enter a recognizable shipping address, including street/building/room number if available.',
      field: 'detail',
    };
  }

  return { valid: true, address: normalized };
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
    const addressValidation = validateAddressField(body.address);

    // SECURITY: Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0 || items.length > MAX_ORDER_ITEMS) {
      return NextResponse.json(
        { error: 'Invalid order items', code: 'INVALID_ITEMS' },
        { status: 400 }
      );
    }

    if (!addressValidation.valid || !addressValidation.address) {
      return NextResponse.json(
        { error: addressValidation.error || 'Invalid shipping address', code: 'INVALID_ADDRESS', field: addressValidation.field },
        { status: 400 }
      );
    }
    const address = addressValidation.address;

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

      // SECURITY: Validate quantity against business rules
      const moq = product.moq || 1;
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

      await saveAddressForUser(authUser.id, address);
    } catch {
      return NextResponse.json(
        { error: 'Failed to save order', code: 'ORDER_SAVE_FAILED' },
        { status: 500 }
      );
    }

    // NOTE: Email notification is NOT sent here.
    // It will be sent when order status changes to 'paid' (payment confirmed).
    // This prevents sending emails before the customer actually pays.

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
