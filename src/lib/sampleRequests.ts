import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getPool } from '@/lib/db';

export interface SampleRequest {
  id: string;
  productId: string;
  productName: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  message: string;
  status: string;
  createdAt: string;
}

const SAMPLE_STATUSES = new Set(['new', 'contacted', 'sent', 'closed']);

function mapRow(row: Record<string, unknown>): SampleRequest {
  return {
    id: String(row.id),
    productId: String(row.product_id || ''),
    productName: String(row.product_name || ''),
    name: String(row.name),
    company: String(row.company || ''),
    email: String(row.email),
    phone: String(row.phone || ''),
    country: String(row.country || ''),
    address: String(row.address || ''),
    message: String(row.message || ''),
    status: String(row.status || 'new'),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function createSampleRequest(input: {
  productId?: unknown;
  productName?: unknown;
  name?: unknown;
  company?: unknown;
  email?: unknown;
  phone?: unknown;
  country?: unknown;
  address?: unknown;
  message?: unknown;
}): Promise<SampleRequest | null> {
  const name = String(input.name || '').trim().slice(0, 100);
  const email = String(input.email || '').trim().slice(0, 200);
  const country = String(input.country || '').trim().slice(0, 80);
  const address = String(input.address || '').trim().slice(0, 500);

  if (name.length < 2) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  if (country.length < 2) return null;
  if (address.length < 5) return null;

  await ensureDatabaseSchema();
  const result = await getPool().query(
    `INSERT INTO sample_requests
       (id, product_id, product_name, name, company, email, phone, country, address, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      `s${randomUUID()}`,
      String(input.productId || '').slice(0, 120),
      String(input.productName || '').slice(0, 200),
      name,
      String(input.company || '').trim().slice(0, 150),
      email,
      String(input.phone || '').trim().slice(0, 50),
      country,
      address,
      String(input.message || '').trim().slice(0, 1000),
    ]
  );
  return result.rowCount ? mapRow(result.rows[0]) : null;
}

export async function listSampleRequests(limit = 100): Promise<SampleRequest[]> {
  await ensureDatabaseSchema();
  const result = await getPool().query(
    'SELECT * FROM sample_requests ORDER BY created_at DESC LIMIT $1',
    [Math.min(Math.max(limit, 1), 300)]
  );
  return result.rows.map(mapRow);
}

export async function updateSampleRequestStatus(
  id: string,
  status: string
): Promise<SampleRequest | null> {
  if (!SAMPLE_STATUSES.has(status)) return null;
  await ensureDatabaseSchema();
  const result = await getPool().query(
    'UPDATE sample_requests SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id, status]
  );
  return result.rowCount ? mapRow(result.rows[0]) : null;
}
