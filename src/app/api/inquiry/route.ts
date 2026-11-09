import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { products } from '@/data/products';
import { getAuthUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool } from '@/lib/db';
import { sendInquiryNotificationEmail } from '@/lib/orderEmail';
import { consumeRateLimit } from '@/lib/rateLimit';

const MAX_INQUIRY_ITEMS = 50;
const HARD_MAX_ITEM_QUANTITY = 100000;

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function getProductById(productId: string) {
  return products.find((product) => product.id === productId);
}

/**
 * POST /api/inquiry
 *
 * Captures a bulk-order inquiry instead of creating an order. Prices and
 * totals are recalculated server-side; the client only supplies product IDs
 * and quantities.
 */
export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Please log in to submit an inquiry.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawItems = body?.items;

    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_INQUIRY_ITEMS) {
      return NextResponse.json({ success: false, error: 'Please provide the products you are interested in.' }, { status: 400 });
    }

    await ensureDatabaseSchema();

    const rate = await consumeRateLimit(`inquiry:${authUser.id}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many inquiries. Please try again later.' },
        { status: 429 }
      );
    }

    const items = [];
    let totalAmount = 0;

    for (const raw of rawItems) {
      const productId = cleanText(raw?.productId, 100);
      const quantity = Number(raw?.quantity);

      if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > HARD_MAX_ITEM_QUANTITY) {
        return NextResponse.json({ success: false, error: 'Invalid inquiry item.' }, { status: 400 });
      }

      const product = getProductById(productId);
      if (!product) {
        return NextResponse.json({ success: false, error: `Product not found: ${productId}` }, { status: 400 });
      }

      const lineTotal = product.price * quantity;
      totalAmount += lineTotal;

      items.push({
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity,
        lineTotal,
      });
    }

    const contactName = cleanText(body?.contactName, 100) || authUser.name || '';
    const contactPhone = cleanText(body?.contactPhone, 40);
    const company = cleanText(body?.company, 200);
    const expectedDelivery = cleanText(body?.expectedDelivery, 200);
    const customization = cleanText(body?.customization, 2000);
    const notes = cleanText(body?.notes, 2000);
    const reason = cleanText(body?.reason, 200);

    if (contactName.length < 2) {
      return NextResponse.json({ success: false, error: 'Please provide a contact name.' }, { status: 400 });
    }
    if (contactPhone.length < 5) {
      return NextResponse.json({ success: false, error: 'Please provide a contact phone number.' }, { status: 400 });
    }
    if (company.length < 2) {
      return NextResponse.json({ success: false, error: 'Please provide your company name.' }, { status: 400 });
    }

    const id = `inq_${randomUUID()}`;
    const pool = getPool();
    const createdAt = new Date().toISOString();

    await pool.query(
      `
        INSERT INTO inquiries (
          id, user_id, contact_name, contact_email, contact_phone, company,
          items, total_amount, expected_delivery, customization, notes, reason, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, 'new')
      `,
      [
        id,
        authUser.id,
        contactName,
        authUser.email,
        contactPhone,
        company,
        JSON.stringify(items),
        totalAmount,
        expectedDelivery,
        customization,
        notes,
        reason,
      ]
    );

    // Real-time alert to the owner. A mail failure must not lose the inquiry.
    try {
      await sendInquiryNotificationEmail({
        id,
        contactName,
        contactEmail: authUser.email,
        contactPhone,
        company,
        items,
        totalAmount,
        expectedDelivery,
        customization,
        notes,
        reason,
        createdAt,
      });
    } catch (err) {
      console.error('[inquiry] failed to send notification email:', err instanceof Error ? err.message : 'Unknown error');
    }

    return NextResponse.json({
      success: true,
      inquiry: {
        id,
        status: 'new',
        totalAmount,
        createdAt,
      },
      message: 'Inquiry received. Our team will contact you shortly.',
    });
  } catch (err) {
    console.error('[inquiry] error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to submit inquiry' }, { status: 500 });
  }
}
