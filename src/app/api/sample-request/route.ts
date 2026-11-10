import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseSchema } from '@/lib/db';
import { consumeRateLimit } from '@/lib/rateLimit';
import { createSampleRequest } from '@/lib/sampleRequests';
import { getAdminNotifyEmails, sendTransactionalEmail } from '@/lib/orderEmail';

export const dynamic = 'force-dynamic';

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseSchema();
    const ip = clientIp(request);
    const limit = await consumeRateLimit(`sample-request:${ip}`, 5, 10 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const sample = await createSampleRequest(body || {});
    if (!sample) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please fill in your name, a valid email, country and shipping address.',
        },
        { status: 400 }
      );
    }

    // Owner notification is best effort: the request is already stored.
    const recipients = getAdminNotifyEmails();
    if (recipients) {
      await sendTransactionalEmail({
        to: recipients,
        subject: `Sample request · ${sample.productName || sample.productId || 'general'} · ${sample.country}`,
        html: `<h2>New sample request</h2>
<p><strong>Product:</strong> ${escapeHtml(sample.productName || sample.productId || '—')}</p>
<p><strong>Name:</strong> ${escapeHtml(sample.name)}</p>
<p><strong>Company:</strong> ${escapeHtml(sample.company || '—')}</p>
<p><strong>Email:</strong> ${escapeHtml(sample.email)}</p>
<p><strong>Phone:</strong> ${escapeHtml(sample.phone || '—')}</p>
<p><strong>Country:</strong> ${escapeHtml(sample.country)}</p>
<p><strong>Address:</strong> ${escapeHtml(sample.address)}</p>
<p><strong>Message:</strong> ${escapeHtml(sample.message || '—')}</p>`,
        text: `New sample request
Product: ${sample.productName || sample.productId || '—'}
Name: ${sample.name}
Company: ${sample.company || '—'}
Email: ${sample.email}
Phone: ${sample.phone || '—'}
Country: ${sample.country}
Address: ${sample.address}
Message: ${sample.message || '—'}`,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, id: sample.id });
  } catch (error) {
    console.error(
      '[sample-request] failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ success: false, error: 'Failed to submit request' }, { status: 500 });
  }
}
