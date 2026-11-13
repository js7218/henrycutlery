import { NextResponse } from 'next/server';
import { getConfiguredProviders, type OAuthProviderId } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

const DEFAULT_ORDER: OAuthProviderId[] = [
  'google',
  'apple',
  'microsoft',
  'github',
  'facebook',
  'x',
  'vercel',
  'qq',
  'wechat',
];

// Chinese customers recognise WeChat/QQ first; the global providers follow.
const CN_ORDER: OAuthProviderId[] = [
  'wechat',
  'qq',
  'google',
  'apple',
  'microsoft',
  'github',
  'facebook',
  'x',
  'vercel',
];

export async function GET(request: Request) {
  const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
  const order = country === 'CN' ? CN_ORDER : DEFAULT_ORDER;

  const providerById = new Map(getConfiguredProviders().map((provider) => [provider.id, provider]));
  const providers = order
    .filter((id) => providerById.has(id))
    .map((id) => {
      const provider = providerById.get(id)!;
      return { id: provider.id, label: provider.label };
    });

  const response = NextResponse.json({ success: true, country, providers });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
