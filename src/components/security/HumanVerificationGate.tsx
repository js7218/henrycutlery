'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

const HOLD_DURATION_MS = 1800;
const VISIT_LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;
const VERIFIED_MS = 30 * 60 * 1000;

interface VisitRecord {
  count: number;
  firstSeen: number;
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearChallengeCookie() {
  document.cookie = 'human_verification_required=; Max-Age=0; path=/; SameSite=Lax';
}

function setVerifiedCookie(expiresAt: number) {
  document.cookie = `human_verified_until=${expiresAt}; Max-Age=${Math.floor(VERIFIED_MS / 1000)}; path=/; SameSite=Lax`;
}

function isRecentlyVerified(): boolean {
  const verifiedUntil = Number(localStorage.getItem('human_verified_until') || '0');
  return Number.isFinite(verifiedUntil) && verifiedUntil > Date.now();
}

export default function HumanVerificationGate() {
  const pathname = usePathname();
  const [showChallenge, setShowChallenge] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdStartedAt = useRef(0);
  const rafId = useRef<number | null>(null);

  const requireChallenge = useCallback(() => {
    if (!isRecentlyVerified()) {
      localStorage.setItem('human_verification_required', 'true');
      setShowChallenge(true);
    }
  }, []);

  useEffect(() => {
    const routeKey = pathname || '/';
    const storageKey = `human_visit_${routeKey}`;
    const now = Date.now();
    const raw = localStorage.getItem(storageKey);
    let record: VisitRecord = { count: 0, firstSeen: now };

    if (raw) {
      try {
        record = JSON.parse(raw) as VisitRecord;
      } catch {
        record = { count: 0, firstSeen: now };
      }
    }

    if (now - record.firstSeen > WINDOW_MS) {
      record = { count: 0, firstSeen: now };
    }

    record.count += 1;
    localStorage.setItem(storageKey, JSON.stringify(record));

    if (record.count > VISIT_LIMIT) {
      requireChallenge();
    }
  }, [pathname, requireChallenge]);

  useEffect(() => {
    const checkChallenge = () => {
      if (
        readCookie('human_verification_required') === '1' ||
        localStorage.getItem('human_verification_required') === 'true'
      ) {
        requireChallenge();
      }
    };

    checkChallenge();
    window.addEventListener('human-verification-required', checkChallenge);
    const interval = window.setInterval(checkChallenge, 1500);

    return () => {
      window.removeEventListener('human-verification-required', checkChallenge);
      window.clearInterval(interval);
    };
  }, [requireChallenge]);

  const finishVerification = () => {
    const verifiedUntil = Date.now() + VERIFIED_MS;
    localStorage.setItem('human_verified_until', String(verifiedUntil));
    localStorage.removeItem('human_verification_required');
    setVerifiedCookie(verifiedUntil);
    clearChallengeCookie();
    setShowChallenge(false);
    setProgress(0);
  };

  const stopHold = () => {
    holdStartedAt.current = 0;
    setProgress(0);
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  };

  const startHold = () => {
    holdStartedAt.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - holdStartedAt.current;
      const nextProgress = Math.min(100, Math.round((elapsed / HOLD_DURATION_MS) * 100));
      setProgress(nextProgress);

      if (nextProgress >= 100) {
        stopHold();
        finishVerification();
        return;
      }

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
  };

  if (!showChallenge) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl border border-border bg-surface p-8 shadow-2xl">
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-gold" />
          </div>
        </div>

        <h2 className="text-xl font-semibold text-foreground text-center mb-3">
          Human Verification
        </h2>
        <p className="text-sm text-gray-400 text-center leading-relaxed mb-6">
          We detected repeated access to the same page or login area.
          <br />
          Press and hold the button to continue.
        </p>

        <button
          type="button"
          onMouseDown={startHold}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={startHold}
          onTouchEnd={stopHold}
          className="relative w-full overflow-hidden rounded-lg border border-gold/60 px-6 py-4 text-gold font-medium select-none"
        >
          <span
            className="absolute inset-y-0 left-0 bg-gold/20 transition-[width]"
            style={{ width: `${progress}%` }}
          />
          <span className="relative">Press and hold to verify</span>
        </button>

        <p className="text-xs text-gray-500 text-center mt-4">
          Progress: {progress}%
        </p>
      </div>
    </div>
  );
}
