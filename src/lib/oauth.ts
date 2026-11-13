/**
 * OAuth 2.0 authorization-code helpers for the social sign-in providers.
 * Providers are only offered when their credentials are present in the env.
 */

import { createHash, createSign, randomBytes } from 'crypto';

export type OAuthProviderId =
  | 'google'
  | 'apple'
  | 'github'
  | 'microsoft'
  | 'facebook'
  | 'x'
  | 'vercel'
  | 'qq'
  | 'wechat';

export interface OAuthProvider {
  id: OAuthProviderId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientIdEnv: string;
  /** Env vars that must all be present for the provider to be usable. */
  credentialEnvs: string[];
  pkce: boolean;
  extraAuthorizeParams?: Record<string, string>;
}

export interface OAuthProfile {
  subject: string;
  /** Empty string when the provider did not return an email. */
  email: string;
  name: string;
  avatar: string;
}

const REQUEST_TIMEOUT_MS = 10000;

export const OAUTH_PROVIDERS: OAuthProvider[] = [
  {
    id: 'google',
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    credentialEnvs: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    pkce: true,
  },
  {
    id: 'apple',
    label: 'Apple',
    authorizeUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    userInfoUrl: '',
    scope: 'name email',
    clientIdEnv: 'APPLE_CLIENT_ID',
    // The "secret" is an ES256 JWT built from the .p8 key.
    credentialEnvs: ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'],
    pkce: true,
    // Apple only returns the authorization code through a form POST when a
    // name/email scope is requested.
    extraAuthorizeParams: { response_mode: 'form_post' },
  },
  {
    id: 'github',
    label: 'GitHub',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    clientIdEnv: 'GITHUB_CLIENT_ID',
    credentialEnvs: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    pkce: false,
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
    scope: 'openid email profile User.Read',
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    credentialEnvs: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    pkce: true,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,email,picture.type(large)',
    scope: 'email public_profile',
    clientIdEnv: 'FACEBOOK_CLIENT_ID',
    credentialEnvs: ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET'],
    pkce: false,
  },
  {
    id: 'x',
    label: 'X',
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    userInfoUrl: 'https://api.twitter.com/2/users/me?user.fields=profile_image_url',
    scope: 'users.read tweet.read offline.access',
    clientIdEnv: 'X_CLIENT_ID',
    credentialEnvs: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    pkce: true,
  },
  {
    id: 'vercel',
    label: 'Vercel',
    authorizeUrl: 'https://vercel.com/oauth/authorize',
    tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
    userInfoUrl: 'https://api.vercel.com/v2/user',
    scope: 'openid email profile',
    clientIdEnv: 'VERCEL_CLIENT_ID',
    credentialEnvs: ['VERCEL_CLIENT_ID', 'VERCEL_CLIENT_SECRET'],
    pkce: false,
  },
  {
    id: 'qq',
    label: 'QQ',
    authorizeUrl: 'https://graph.qq.com/oauth2.0/authorize',
    tokenUrl: 'https://graph.qq.com/oauth2.0/token',
    userInfoUrl: 'https://graph.qq.com/user/get_user_info',
    scope: 'get_user_info',
    clientIdEnv: 'QQ_APP_ID',
    credentialEnvs: ['QQ_APP_ID', 'QQ_APP_KEY'],
    pkce: false,
  },
  {
    id: 'wechat',
    label: 'WeChat',
    authorizeUrl: 'https://open.weixin.qq.com/connect/qrconnect',
    tokenUrl: 'https://api.weixin.qq.com/sns/oauth2/access_token',
    userInfoUrl: 'https://api.weixin.qq.com/sns/userinfo',
    scope: 'snsapi_login',
    clientIdEnv: 'WECHAT_APP_ID',
    credentialEnvs: ['WECHAT_APP_ID', 'WECHAT_APP_SECRET'],
    pkce: false,
  },
];

const PROVIDER_MAP = new Map<string, OAuthProvider>(OAUTH_PROVIDERS.map((p) => [p.id, p]));

function readEnv(name: string): string {
  return (process.env[name] || '').trim();
}

export function getProvider(id: string): OAuthProvider | null {
  return PROVIDER_MAP.get(id) || null;
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  return provider.credentialEnvs.every((name) => readEnv(name).length > 0);
}

export function getConfiguredProviders(): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter(isProviderConfigured);
}

export function getOrigin(request: Request): string {
  const configured = readEnv('NEXT_PUBLIC_SITE_URL');
  if (configured) return configured.replace(/\/+$/, '');
  return new URL(request.url).origin;
}

export function getRedirectUri(providerId: string, origin: string): string {
  return `${origin}/api/auth/oauth/${providerId}/callback`;
}

// ---------------------------------------------------------------------------
// CSRF / PKCE helpers
// ---------------------------------------------------------------------------

export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function oauthCookieNames(providerId: string) {
  return {
    state: `oauth_state_${providerId}`,
    verifier: `oauth_verifier_${providerId}`,
    next: `oauth_next_${providerId}`,
  };
}

/** Same-site relative path only (no protocol-relative or absolute URLs). */
export function isSafeNextPath(value: string | null | undefined): value is string {
  if (!value || value.length > 512) return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  return !/[\u0000-\u001F\u007F]/.test(value);
}

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(
  provider: OAuthProvider,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const url = new URL(provider.authorizeUrl);
  const clientId = readEnv(provider.clientIdEnv);
  const params = url.searchParams;

  if (provider.id === 'wechat') {
    params.set('appid', clientId);
  } else {
    params.set('client_id', clientId);
  }

  params.set('redirect_uri', redirectUri);
  params.set('response_type', 'code');
  params.set('scope', provider.scope);
  params.set('state', state);

  if (provider.pkce) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  if (provider.extraAuthorizeParams) {
    for (const [key, value] of Object.entries(provider.extraAuthorizeParams)) {
      params.set(key, value);
    }
  }

  if (provider.id === 'wechat') {
    // WeChat's QR flow appends a fragment instead of a normal query param.
    url.hash = 'wechat_redirect';
  }

  return url.toString();
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** ES256-signed client secret required by Sign in with Apple. */
function createAppleClientSecret(): string {
  const privateKey = readEnv('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const teamId = readEnv('APPLE_TEAM_ID');
  const keyId = readEnv('APPLE_KEY_ID');
  const clientId = readEnv('APPLE_CLIENT_ID');

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 300,
      aud: 'https://appleid.apple.com',
      sub: clientId,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign('sha256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function getClientSecret(provider: OAuthProvider): string {
  if (provider.id === 'apple') return createAppleClientSecret();
  return readEnv(provider.credentialEnvs[provider.credentialEnvs.length - 1]);
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  const text = await response.text();

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // QQ answers the token endpoint with a query string rather than JSON.
    data = Object.fromEntries(new URLSearchParams(text));
  }

  if (!response.ok) {
    const message = typeof data.error_description === 'string' ? data.error_description : 'request failed';
    throw new Error(`OAuth request failed (${response.status}): ${message}`);
  }
  return data;
}

/**
 * Exchanges the authorization code for a credential.
 * For Apple the returned string is the id_token, which carries the profile.
 */
export async function exchangeCode(
  providerId: string,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<string> {
  const provider = getProvider(providerId);
  if (!provider) throw new Error('Unknown OAuth provider');
  if (!isProviderConfigured(provider)) throw new Error('OAuth provider is not configured');

  const clientId = readEnv(provider.clientIdEnv);
  const clientSecret = getClientSecret(provider);

  if (provider.id === 'wechat') {
    const url = new URL(provider.tokenUrl);
    url.searchParams.set('appid', clientId);
    url.searchParams.set('secret', clientSecret);
    url.searchParams.set('code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    const data = await requestJson(url.toString());
    if (typeof data.access_token !== 'string') throw new Error('WeChat did not return an access token');
    return encodeWeChatToken(data.access_token, str(data.openid));
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (provider.pkce && codeVerifier) body.set('code_verifier', codeVerifier);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  // X treats the app as confidential: client credentials go in Basic auth.
  if (provider.id === 'x') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const data = await requestJson(provider.tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  if (provider.id === 'apple') {
    if (typeof data.id_token !== 'string') throw new Error('Apple did not return an id_token');
    return data.id_token;
  }

  if (typeof data.access_token !== 'string') throw new Error('Provider did not return an access token');
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Profile fetching
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('Malformed token');
  const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function fetchGitHubProfile(accessToken: string): Promise<OAuthProfile> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' };
  const me = await requestJson('https://api.github.com/user', { headers });

  let email = str(me.email);
  if (!email) {
    // A user with a private email needs the dedicated emails endpoint.
    try {
      const emails = await requestJson('https://api.github.com/user/emails', { headers });
      const list = parseGithubEmails(emails);
      const preferred = list.find((item) => item.primary && item.verified) || list.find((item) => item.verified);
      email = preferred?.email || '';
    } catch {
      email = '';
    }
  }

  const subject = String(me.id ?? '');
  if (!subject) throw new Error('GitHub profile is missing an id');
  return {
    subject,
    email,
    name: str(me.name) || str(me.login),
    avatar: str(me.avatar_url),
  };
}

function parseGithubEmails(value: unknown): Array<{ email: string; primary: boolean; verified: boolean }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      email: str(item.email),
      primary: item.primary === true,
      verified: item.verified === true,
    }));
}

async function fetchQQProfile(accessToken: string): Promise<OAuthProfile> {
  const appId = readEnv('QQ_APP_ID');
  const meUrl = new URL('https://graph.qq.com/oauth2.0/me');
  meUrl.searchParams.set('access_token', accessToken);
  const meText = await (
    await fetch(meUrl.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: 'no-store' })
  ).text();

  // QQ wraps the payload in a JSONP callback: callback( {"openid":"..."} );
  const jsonText = meText.replace(/^[^(]*\(/, '').replace(/\)\s*;?\s*$/, '');
  const me = JSON.parse(jsonText) as Record<string, unknown>;
  const openid = str(me.openid);
  if (!openid) throw new Error('QQ profile is missing an openid');

  const infoUrl = new URL('https://graph.qq.com/user/get_user_info');
  infoUrl.searchParams.set('access_token', accessToken);
  infoUrl.searchParams.set('oauth_consumer_key', appId);
  infoUrl.searchParams.set('openid', openid);
  infoUrl.searchParams.set('format', 'json');
  const info = await requestJson(infoUrl.toString());

  return {
    subject: openid,
    email: `${openid}@qq.oauth.local`,
    name: str(info.nickname) || `QQ ${openid.slice(0, 8)}`,
    avatar: str(info.figureurl_qq_2) || str(info.figureurl_qq_1),
  };
}

async function fetchWeChatProfile(accessToken: string, openidHint: string): Promise<OAuthProfile> {
  const url = new URL('https://api.weixin.qq.com/sns/userinfo');
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('openid', openidHint);
  const info = await requestJson(url.toString());

  const openid = str(info.openid) || openidHint;
  if (!openid) throw new Error('WeChat profile is missing an openid');
  return {
    subject: openid,
    email: `${openid}@wechat.oauth.local`,
    name: str(info.nickname) || `WeChat ${openid.slice(0, 8)}`,
    avatar: str(info.headimgurl),
  };
}

export async function fetchProfile(providerId: string, accessToken: string): Promise<OAuthProfile> {
  const provider = getProvider(providerId);
  if (!provider) throw new Error('Unknown OAuth provider');

  switch (provider.id) {
    case 'apple': {
      // The id_token payload is the only source of the stable subject.
      const payload = decodeJwtPayload(accessToken);
      const subject = str(payload.sub);
      if (!subject) throw new Error('Apple profile is missing a subject');
      const email = str(payload.email);
      return {
        subject,
        email,
        name: email ? email.split('@')[0] : 'Apple user',
        avatar: '',
      };
    }
    case 'github':
      return fetchGitHubProfile(accessToken);
    case 'qq':
      return fetchQQProfile(accessToken);
    case 'wechat': {
      // The openid is returned alongside the token and is reused here as the
      // userinfo lookup key; it is also the stable subject.
      const separator = accessToken.indexOf('|');
      const rawToken = separator >= 0 ? accessToken.slice(0, separator) : accessToken;
      const openid = separator >= 0 ? accessToken.slice(separator + 1) : '';
      return fetchWeChatProfile(rawToken, openid);
    }
    case 'google': {
      const me = await requestJson(provider.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return {
        subject: str(me.sub),
        email: str(me.email),
        name: str(me.name) || str(me.email).split('@')[0],
        avatar: str(me.picture),
      };
    }
    case 'microsoft': {
      const me = await requestJson(provider.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return {
        subject: str(me.id),
        email: str(me.mail) || str(me.userPrincipalName),
        name: str(me.displayName) || str(me.mail).split('@')[0],
        avatar: '',
      };
    }
    case 'facebook': {
      const me = await requestJson(provider.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const picture = me.picture as { data?: { url?: string } } | undefined;
      return {
        subject: str(me.id),
        email: str(me.email),
        name: str(me.name),
        avatar: str(picture?.data?.url),
      };
    }
    case 'x': {
      const payload = await requestJson(provider.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const me = (payload.data || {}) as Record<string, unknown>;
      const id = str(me.id);
      if (!id) throw new Error('X profile is missing an id');
      return {
        subject: id,
        email: `${id}@x.oauth.local`,
        name: str(me.name) || str(me.username),
        avatar: str(me.profile_image_url).replace('_normal', '_400x400'),
      };
    }
    case 'vercel': {
      const payload = await requestJson(provider.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const me = (payload.user || payload) as Record<string, unknown>;
      const id = String(me.id ?? '');
      if (!id) throw new Error('Vercel profile is missing an id');
      return {
        subject: id,
        email: str(me.email),
        name: str(me.name) || str(me.username),
        avatar: str(me.avatar),
      };
    }
    default:
      throw new Error('Unsupported OAuth provider');
  }
}

/**
 * WeChat's userinfo call needs the openid from the token response. The token is
 * carried as `${access_token}|${openid}` so exchangeCode can stay a single
 * string while fetchProfile still has everything it needs.
 */
export function encodeWeChatToken(accessToken: string, openid: string): string {
  return `${accessToken}|${openid}`;
}
