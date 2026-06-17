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
      ssl: { rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false },
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
      application_name: 'henrycutlery-web',
    });

    pool.on('error', (err) => {
      console.error('[db] idle client error', err instanceof Error ? err.message : 'Unknown error');
    });
  }

  return pool;
}

export async function ensureDatabaseSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      try {
        await runSchemaMigration();
      } catch (err) {
        // Reset so the next request can retry instead of being stuck.
        schemaReady = null;
        throw err;
      }
    })();
  }

  return schemaReady;
}

async function runSchemaMigration(): Promise<void> {
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

      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;`);
      await db.query(`UPDATE users SET name = '' WHERE name IS NULL;`);
      await db.query(`ALTER TABLE users ALTER COLUMN name SET DEFAULT '';`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`);
      await db.query(`UPDATE users SET phone = '' WHERE phone IS NULL;`);
      await db.query(`ALTER TABLE users ALTER COLUMN phone SET DEFAULT '';`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
      await db.query(`UPDATE users SET password_hash = '' WHERE password_hash IS NULL;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;`);
      await db.query(`UPDATE users SET role = 'user' WHERE role IS NULL;`);
      await db.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS favorites JSONB;`);
      await db.query(`UPDATE users SET favorites = '[]'::jsonb WHERE favorites IS NULL;`);
      await db.query(`ALTER TABLE users ALTER COLUMN favorites SET DEFAULT '[]'::jsonb;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;`);
      await db.query(`UPDATE users SET created_at = NOW() WHERE created_at IS NULL;`);
      await db.query(`ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW();`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;`);
      await db.query(`UPDATE users SET updated_at = NOW() WHERE updated_at IS NULL;`);
      await db.query(`ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT NOW();`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`);
      await db.query(`
        CREATE INDEX IF NOT EXISTS users_email_lookup_idx
        ON users (LOWER(email))
        WHERE deleted_at IS NULL AND email IS NOT NULL;
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

      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS user_id TEXT;`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS province TEXT NOT NULL DEFAULT '';`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS district TEXT NOT NULL DEFAULT '';`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS detail TEXT NOT NULL DEFAULT '';`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

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

      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id TEXT;`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb;`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT '';`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
      await db.query(`
        CREATE INDEX IF NOT EXISTS orders_order_number_lookup_idx
        ON orders (order_number)
        WHERE order_number IS NOT NULL;
      `);

      // Password reset tokens. We never email plaintext passwords; the
      // customer clicks a one-time link bound to a hashed token.
      await db.query(`
        CREATE TABLE IF NOT EXISTS password_resets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ip TEXT NOT NULL DEFAULT ''
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets(user_id);`);
      await db.query(`CREATE INDEX IF NOT EXISTS password_resets_expires_idx ON password_resets(expires_at);`);

      // Phone/email verification codes for login. 1-minute expiry, single-use.
      await db.query(`
        CREATE TABLE IF NOT EXISTS verification_codes (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          email TEXT,
          phone TEXT,
          code_hash TEXT NOT NULL,
          purpose TEXT NOT NULL DEFAULT 'login',
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          attempts INTEGER NOT NULL DEFAULT 0,
          ip TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS verification_codes_email_idx ON verification_codes(email) WHERE used_at IS NULL;`);
      await db.query(`CREATE INDEX IF NOT EXISTS verification_codes_phone_idx ON verification_codes(phone) WHERE used_at IS NULL;`);
      await db.query(`CREATE INDEX IF NOT EXISTS verification_codes_expires_idx ON verification_codes(expires_at);`);

      // Login history for multi-device detection and security alerts
      await db.query(`
        CREATE TABLE IF NOT EXISTS login_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          ip TEXT NOT NULL DEFAULT '',
          user_agent TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          login_method TEXT NOT NULL DEFAULT 'password',
          is_new_device BOOLEAN NOT NULL DEFAULT FALSE,
          alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS login_history_user_id_idx ON login_history(user_id);`);
      await db.query(`CREATE INDEX IF NOT EXISTS login_history_created_idx ON login_history(created_at);`);

      // Product reviews with moderation flow. All reviews start as "pending"
      // and only become visible to other customers after admin approval, or
      // after the auto-classifier marks them as clearly safe.
      await db.query(`
        CREATE TABLE IF NOT EXISTS product_reviews (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          author_name TEXT NOT NULL DEFAULT '',
          rating INTEGER NOT NULL DEFAULT 5,
          content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          risk_score INTEGER NOT NULL DEFAULT 0,
          risk_reason TEXT NOT NULL DEFAULT '',
          ip_hash TEXT NOT NULL DEFAULT '',
          user_agent TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON product_reviews(product_id);`);
      await db.query(`CREATE INDEX IF NOT EXISTS product_reviews_status_idx ON product_reviews(status);`);

      // Add review verification columns if not exists
      await db.query(`ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN NOT NULL DEFAULT FALSE;`);
      await db.query(`ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS helpful_count INTEGER NOT NULL DEFAULT 0;`);
      await db.query(`ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS not_helpful_count INTEGER NOT NULL DEFAULT 0;`);
      await db.query(`ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'pending';`);
      await db.query(`ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;`);
      await db.query(`ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS moderated_by TEXT;`);
      await db.query(`UPDATE product_reviews SET moderation_status = status WHERE moderation_status = 'pending' AND status != 'pending';`);

      // Review helpfulness votes table
      await db.query(`
        CREATE TABLE IF NOT EXISTS review_votes (
          id TEXT PRIMARY KEY,
          review_id TEXT NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          is_helpful BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(review_id, user_id)
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS review_votes_review_idx ON review_votes(review_id);`);
      await db.query(`CREATE INDEX IF NOT EXISTS review_votes_user_idx ON review_votes(user_id);`);
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
