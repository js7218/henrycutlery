import { Pool } from 'pg';
import type { Address, Order, User } from '@/types';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getPool(): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }

  return pool;
}

export async function ensureDatabaseSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool();

      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          favorites JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS addresses (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          province TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          district TEXT NOT NULL DEFAULT '',
          detail TEXT NOT NULL DEFAULT '',
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS addresses_user_id_idx ON addresses(user_id);
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          order_number TEXT NOT NULL UNIQUE,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
          payment_method TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    })();
  }

  return schemaReady;
}

export async function getUserAddresses(userId: string): Promise<Address[]> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    `
      SELECT id, name, phone, province, city, district, detail, is_default
      FROM addresses
      WHERE user_id = $1
      ORDER BY is_default DESC, created_at ASC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    province: row.province,
    city: row.city,
    district: row.district,
    detail: row.detail,
    isDefault: row.is_default,
  }));
}

export async function getUserOrders(userId: string): Promise<Order[]> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    `
      SELECT id, order_number, items, total_amount, status, shipping_address, payment_method, created_at, updated_at
      FROM orders
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    items: Array.isArray(row.items) ? row.items : [],
    totalAmount: Number(row.total_amount || 0),
    status: row.status,
    shippingAddress: row.shipping_address,
    paymentMethod: row.payment_method,
    createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
    updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
  }));
}

export async function getUserById(userId: string): Promise<User | null> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    `
      SELECT id, email, name, phone, role, favorites, created_at
      FROM users
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name || row.email.split('@')[0],
    phone: row.phone || '',
    role: row.role === 'admin' ? 'admin' : 'user',
    addresses: await getUserAddresses(row.id),
    orders: await getUserOrders(row.id),
    favorites: Array.isArray(row.favorites) ? row.favorites : [],
    createdAt: row.created_at?.toISOString?.() || new Date().toISOString(),
  };
}
