type AttemptState = {
  count: number;
  firstAttempt: number;
  lockedUntil: number | null;
  timestamps: number[];
};

const WINDOW_MS = 10 * 60 * 1000;
const NORMAL_LOCK_MS = 10 * 60 * 1000;
const BOT_LOCK_MS = 60 * 60 * 1000;
const MAX_FAILURES = 5;

const attempts = new Map<string, AttemptState>();

export function getClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwarded ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

function getState(key: string): AttemptState {
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || now - current.firstAttempt > WINDOW_MS) {
    const fresh = { count: 0, firstAttempt: now, lockedUntil: null, timestamps: [] };
    attempts.set(key, fresh);
    return fresh;
  }

  if (current.lockedUntil && now >= current.lockedUntil) {
    current.count = 0;
    current.firstAttempt = now;
    current.lockedUntil = null;
    current.timestamps = [];
  }

  return current;
}

function looksAutomated(timestamps: number[]) {
  if (timestamps.length < 5) return false;

  const recent = timestamps.slice(-5);
  const gaps: number[] = [];
  let veryFast = 0;

  for (let i = 1; i < recent.length; i++) {
    const gap = recent[i] - recent[i - 1];
    gaps.push(gap);
    if (gap < 700) veryFast++;
  }

  const avg = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avg, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);

  return veryFast >= 2 || (avg >= 1000 && avg <= 15000 && stdDev < 300);
}

export function checkAuthAllowed(key: string) {
  const state = getState(key);
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    return {
      allowed: false,
      lockedUntil: state.lockedUntil,
      retryAfterSeconds: Math.ceil((state.lockedUntil - Date.now()) / 1000),
    };
  }

  return { allowed: true };
}

export function recordAuthFailure(key: string) {
  const state = getState(key);
  const now = Date.now();

  state.count += 1;
  state.timestamps.push(now);
  state.timestamps = state.timestamps.slice(-10);

  if (state.count >= MAX_FAILURES) {
    const automated = looksAutomated(state.timestamps);
    state.lockedUntil = now + (automated ? BOT_LOCK_MS : NORMAL_LOCK_MS);
    return {
      allowed: false,
      lockedUntil: state.lockedUntil,
      retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000),
      reason: automated ? 'AUTOMATED_AUTH_ATTEMPT' : 'TOO_MANY_AUTH_FAILURES',
    };
  }

  return {
    allowed: true,
    attemptsLeft: MAX_FAILURES - state.count,
  };
}

export function resetAuthFailures(key: string) {
  attempts.delete(key);
}
