import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  getOrigin,
  getProvider,
  getRedirectUri,
  isProviderConfigured,
  isSafeNextPath,
  oauthCookieNames,
} from '@/lib/oauth';

export const dynamic = 'force-dynamic';

const COOKIE_MAX_AGE = 10 * 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await context.params;
  const provider = getProvider(providerId);

  if (!provider || !isProviderConfigured(provider)) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
  }

  const nextParam = new URL(request.url).searchParams.get('next');
  const nextPath = isSafeNextPath(nextParam) ? nextParam : '/profile';

  const state = generateState();
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const origin = getOrigin(request);
  const redirectUri = getRedirectUri(provider.id, origin);

  const cookieStore = await cookies();
  const names = oauthCookieNames(provider.id);
  const options = {
    httpOnly: true,
    // Apple delivers the callback as a cross-site form POST, where a Lax
    // cookie would not be sent; None (with Secure) keeps the state check valid.
    secure: provider.id === 'apple' || process.env.NODE_ENV === 'production',
    sameSite: provider.id === 'apple' ? ('none' as const) : ('lax' as const),
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };

  cookieStore.set(names.state, state, options);
  cookieStore.set(names.verifier, verifier, options);
  cookieStore.set(names.next, nextPath, options);

  const authorizeUrl = buildAuthorizeUrl(provider, redirectUri, state, challenge);
  return NextResponse.redirect(authorizeUrl);
}
