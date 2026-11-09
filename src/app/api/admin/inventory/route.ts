import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { getStockMap, setStock } from '@/lib/inventory';
import { products } from '@/data/products';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await requireAdmin();
    if ('response' in admin) return admin.response;

    const stock = await getStockMap();
    return NextResponse.json({ success: true, stock });
  } catch (err) {
    console.error('[admin/inventory] GET error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to load inventory.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    if ('response' in admin) return admin.response;

    const body = await request.json().catch(() => ({}));
    const updates: unknown = body?.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ success: false, error: 'No stock updates provided.' }, { status: 400 });
    }
    if (updates.length > 500) {
      return NextResponse.json({ success: false, error: 'Too many updates in one request.' }, { status: 400 });
    }

    const knownIds = new Set(products.map((product) => product.id));
    const cleaned: Array<{ productId: string; stock: number }> = [];
    for (const entry of updates) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const productId = typeof record.productId === 'string' ? record.productId.trim() : '';
      const stock = Number(record.stock);
      if (!knownIds.has(productId)) {
        return NextResponse.json({ success: false, error: `Unknown product: ${productId}` }, { status: 400 });
      }
      if (!Number.isFinite(stock) || stock < 0 || stock > 1000000) {
        return NextResponse.json(
          { success: false, error: `Invalid stock value for ${productId}. Use 0 to 1,000,000.` },
          { status: 400 }
        );
      }
      cleaned.push({ productId, stock: Math.trunc(stock) });
    }

    if (!cleaned.length) {
      return NextResponse.json({ success: false, error: 'No valid stock updates provided.' }, { status: 400 });
    }

    for (const update of cleaned) {
      await setStock(update.productId, update.stock);
    }

    return NextResponse.json({ success: true, stock: await getStockMap() });
  } catch (err) {
    console.error('[admin/inventory] PUT error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to save inventory.' }, { status: 500 });
  }
}
