const ALLOWED_RETURN_PREFIXES = [
  '/',
  '/products',
  '/product/',
  '/cart',
  '/checkout',
  '/profile',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

const BLOCKED_RETURN_PATHS = new Set(['/login', '/register', '/forgot-password']);

const ALLOWED_PRODUCT_CATEGORIES = new Set([
  'kitchen',
  'folding',
  'collection',
  'hunting',
  'damascus',
  'multitool',
  'edc',
  'tactical',
  'boning',
]);

const BUSINESS_EMAIL = 'rjyy_88@qq.com';

const ALLOWED_MAIL_RECIPIENTS = new Set([
  '845117447@qq.com',
  'rjyy_88@qq.com',
]);

function isSafeRelativePath(value: string) {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !/[\u0000-\u001F\u007F]/.test(value)
  );
}

export function getSafeProductPath(productId: string) {
  const cleanId = String(productId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(cleanId)) {
    return '/products';
  }
  return `/product/${encodeURIComponent(cleanId)}`;
}

export function getSafeCategoryPath(category: string) {
  const cleanCategory = String(category || '').trim().toLowerCase();
  if (!ALLOWED_PRODUCT_CATEGORIES.has(cleanCategory)) {
    return '/products';
  }
  return `/products?category=${encodeURIComponent(cleanCategory)}`;
}

export function getSafeReturnPath(candidate?: string | null) {
  if (!candidate) return null;
  if (!isSafeRelativePath(candidate)) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate, 'https://adamcutlery.com');
  } catch {
    return null;
  }

  if (parsed.origin !== 'https://adamcutlery.com') return null;
  if (BLOCKED_RETURN_PATHS.has(parsed.pathname)) return null;

  const allowed = ALLOWED_RETURN_PREFIXES.some((prefix) => {
    if (prefix === '/') return parsed.pathname === '/';
    return parsed.pathname === prefix || parsed.pathname.startsWith(prefix);
  });

  return allowed ? `${parsed.pathname}${parsed.search}` : null;
}

export function getSafeReturnPathFromBrowser() {
  if (typeof window === 'undefined') return null;

  const nextPath = new URLSearchParams(window.location.search).get('next');
  const safeNext = getSafeReturnPath(nextPath);
  if (safeNext) return safeNext;

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin !== window.location.origin) return null;
    return getSafeReturnPath(`${referrer.pathname}${referrer.search}`);
  } catch {
    return null;
  }
}

export function buildSafeMailtoLink(options: {
  to: string;
  subject: string;
  body: string;
}) {
  const recipient = String(options.to || '').trim().toLowerCase();
  if (!ALLOWED_MAIL_RECIPIENTS.has(recipient)) {
    return `mailto:${BUSINESS_EMAIL}`;
  }

  return `mailto:${recipient}?subject=${encodeURIComponent(options.subject)}&body=${encodeURIComponent(options.body)}`;
}
