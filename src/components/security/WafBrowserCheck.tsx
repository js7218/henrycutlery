'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Ban, Loader2, ShieldCheck } from 'lucide-react';

const WAF_MIN_CHECK_MS = 800;

type CheckState = 'checking' | 'blocked' | 'passed';

interface BrowserSignal {
  name: string;
  score: number;
}

function now() {
  return Date.now();
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
  const [state, setState] = useState<CheckState>(() => isWafAlreadyPassed() ? 'passed' : 'checking');
  const [progress, setProgress] = useState(12);
  const statusText = useMemo(() => {
    if (state === 'blocked') return 'Access blocked. Automated browser or script behavior was detected.';
    if (progress < 35) return 'Checking your browser before accessing Adam Cutlery...';
    if (progress < 65) return 'Verifying that you are not a bot or script...';
    if (progress < 92) return 'Running WAF security challenge...';
    return 'Finalizing security check...';
  }, [progress, state]);

  useEffect(() => {
    if (state !== 'checking') return;

    let stopped = false;
    const timers: number[] = [];
    const startedAt = now();

    const progressTimer = window.setInterval(() => {
      setProgress(prev => Math.min(96, prev + Math.max(2, Math.round((100 - prev) / 8))));
    }, 80);

    timers.push(progressTimer);

    const checkTimer = window.setTimeout(() => {
      if (stopped) return;

      const result = runCloudflareStyleCheck();

      const finishAfterMinimumWait = (nextState: CheckState) => {
        const elapsed = now() - startedAt;
        const wait = Math.max(0, WAF_MIN_CHECK_MS - elapsed);
        window.setTimeout(() => {
          if (stopped) return;
          setProgress(100);
          window.setTimeout(() => {
            if (!stopped) setState(nextState);
          }, 250);
        }, wait);
      };

      if (!result.suspicious) {
        finishAfterMinimumWait('passed');
        markWafPassed();
        return;
      }

      finishAfterMinimumWait('blocked');
    }, 200);

    timers.push(checkTimer);

    return () => {
      stopped = true;
      timers.forEach(timer => window.clearInterval(timer));
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [state]);

  if (state === 'passed') return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl border border-border bg-surface p-8 shadow-2xl">
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
            {state === 'blocked' ? (
              <Ban className="w-8 h-8 text-red-400" />
            ) : (
              <ShieldCheck className="w-8 h-8 text-gold" />
            )}
          </div>
        </div>

        <h2 className="text-xl font-semibold text-foreground text-center mb-3">
          {state === 'blocked' ? 'Access Denied' : 'Checking your browser'}
        </h2>
        <p className="text-sm text-gray-400 text-center leading-relaxed mb-6">
          {statusText}
        </p>

        {state === 'checking' ? (
          <>
            <div className="flex justify-center mb-6">
              <Loader2 className="h-10 w-10 animate-spin text-gold" />
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surfaceLight border border-border">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        ) : (
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
        )}

        <p className="text-xs text-gray-500 text-center mt-4">
          This Cloudflare-style WAF check runs before age verification.
        </p>
      </div>
    </div>
  );
}
