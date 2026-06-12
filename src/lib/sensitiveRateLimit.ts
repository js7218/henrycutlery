type SensitiveState = {
  count: number;
  firstAttempt: number;
  lockedUntil: number | null;
  lastAttempt: number;
};

const states = new Map<string, SensitiveState>();

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

export function checkSensitiveAllowed(key: string) {
  const state = states.get(key);
  const now = Date.now();

  if (!state) return { allowed: true };
  if (state.lockedUntil && state.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000),
    };
  }

  if (state.lockedUntil && state.lockedUntil <= now) {
    states.delete(key);
  }

  return { allowed: true };
}

export function recordSensitiveFailure(
  key: string,
  options: { maxFailures: number; windowMs: number; lockMs: number }
) {
  const now = Date.now();
  const current = states.get(key);
  const state =
    current && now - current.firstAttempt <= options.windowMs
      ? current
      : { count: 0, firstAttempt: now, lockedUntil: null, lastAttempt: now };

  state.count += 1;
  state.lastAttempt = now;

  if (state.count >= options.maxFailures) {
    state.lockedUntil = now + options.lockMs;
  }

  states.set(key, state);

  return {
    allowed: !state.lockedUntil,
    attemptsLeft: Math.max(0, options.maxFailures - state.count),
    retryAfterSeconds: state.lockedUntil ? Math.ceil((state.lockedUntil - now) / 1000) : undefined,
  };
}

export function resetSensitiveFailures(key: string) {
  states.delete(key);
}
