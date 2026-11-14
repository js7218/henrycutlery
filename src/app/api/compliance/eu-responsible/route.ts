import { NextResponse } from 'next/server';

/**
 * GET /api/compliance/eu-responsible
 *
 * GPSR (EU 2023/988, in force since 13 Dec 2024) requires a responsible person
 * established in the EU to be named on the product information shown to buyers.
 * The details are configuration, not secrets, so they are read from env vars and
 * exposed publicly. When they are missing the checkout says so instead of
 * inventing an address.
 */
export async function GET() {
  const name = process.env.EU_RESPONSIBLE_NAME?.trim() || '';
  const address = process.env.EU_RESPONSIBLE_ADDRESS?.trim() || '';
  const email = process.env.EU_RESPONSIBLE_EMAIL?.trim() || '';

  return NextResponse.json(
    {
      success: true,
      configured: Boolean(name && address),
      name,
      address,
      email,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
