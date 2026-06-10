'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

const WAF_PASS_MS = 30 * 60 * 1000;
const WAF_PASS_KEY = 'waf_browser_verified_until';
const HUMAN_PASS_KEY = 'human_verified_until';

type CheckState = 'checking' | 'challenge' | 'passed';

interface BrowserSignal {
  name: string;
  score: number;
}

function now() {
  return Date.now();
}

function readStoredUntil(key: string): number {
  if (typeof window === 'undefined') return 0;
  const value = Number(localStorage.getItem(key) || '0');
  return Number.isFinite(value) ? value : 0;
}

function markWafPassed() {
  localStorage.setItem(WAF_PASS_KEY, String(now() + WAF_PASS_MS));
}

function hasFreshWafPass() {
  return readStoredUntil(WAF_PASS_KEY) > now();
}

function hasFreshHumanPass() {
  return readStoredUntil(HUMAN_PASS_KEY) > now();
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

function triggerHumanVerification() {
  localStorage.setItem('human_verification_required', 'true');
  window.dispatchEvent(new Event('human-verification-required'));
}

export default function WafBrowserCheck({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CheckState>(() => (typeof window !== 'undefined' && hasFreshWafPass() ? 'passed' : 'checking'));
  const [progress, setProgress] = useState(12);
  const statusText = useMemo(() => {
    if (state === 'challenge') return 'Please complete human verification to continue.';
    if (progress < 45) return 'Checking your browser before accessing Adam Cutlery...';
    if (progress < 80) return 'Verifying secure browser signals...';
    return 'Finalizing security check...';
  }, [progress, state]);

  useEffect(() => {
    if (state === 'passed') return;

    if (hasFreshWafPass()) {
      setState('passed');
      return;
    }

    let stopped = false;
    const timers: number[] = [];

    const progressTimer = window.setInterval(() => {
      setProgress(prev => Math.min(96, prev + Math.max(2, Math.round((100 - prev) / 8))));
    }, 180);

    timers.push(progressTimer);

    const checkTimer = window.setTimeout(() => {
      if (stopped) return;

      const result = runCloudflareStyleCheck();
      if (!result.suspicious) {
        markWafPassed();
        setProgress(100);
        window.setTimeout(() => {
          if (!stopped) setState('passed');
        }, 250);
        return;
      }

      triggerHumanVerification();
      setState('challenge');
    }, 900);

    timers.push(checkTimer);

    const humanPassTimer = window.setInterval(() => {
      if (hasFreshHumanPass()) {
        markWafPassed();
        setProgress(100);
        setState('passed');
      }
    }, 500);

    timers.push(humanPassTimer);

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
            <ShieldCheck className="w-8 h-8 text-gold" />
          </div>
        </div>

        <h2 className="text-xl font-semibold text-foreground text-center mb-3">
          Security Check
        </h2>
        <p className="text-sm text-gray-400 text-center leading-relaxed mb-6">
          {statusText}
        </p>

        <div className="h-2 w-full overflow-hidden rounded-full bg-surfaceLight border border-border">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          This automatic WAF check runs before age verification.
        </p>
      </div>
    </div>
  );
}
