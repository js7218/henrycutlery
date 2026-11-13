import { Pool } from 'pg';
import type { Address, Order, User } from '@/types';
import { customerOrderNumberFields } from '@/lib/orderView';
import { products as catalogProducts } from '@/data/products';

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

      // Social sign-in: an account created through an OAuth provider has no
      // password, so the column must allow NULL. (provider, subject) is the
      // stable identity returned by each provider.
      await db.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider TEXT;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_subject TEXT;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_identity_idx
        ON users (oauth_provider, oauth_subject)
        WHERE oauth_provider IS NOT NULL AND oauth_subject IS NOT NULL;
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

      await db.query(`
        CREATE TABLE IF NOT EXISTS shipping_rates (
          country_code TEXT PRIMARY KEY,
          country_name TEXT NOT NULL DEFAULT '',
          per_kg_usd NUMERIC(12,4) NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS product_weights (
          product_id TEXT PRIMARY KEY,
          weight_kg NUMERIC(12,6) NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Accept whatever precision the owner types instead of silently rounding
      // shipping inputs to 2 or 3 decimals.
      await db.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'shipping_rates' AND column_name = 'per_kg_usd' AND numeric_scale < 4
          ) THEN
            ALTER TABLE shipping_rates ALTER COLUMN per_kg_usd TYPE NUMERIC(12,4);
          END IF;
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'product_weights' AND column_name = 'weight_kg' AND numeric_scale < 6
          ) THEN
            ALTER TABLE product_weights ALTER COLUMN weight_kg TYPE NUMERIC(12,6);
          END IF;
        END $$;
      `);

      // Freight can only be calculated automatically once every SKU has a
      // weight. Most catalogue entries say "TBD", so seed a realistic default
      // (parsed from the spec when grams/ounces are given) and let the owner
      // refine it on /hc-control-2026/shipping.
      if (catalogProducts.length > 0) {
        const defaultWeightByCategory: Record<string, number> = {
          kitchen: 0.5,
          folding: 0.25,
          hunting: 0.45,
          collection: 0.4,
        };
        const weightOf = (product: (typeof catalogProducts)[number]) => {
          const spec = String(product.specs?.weight || '');
          const grams = spec.match(/(\d+(?:\.\d+)?)\s*g\b/i);
          if (grams) return Math.max(0.01, Math.round((Number(grams[1]) / 1000) * 1000) / 1000);
          const ounces = spec.match(/(\d+(?:\.\d+)?)\s*oz/i);
          if (ounces) return Math.max(0.01, Math.round(((Number(ounces[1]) * 28.3495) / 1000) * 1000) / 1000);
          return defaultWeightByCategory[product.category] ?? 0.4;
        };
        await db.query(
          `
            INSERT INTO product_weights (product_id, weight_kg)
            SELECT * FROM UNNEST($1::text[], $2::float8[])
            ON CONFLICT (product_id) DO NOTHING
          `,
          [catalogProducts.map((product) => product.id), catalogProducts.map(weightOf)]
        );
      }

      // Live inventory. The static product catalogue only provides the opening
      // stock; every order decrements this table atomically so two customers
      // can never buy the same units.
      await db.query(`
        CREATE TABLE IF NOT EXISTS product_stock (
          product_id TEXT PRIMARY KEY,
          stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      if (catalogProducts.length > 0) {
        await db.query(
          `
            INSERT INTO product_stock (product_id, stock)
            SELECT * FROM UNNEST($1::text[], $2::int[])
            ON CONFLICT (product_id) DO NOTHING
          `,
          [
            catalogProducts.map((product) => product.id),
            catalogProducts.map((product) => Math.max(0, Math.trunc(Number(product.stock) || 0))),
          ]
        );
      }

      await db.query(`
        INSERT INTO shipping_rates (country_code, country_name, per_kg_usd) VALUES
          ('US','United States',20), ('CA','Canada',20), ('GB','United Kingdom',18),
          ('DE','Germany',18), ('FR','France',18), ('IT','Italy',18), ('ES','Spain',18),
          ('NL','Netherlands',18), ('BE','Belgium',18), ('CH','Switzerland',20),
          ('AT','Austria',18), ('PL','Poland',18), ('SE','Sweden',20), ('NO','Norway',20),
          ('DK','Denmark',18), ('FI','Finland',20), ('IE','Ireland',18), ('PT','Portugal',18),
          ('GR','Greece',18), ('AU','Australia',20), ('NZ','New Zealand',20),
          ('JP','Japan',16), ('KR','South Korea',16), ('SG','Singapore',14),
          ('MY','Malaysia',14), ('TH','Thailand',14), ('VN','Vietnam',14),
          ('ID','Indonesia',14), ('PH','Philippines',14), ('IN','India',16),
          ('PK','Pakistan',16), ('BD','Bangladesh',16), ('LK','Sri Lanka',16),
          ('AE','United Arab Emirates',16), ('SA','Saudi Arabia',16), ('IL','Israel',18),
          ('TR','Turkey',18), ('RU','Russia',22), ('MX','Mexico',20), ('BR','Brazil',24),
          ('AR','Argentina',24), ('CL','Chile',24), ('CO','Colombia',24), ('PE','Peru',24),
          ('ZA','South Africa',24), ('EG','Egypt',22), ('NG','Nigeria',24),
          ('KE','Kenya',24), ('HK','Hong Kong',10), ('MO','Macau',10),
          ('TW','Taiwan',12), ('CN','China',8)
        ON CONFLICT (country_code) DO NOTHING;
      `);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
      await db.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

      await db.query(`
        CREATE INDEX IF NOT EXISTS addresses_user_id_idx ON addresses(user_id);
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
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

      // Idempotency key supplied by the checkout page. Two submissions with the
      // same key map to a single order, so a double click or a retried request
      // after a timeout cannot create a duplicate order.
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT '';`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT NOT NULL DEFAULT '';`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;`);
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx
        ON orders (idempotency_key)
        WHERE idempotency_key IS NOT NULL;
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS orders_user_created_idx
        ON orders (user_id, created_at DESC);
      `);

      // Guest checkout: a customer may place an order without an account, so
      // user_id is optional. The contact email on the order is the identity.
      await db.query(`ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;`);
      await db.query(`
        CREATE INDEX IF NOT EXISTS orders_contact_email_created_idx
        ON orders (LOWER(contact_email), created_at DESC);
      `);

      // Bulk orders (high value / high quantity / beyond stock) do not create
      // an order. They are captured as inquiries for manual quoting.
      await db.query(`
        CREATE TABLE IF NOT EXISTS inquiries (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          contact_name TEXT NOT NULL,
          contact_email TEXT NOT NULL,
          contact_phone TEXT NOT NULL DEFAULT '',
          company TEXT NOT NULL DEFAULT '',
          items JSONB NOT NULL,
          total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
          start_date TEXT NOT NULL DEFAULT '',
          expected_delivery TEXT NOT NULL DEFAULT '',
          customization TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'new',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      // Advisory company lookup verdict, stored as JSON text. Empty when the
      // check was skipped or predates this column.
      await db.query(`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS company_check TEXT NOT NULL DEFAULT '';`);
      // Order start date, added after the first inquiries were already stored.
      await db.query(`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS start_date TEXT NOT NULL DEFAULT '';`);
      await db.query(`
        CREATE INDEX IF NOT EXISTS inquiries_status_created_idx
        ON inquiries (status, created_at DESC);
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS inquiries_user_created_idx
        ON inquiries (user_id, created_at DESC);
      `);
      // Inquiries may come from guests who are not signed in.
      await db.query(`ALTER TABLE inquiries ALTER COLUMN user_id DROP NOT NULL;`);

      // Sample requests. B2B knife buyers almost always want to see a physical
      // sample before placing a bulk order, so this is a separate funnel entry.
      await db.query(`
        CREATE TABLE IF NOT EXISTS sample_requests (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL DEFAULT '',
          product_name TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          company TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL,
          phone TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'new',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS sample_requests_created_idx
        ON sample_requests (created_at DESC);
      `);

      // Money actually received for an order. Reconciliation compares this with
      // the order total and with the forwarder bills, so a short payment or an
      // under-quoted freight shows up instead of being lost in a spreadsheet.
      await db.query(`
        CREATE TABLE IF NOT EXISTS order_payments (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          amount_usd NUMERIC(12, 2) NOT NULL,
          fee_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
          method TEXT NOT NULL DEFAULT '',
          reference TEXT NOT NULL DEFAULT '',
          received_at DATE,
          note TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS order_payments_order_idx
        ON order_payments (order_id, created_at DESC);
      `);

      // Destination-country import guidance for bladed items. These are
      // advisory only: the customer confirms the rule before checkout and the
      // import responsibility stays with the importer. The owner can edit
      // every row from the admin panel, so changes do not need a deploy.
      await db.query(`
        CREATE TABLE IF NOT EXISTS knife_compliance_rules (
          country_code TEXT PRIMARY KEY,
          country_name TEXT NOT NULL DEFAULT '',
          risk_level TEXT NOT NULL DEFAULT 'none',
          restricted_types TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL DEFAULT '',
          source_url TEXT NOT NULL DEFAULT '',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE knife_compliance_rules
          ADD COLUMN IF NOT EXISTS manual_override BOOLEAN NOT NULL DEFAULT FALSE;
        CREATE TABLE IF NOT EXISTS compliance_scan_sources (
          id TEXT PRIMARY KEY,
          country_code TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          url TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          last_checked_at TIMESTAMPTZ,
          last_status TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS compliance_scan_changes (
          id TEXT PRIMARY KEY,
          country_code TEXT NOT NULL,
          old_risk TEXT NOT NULL DEFAULT 'none',
          new_risk TEXT NOT NULL DEFAULT 'none',
          summary TEXT NOT NULL DEFAULT '',
          source_url TEXT NOT NULL DEFAULT '',
          applied BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS compliance_verifications (
          country_code TEXT PRIMARY KEY,
          risk_level TEXT NOT NULL DEFAULT 'none',
          source_url TEXT NOT NULL DEFAULT '',
          snippet TEXT NOT NULL DEFAULT '',
          checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        INSERT INTO knife_compliance_rules
          (country_code, country_name, risk_level, restricted_types, message, source_url, enabled)
        VALUES
          ('GB', 'United Kingdom', 'high', 'Locking folding knives, flick knives, gravity knives, butterfly knives, push daggers',
           'UK customs treat many locking and one-hand-opening folding knives as prohibited weapons. Kitchen and fixed-blade knives are usually allowed.',
           'https://www.gov.uk/guidance/import-controls-on-offensive-weapons', TRUE),
          ('IE', 'Ireland', 'high', 'Flick knives, gravity knives, butterfly knives, push daggers',
           'Irish customs restrict several bladed-item categories. Please confirm the exact model with Irish customs before ordering.',
           'https://www.revenue.ie/en/customs/', TRUE),
          ('DE', 'Germany', 'high', 'Flick knives, butterfly knives, gravity knives, one-hand-opening locking folders',
           'Germany restricts several folding-knife categories under the Weapons Act. Fixed-blade kitchen knives are normally allowed.',
           'https://www.zoll.de/EN/Home/home_node.html', TRUE),
          ('FR', 'France', 'medium', 'Concealed blades, automatic knives, butterfly knives',
           'France classifies some automatic and concealed knives as prohibited weapons. Please confirm your model locally.',
           'https://www.douane.gouv.fr/', TRUE),
          ('NL', 'Netherlands', 'medium', 'Butterfly knives, stilettos, automatic knives',
           'The Netherlands restricts several bladed-item categories. Please confirm with Dutch customs.',
           'https://www.belastingdienst.nl/', TRUE),
          ('AU', 'Australia', 'high', 'Automatic knives, butterfly knives, push daggers, some folding knives',
           'Australian border rules are strict for flick, gravity and butterfly knives. Kitchen and fixed-blade knives are usually permitted.',
           'https://www.abf.gov.au/importing-exporting-and-manufacturing/prohibited-goods', TRUE),
          ('NZ', 'New Zealand', 'medium', 'Butterfly knives, automatic knives, push daggers',
           'New Zealand restricts some bladed items. Please confirm with NZ Customs before ordering.',
           'https://www.customs.govt.nz/', TRUE),
          ('CA', 'Canada', 'high', 'Automatic knives, butterfly knives, push daggers, gravity knives',
           'Canada prohibits several automatic and gravity knife categories. Kitchen knives are normally allowed.',
           'https://www.cbsa-asfc.gc.ca/', TRUE),
          ('US', 'United States', 'medium', 'Automatic knives (state-dependent), butterfly knives (state-dependent)',
           'US federal rules are permissive for most kitchen knives, but several states restrict automatic and butterfly knives. Please check your state.',
           'https://www.cbp.gov/', TRUE),
          ('JP', 'Japan', 'medium', 'Blades over the legal length limit, automatic knives',
           'Japan limits blade length for some knife types. Please confirm the model meets Japanese requirements.',
           'https://www.customs.go.jp/english/', TRUE),
          ('SG', 'Singapore', 'high', 'Automatic knives, butterfly knives, push daggers, flick knives',
           'Singapore prohibits several bladed-item categories. Please confirm with Singapore Customs.',
           'https://www.customs.gov.sg/', TRUE)
        ON CONFLICT (country_code) DO NOTHING;
      `);
      // Every remaining shipping destination gets a placeholder rule. The risk
      // level stays "none" (no notice at checkout) until the daily AI
      // verification finds a real restriction, but the row is what puts the
      // country into that rotation in the first place.
      await db.query(`
        INSERT INTO knife_compliance_rules
          (country_code, country_name, risk_level, restricted_types, message, source_url, enabled)
        VALUES
          ('IT', 'Italy', 'none', '', '', '', TRUE),
          ('ES', 'Spain', 'none', '', '', '', TRUE),
          ('KR', 'South Korea', 'none', '', '', '', TRUE),
          ('AE', 'United Arab Emirates', 'none', '', '', '', TRUE),
          ('IL', 'Israel', 'none', '', '', '', TRUE),
          ('HK', 'Hong Kong', 'none', '', '', '', TRUE),
          ('TW', 'Taiwan', 'none', '', '', '', TRUE),
          ('CH', 'Switzerland', 'none', '', '', '', TRUE),
          ('AT', 'Austria', 'none', '', '', '', TRUE),
          ('BE', 'Belgium', 'none', '', '', '', TRUE),
          ('PL', 'Poland', 'none', '', '', '', TRUE),
          ('SE', 'Sweden', 'none', '', '', '', TRUE),
          ('NO', 'Norway', 'none', '', '', '', TRUE),
          ('DK', 'Denmark', 'none', '', '', '', TRUE),
          ('FI', 'Finland', 'none', '', '', '', TRUE),
          ('PT', 'Portugal', 'none', '', '', '', TRUE),
          ('GR', 'Greece', 'none', '', '', '', TRUE),
          ('SA', 'Saudi Arabia', 'none', '', '', '', TRUE),
          ('TR', 'Turkey', 'none', '', '', '', TRUE),
          ('MY', 'Malaysia', 'none', '', '', '', TRUE),
          ('TH', 'Thailand', 'none', '', '', '', TRUE),
          ('VN', 'Vietnam', 'none', '', '', '', TRUE),
          ('ID', 'Indonesia', 'none', '', '', '', TRUE),
          ('PH', 'Philippines', 'none', '', '', '', TRUE),
          ('IN', 'India', 'none', '', '', '', TRUE),
          ('PK', 'Pakistan', 'none', '', '', '', TRUE),
          ('BD', 'Bangladesh', 'none', '', '', '', TRUE),
          ('LK', 'Sri Lanka', 'none', '', '', '', TRUE),
          ('MO', 'Macau', 'none', '', '', '', TRUE),
          ('CN', 'China', 'none', '', '', '', TRUE),
          ('MX', 'Mexico', 'none', '', '', '', TRUE),
          ('BR', 'Brazil', 'none', '', '', '', TRUE),
          ('AR', 'Argentina', 'none', '', '', '', TRUE),
          ('CL', 'Chile', 'none', '', '', '', TRUE),
          ('CO', 'Colombia', 'none', '', '', '', TRUE),
          ('PE', 'Peru', 'none', '', '', '', TRUE),
          ('ZA', 'South Africa', 'none', '', '', '', TRUE),
          ('EG', 'Egypt', 'none', '', '', '', TRUE),
          ('NG', 'Nigeria', 'none', '', '', '', TRUE),
          ('KE', 'Kenya', 'none', '', '', '', TRUE),
          ('RU', 'Russia', 'none', '', '', '', TRUE)
        ON CONFLICT (country_code) DO NOTHING;
      `);

      // Daily market snapshots for shipping. The cron job records an FX rate
      // and whatever public carrier/forwarder pages the owner configured, so
      // rate changes can be reviewed instead of guessed.
      await db.query(`
        CREATE TABLE IF NOT EXISTS shipping_market_sources (
          id TEXT PRIMARY KEY,
          country_code TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          url TEXT NOT NULL,
          unit TEXT NOT NULL DEFAULT 'usd_per_kg',
          regex TEXT NOT NULL DEFAULT '',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          notes TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS shipping_market_observations (
          id TEXT PRIMARY KEY,
          country_code TEXT NOT NULL,
          source_id TEXT NOT NULL DEFAULT '',
          source_label TEXT NOT NULL DEFAULT '',
          source_url TEXT NOT NULL DEFAULT '',
          usd_per_kg NUMERIC(12, 4),
          ok BOOLEAN NOT NULL DEFAULT TRUE,
          error TEXT NOT NULL DEFAULT '',
          captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS shipping_market_observations_country_idx
        ON shipping_market_observations (country_code, captured_at DESC);
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS fx_rates (
          pair TEXT PRIMARY KEY,
          rate NUMERIC(18, 8) NOT NULL,
          source TEXT NOT NULL DEFAULT '',
          captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS shipping_rate_changes (
          id TEXT PRIMARY KEY,
          country_code TEXT NOT NULL,
          before_usd NUMERIC(12, 4),
          after_usd NUMERIC(12, 4) NOT NULL,
          source TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS shipping_rate_changes_country_idx
        ON shipping_rate_changes (country_code, changed_at DESC);
      `);
      // Automation thresholds. A single row (id = 'default') keeps the owner in
      // charge: nothing is applied unless auto-apply is switched on explicitly.
      await db.query(`
        CREATE TABLE IF NOT EXISTS shipping_market_settings (
          id TEXT PRIMARY KEY,
          auto_apply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          quiet_pct NUMERIC(6, 2) NOT NULL DEFAULT 5,
          review_pct NUMERIC(6, 2) NOT NULL DEFAULT 15,
          margin_pct NUMERIC(6, 2) NOT NULL DEFAULT 20,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        ALTER TABLE shipping_market_settings
        ADD COLUMN IF NOT EXISTS margin_pct NUMERIC(6, 2) NOT NULL DEFAULT 20;
      `);
      // Actual forwarder bills. These are the ground truth used to calibrate
      // the public market estimates.
      await db.query(`
        CREATE TABLE IF NOT EXISTS shipping_bills (
          id TEXT PRIMARY KEY,
          country_code TEXT NOT NULL,
          weight_kg NUMERIC(12, 3) NOT NULL,
          billed_usd NUMERIC(12, 2) NOT NULL,
          channel TEXT NOT NULL DEFAULT '',
          shipped_at DATE,
          note TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS shipping_bills_country_idx
        ON shipping_bills (country_code, created_at DESC);
      `);
      // Cost floor per country. Automated updates are never allowed to go
      // below it, so a bad capture cannot make shipping a loss-maker.
      await db.query(`
        ALTER TABLE shipping_rates
        ADD COLUMN IF NOT EXISTS floor_usd_per_kg NUMERIC(12, 4);
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

      // Shared fixed-window counters. Kept in the database because serverless
      // instances cannot share in-memory rate limit state.
      await db.query(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          count INTEGER NOT NULL DEFAULT 0
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window_start);`);

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

      // SEO content drafts with human review flow. Drafts are produced by the
      // LLM generator, approved in the admin panel, then published to
      // src/data/seo-content.json by a GitHub Action.
      await db.query(`
        CREATE TABLE IF NOT EXISTS seo_drafts (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'draft',
          content JSONB NOT NULL DEFAULT '{}'::jsonb,
          model TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          reviewed_by TEXT,
          reviewed_at TIMESTAMPTZ
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS seo_drafts_status_idx ON seo_drafts(status);`);

      // Shipping-fee negotiation. The customer talks to an assistant, but the
      // server owns the floor and every amount is recomputed server-side.
      await db.query(`
        CREATE TABLE IF NOT EXISTS negotiation_settings (
          id TEXT PRIMARY KEY DEFAULT 'default',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          max_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 5,
          floor_ratio NUMERIC(5,4) NOT NULL DEFAULT 0.70,
          min_shipping_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS app_migrations (
          id TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      // One-off: the owner lowered the negotiation ceiling from 30% to 5%.
      // Guarded by a migration row so a later manual change is never reverted.
      const migration = await db.query(
        `INSERT INTO app_migrations (id) VALUES ('negotiation-discount-5')
         ON CONFLICT (id) DO NOTHING RETURNING id`
      );
      if (migration.rowCount) {
        await db.query(
          `UPDATE negotiation_settings SET max_discount_pct = 5, updated_at = NOW() WHERE id = 'default'`
        );
      }
      await db.query(`
        CREATE TABLE IF NOT EXISTS shipping_negotiations (
          id TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          country_code TEXT NOT NULL DEFAULT '',
          weight_kg NUMERIC(12,6) NOT NULL DEFAULT 0,
          quote_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
          final_usd NUMERIC(10,2),
          granted BOOLEAN NOT NULL DEFAULT FALSE,
          messages JSONB,
          reply TEXT NOT NULL DEFAULT ''
        );
      `);

      // Marketing consent. The visitor opts in from the first-visit banner and
      // can leave at any time through the unsubscribe link in every email.
      await db.query(`
        CREATE TABLE IF NOT EXISTS marketing_subscribers (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          consent BOOLEAN NOT NULL DEFAULT FALSE,
          source TEXT NOT NULL DEFAULT '',
          ip TEXT NOT NULL DEFAULT '',
          user_agent TEXT NOT NULL DEFAULT '',
          unsubscribe_token TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          unsubscribed_at TIMESTAMPTZ
        );
      `);
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS marketing_subscribers_email_idx
        ON marketing_subscribers (LOWER(email));
      `);

      // One row per product campaign. The product_id unique constraint is what
      // guarantees a new product is announced exactly once, no matter how many
      // times the daily cron runs.
      await db.query(`
        CREATE TABLE IF NOT EXISTS marketing_campaigns (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL UNIQUE,
          subject TEXT NOT NULL DEFAULT '',
          recipients INT NOT NULL DEFAULT 0,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // One row per recipient per product. The unique pair makes the daily job
      // resumable: an address that already received a product's email is never
      // emailed about it again, even if a run was interrupted.
      await db.query(`
        CREATE TABLE IF NOT EXISTS marketing_sends (
          product_id TEXT NOT NULL,
          email TEXT NOT NULL,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (product_id, email)
        );
      `);
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
      SELECT id, order_number, items, total_amount, status, shipping_address, payment_method,
             tracking_number, shipped_at, delivered_at, created_at, updated_at
      FROM orders
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    ...customerOrderNumberFields(row.order_number, row.status),
    items: Array.isArray(row.items) ? row.items : [],
    totalAmount: Number(row.total_amount || 0),
    status: row.status,
    shippingAddress: row.shipping_address,
    paymentMethod: row.payment_method,
    trackingNumber: row.tracking_number || '',
    shippedAt: row.shipped_at?.toISOString?.() || undefined,
    deliveredAt: row.delivered_at?.toISOString?.() || undefined,
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
