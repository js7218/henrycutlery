import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserAddresses } from '@/lib/db';
import type { Address } from '@/types';

function clean(value: unknown, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeAddress(address: unknown): Address | null {
  if (!address || typeof address !== 'object') return null;
  const value = address as Record<string, unknown>;
  const normalized = {
    id: clean(value.id, 80) || `a${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    name: clean(value.name, 100),
    phone: clean(value.phone, 40),
    province: clean(value.province, 100),
    city: clean(value.city, 100),
    district: clean(value.district, 100),
    detail: clean(value.detail, 300),
    isDefault: Boolean(value.isDefault),
  };

  if (!normalized.name || !normalized.phone || !normalized.detail) return null;
  return normalized;
}

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
  }

  const response = NextResponse.json({
    success: true,
    addresses: await getUserAddresses(authUser.id),
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function PUT(request: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const addressesInput: unknown[] = Array.isArray(body.addresses) ? body.addresses : [];
    const addresses = addressesInput
      .map(normalizeAddress)
      .filter((address: Address | null): address is Address => Boolean(address))
      .slice(0, 20);

    if (addresses.length > 0 && !addresses.some((address) => address.isDefault)) {
      addresses[0].isDefault = true;
    }

    await ensureDatabaseSchema();
    const db = getPool();
    const client = await db.connect();

    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM addresses WHERE user_id = $1', [authUser.id]);

      for (const address of addresses) {
        await client.query(
          `
            INSERT INTO addresses (
              id, user_id, name, phone, province, city, district, detail, is_default, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          `,
          [
            address.id,
            authUser.id,
            address.name,
            address.phone,
            address.province,
            address.city,
            address.district,
            address.detail,
            address.isDefault,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const response = NextResponse.json({
      success: true,
      addresses: await getUserAddresses(authUser.id),
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: '保存收货地址失败' },
      { status: 500 }
    );
  }
}
