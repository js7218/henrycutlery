const URL_LIKE_PATTERN = /(?:https?:|ftp:|file:|gopher:|dict:|ldap:|sftp:|tftp:|data:|jar:|netdoc:|php:|expect:|\/\/)/i;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
  'kubernetes.default.svc',
]);

const BLOCKED_EXACT_IPS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '169.254.169.254',
  '255.255.255.255',
]);

function decodeRepeatedly(value: string): string {
  let decoded = value.trim();

  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded;
}

function isPrivateIPv4(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').trim();
  const parts = normalized.split('.');

  if (parts.length !== 4) return false;

  const numbers = parts.map(part => Number(part));
  if (numbers.some(num => !Number.isInteger(num) || num < 0 || num > 255)) return false;

  const [a, b] = numbers;

  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isUnsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');

  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_EXACT_IPS.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return true;
  if (host === '::1' || host.startsWith('::ffff:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  if (isPrivateIPv4(host)) return true;

  return false;
}

export function isUnsafeUrl(value: string): boolean {
  const decoded = decodeRepeatedly(value);

  if (!URL_LIKE_PATTERN.test(decoded)) return false;

  try {
    const url = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded);
    const protocol = url.protocol.toLowerCase();

    if (protocol !== 'http:' && protocol !== 'https:') return true;

    if (url.username || url.password) return true;

    return isUnsafeHostname(url.hostname);
  } catch {
    return URL_LIKE_PATTERN.test(decoded);
  }
}

export function findUnsafeUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    return isUnsafeUrl(value) ? value : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const unsafe = findUnsafeUrl(item);
      if (unsafe) return unsafe;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const unsafe = findUnsafeUrl(item);
      if (unsafe) return unsafe;
    }
  }

  return null;
}
