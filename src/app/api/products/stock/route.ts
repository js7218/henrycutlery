import { NextResponse } from 'next/server';
import { getStockMap } from '@/lib/inventory';

export const dynamic = 'force-dynamic';

/** Public, read-only live stock level per product. */
export async function GET() {
  try {
    const stock = await getStockMap();
    return NextResponse.json(
      { success: true, stock },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[products/stock] error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ success: false, error: 'Stock is unavailable.' }, { status: 500 });
  }
}
