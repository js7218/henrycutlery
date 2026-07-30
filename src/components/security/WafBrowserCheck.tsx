'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Ban, Loader2, ShieldCheck } from 'lucide-react';

/**
 * Minimum time the progress bar must animate before showing "passed".
 * Kept low so legitimate browsers never perceive a delay.
 */
const WAF_MIN_CHECK_MS = 200;

/**
 * Grace period before the overlay is shown. If the check completes within
 * this window (which it almost always does for real browsers), the overlay
 * is NEVER rendered, so users see the page — and its animations — immediately.
 */
const WAF_OVERLAY_DELAY_MS = 350;

type CheckState = 'checking' | 'blocked' | 'passed';

interface BrowserSignal {
  name: string;
  score: number;
}

function getWindowFlagScore(): BrowserSignal[] {
  const w = window as Window & {
    webdriver?: unknown;
    _phantom?: unknown;
    callPhantom?: unknown;
    __nightmare?: unknown;
    domAutomation?: unknown;
    domAutomationController?: unknown;
    Buffer?: unknown;
  };

  const signals: BrowserSignal[] = [];
  if (navigator.webdriver || w.webdriver) signals.push({ name: 'webdriver', score: 4 });
  if (w._phantom || w.callPhantom || w.__nightmare) signals.push({ name: 'phantom/nightmare', score: 4 });
  if (w.domAutomation || w.domAutomationController) signals.push({ name: 'dom automation', score: 3 });
  return signals;
}

function getNavigatorScore(): BrowserSignal[] {
  const ua = navigator.userAgent || '';
  const signals: BrowserSignal[] = [];

  if (!ua || ua.length < 8) signals.push({ name: 'empty user agent', score: 3 });
  if (/HeadlessChrome|PhantomJS|Selenium|Playwright|Puppeteer|SlimerJS|Nightmare/i.test(ua)) {
    signals.push({ name: 'automation user agent', score: 5 });
  }
  if (!navigator.languages || navigator.languages.length === 0) {
    signals.push({ name: 'missing languages', score: 2 });
  }
  if (!navigator.language) signals.push({ name: 'missing language', score: 1 });

  const isDesktop = !/Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  if (isDesktop && navigator.plugins && navigator.plugins.length === 0) {
    signals.push({ name: 'desktop without plugins', score: 1 });
  }

  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 1) {
    signals.push({ name: 'low hardware concurrency', score: 1 });
  }

  return signals;
}

function getWebglScore(): BrowserSignal[] {
  const signals: BrowserSignal[] = [];

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      signals.push({ name: 'missing webgl', score: 1 });
      return signals;
    }

    const context = gl as WebGLRenderingContext;
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      const vendor = String(context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '');
      if (/swiftshader|llvmpipe|software|mesa offscreen|virtualbox|vmware/i.test(`${renderer} ${vendor}`)) {
        signals.push({ name: 'software renderer', score: 2 });
      }
    }
  } catch {
    signals.push({ name: 'webgl error', score: 1 });
  }

  return signals;
}

function runCloudflareStyleCheck(): { suspicious: boolean; score: number; signals: BrowserSignal[] } {
  const signals = [
    ...getWindowFlagScore(),
    ...getNavigatorScore(),
    ...getWebglScore(),
  ];
  const score = signals.reduce((sum, item) => sum + item.score, 0);

  return {
    suspicious: score >= 5,
    score,
    signals,
  };
}

const WAF_PASSED_KEY = 'waf_check_passed';

function isWafAlreadyPassed(): boolean {
  try {
    return sessionStorage.getItem(WAF_PASSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function markWafPassed(): void {
  try {
    sessionStorage.setItem(WAF_PASSED_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

export default function WafBrowserCheck({ children }: { children: ReactNode }) {
  // Start with 'checking' on both server and client to avoid hydration mismatch.
  const [state, setState] = useState<CheckState>('checking');
  const [progress, setProgress] = useState(12);
  // Whether the overlay should actually be rendered.  Stays false until
  // WAF_OVERLAY_DELAY_MS has elapsed, so fast-passing browsers never see it.
  const [showOverlay, setShowOverlay] = useState(false);

  const statusText = useMemo(() => {
    if (state === 'blocked') return 'Access blocked. Automated browser or script behavior was detected.';
    if (progress < 35) return 'Checking your browser before accessing Adam Cutlery...';
    if (progress < 65) return 'Verifying that you are not a bot or script...';
    if (progress < 92) return 'Running WAF security challenge...';
    return 'Finalizing security check...';
  }, [progress, state]);

  useEffect(() => {
    // If already passed in this session, skip the check immediately
    if (isWafAlreadyPassed()) {
      setState('passed');
      // Notify any listeners (e.g. GSAP) that the page is visible
      window.dispatchEvent(new CustomEvent('waf-check-passed'));
      return;
    }

    if (state !== 'checking') return;

    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const startedAt = Date.now();

    // Only show the overlay if the check takes longer than the grace period.
    // For legitimate browsers the check finishes in ~50ms, so the overlay
    // is never shown and GSAP animations are visible from the very first frame.
    const overlayTimer = setTimeout(() => {
      if (!stopped && state === 'checking') {
        setShowOverlay(true);
      }
    }, WAF_OVERLAY_DELAY_MS);
    timers.push(overlayTimer);

    // Progress bar only animates if the overlay is visible
    const progressTimer = window.setInterval(() => {
      setProgress(prev => Math.min(96, prev + Math.max(2, Math.round((100 - prev) / 8))));
    }, 80);
    timers.push(progressTimer as unknown as ReturnType<typeof setTimeout>);

    const checkTimer = window.setTimeout(() => {
      if (stopped) return;

      const result = runCloudflareStyleCheck();

      const finishAfterMinimumWait = (nextState: CheckState) => {
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, WAF_MIN_CHECK_MS - elapsed);
        window.setTimeout(() => {
          if (stopped) return;
          setProgress(100);
          window.setTimeout(() => {
            if (!stopped) {
              setState(nextState);
              if (nextState === 'passed') {
                markWafPassed();
                // Notify GSAP / ScrollTrigger to refresh and replay animations
                window.dispatchEvent(new CustomEvent('waf-check-passed'));
              }
            }
          }, 150);
        }, wait);
      };

      if (!result.suspicious) {
        finishAfterMinimumWait('passed');
        return;
      }

      finishAfterMinimumWait('blocked');
    }, 100);

    timers.push(checkTimer as unknown as ReturnType<typeof setTimeout>);

    return () => {
      stopped = true;
      timers.forEach(timer => clearTimeout(timer));
      clearInterval(progressTimer);
    };
  }, [state]);

  // Once passed, render children immediately without any overlay
  if (state === 'passed') return <>{children}</>;

  // While checking: ALWAYS render children directly so React doesn't
  // re-mount them (which would reset animation state in child components).
  // The overlay (if shown) simply covers them on top.
  if (state === 'checking') {
    if (!showOverlay) {
      // Fast path: check will complete within grace period, no overlay needed
      return <>{children}</>;
    }

    // Slow path: overlay is shown ON TOP of children.
    // Children stay in their normal DOM position — no re-mounting.
    return (
      <>
        {children}
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 rounded-xl border border-border bg-surface p-8 shadow-2xl">
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-gold" />
              </div>
            </div>

            <h2 className="text-xl font-semibold text-foreground text-center mb-3">
              Checking your browser
            </h2>
            <p className="text-sm text-gray-400 text-center leading-relaxed mb-6">
              {statusText}
            </p>

            <div className="flex justify-center mb-6">
              <Loader2 className="h-10 w-10 animate-spin text-gold" />
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surfaceLight border border-border">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="text-xs text-gray-500 text-center mt-4">
              This Cloudflare-style WAF check runs before age verification.
            </p>
          </div>
        </div>
      </>
    );
  }

  // Blocked state
  return (
    <>
      {children}
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div className="w-full max-w-md mx-4 rounded-xl border border-border bg-surface p-8 shadow-2xl">
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
              <Ban className="w-8 h-8 text-red-400" />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-foreground text-center mb-3">
            Access Denied
          </h2>
          <p className="text-sm text-gray-400 text-center leading-relaxed mb-6">
            {statusText}
          </p>

          <button
            type="button"
            onClick={() => {
              setProgress(12);
              setState('checking');
            }}
            className="w-full rounded-lg border border-border px-4 py-3 text-sm text-gray-300 hover:border-gold hover:text-gold transition-colors"
          >
            Try again
          </button>

          <p className="text-xs text-gray-500 text-center mt-4">
            This Cloudflare-style WAF check runs before age verification.
          </p>
        </div>
      </div>
    </>
  );
}
