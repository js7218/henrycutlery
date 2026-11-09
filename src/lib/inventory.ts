import { ensureDatabaseSchema, getPool } from '@/lib/db';

export interface InventoryLine {
  productId: string;
  quantity: number;
  productName?: string;
}

/** Lock rows in a stable order so concurrent orders cannot deadlock. */
function sortedLines(items: InventoryLine[]): InventoryLine[] {
  return [...items].sort((a, b) => a.productId.localeCompare(b.productId));
}

export type ReserveResult =
  | { ok: true }
  | { ok: false; productId: string; productName: string; available: number };

/**
 * Atomically take stock for a set of order lines.
 * Returns ok=false (and rolls back) when any line cannot be fulfilled, so the
 * caller can tell the customer exactly which product ran out.
 */
export async function reserveStock(items: InventoryLine[]): Promise<ReserveResult> {
  await ensureDatabaseSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const item of sortedLines(items)) {
      if (item.quantity <= 0) continue;
      const reserved = await client.query(
        `UPDATE product_stock
         SET stock = stock - $2, updated_at = NOW()
         WHERE product_id = $1 AND stock >= $2`,
        [item.productId, item.quantity]
      );
      if (!reserved.rowCount) {
        const available = await client.query(
          'SELECT stock FROM product_stock WHERE product_id = $1',
          [item.productId]
        );
        await client.query('ROLLBACK');
        return {
          ok: false,
          productId: item.productId,
          productName: item.productName || item.productId,
          available: Number(available.rows[0]?.stock || 0),
        };
      }
    }
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Give stock back (order cancelled or pending order deleted). */
export async function releaseStock(items: InventoryLine[]): Promise<void> {
  await ensureDatabaseSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const item of sortedLines(items)) {
      if (item.quantity <= 0) continue;
      await client.query(
        `UPDATE product_stock
         SET stock = stock + $2, updated_at = NOW()
         WHERE product_id = $1`,
        [item.productId, item.quantity]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getStockMap(): Promise<Record<string, number>> {
  await ensureDatabaseSchema();
  const result = await getPool().query('SELECT product_id, stock FROM product_stock');
  const map: Record<string, number> = {};
  for (const row of result.rows) {
    map[row.product_id] = Number(row.stock);
  }
  return map;
}

export async function setStock(productId: string, stock: number): Promise<number> {
  await ensureDatabaseSchema();
  const value = Math.max(0, Math.trunc(Number(stock) || 0));
  const result = await getPool().query(
    `INSERT INTO product_stock (product_id, stock)
     VALUES ($1, $2)
     ON CONFLICT (product_id)
     DO UPDATE SET stock = EXCLUDED.stock, updated_at = NOW()
     RETURNING stock`,
    [productId, value]
  );
  return Number(result.rows[0].stock);
}
