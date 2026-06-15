import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getPool, getUserById } from '@/lib/db';
import { products } from '@/data/products';

function normalizeFavorites(value: unknown): string[] {
  const validIds = new Set(products.map((product) => product.id));
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => validIds.has(item))
    )
  ).slice(0, 500);
}

export async function PUT(request: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Please sign in first.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const favorites = normalizeFavorites(body.favorites);

    await getPool().query(
      'UPDATE users SET favorites = $1::jsonb, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
      [JSON.stringify(favorites), authUser.id]
    );

    return NextResponse.json({
      success: true,
      user: await getUserById(authUser.id),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to update favorites.' }, { status: 500 });
  }
}
