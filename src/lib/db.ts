import { Pool } from 'pg';
import type { Address, Order, User } from '@/types';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

function requireTlsConnectionString(url: string): string {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Invalid database URL protocol');
  }

  if (!parsed.searchParams.has('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
  }

  return parsed.toString();
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getPool(): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: requireTlsConnectionString(connectionString),
      ssl: true,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      maxLifetimeSeconds: 60,
      allowExitOnIdle: true,
      application_name: 'henrycutlery-web',
      options: [
        '-c statement_timeout=10000',
        '-c idle_in_transaction_session_timeout=10000',
        '-c lock_timeout=5000',
      ].join(' '),
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
