'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const DISMISS_KEY = 'ac_marketing_prompt_dismissed';

/**
 * First-visit opt-in for new-arrival emails. Asking on the spot (instead of
 * hiding a newsletter link in the footer) is the only way most customers will
 * ever see it. Declining or closing is remembered locally, so nobody is asked
 * twice on the same device.
 */
export default function MarketingConsentBanner() {
  const { state } = useApp();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (pathname?.startsWith('/hc-control-2026')) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // Private mode with storage disabled: show once per page load.
    }
    // Give the page a moment so the prompt does not fight with the first paint.
    const timer = window.setTimeout(() => setVisible(true), 2500);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (state.user?.email && !email) setEmail(state.user.email);
  }, [state.user?.email, email]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore storage failures.
    }
  };

  const subscribe = async () => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }
    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/marketing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, consent: true, source: 'popup' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setStatus('error');
        setMessage(data?.error || 'Could not save your email. Please try again.');
        return;
      }
      setStatus('done');
      setMessage(data?.message || 'Thanks — you are on the list.');
      try {
        window.localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        // Ignore storage failures.
      }
      window.setTimeout(() => setVisible(false), 4000);
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="marketing-title"
        className="relative w-full max-w-[440px] rounded-xl border border-gold/40 bg-surface p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-gray-400 hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {status === 'done' ? (
          <div className="pr-6">
            <h2 id="marketing-title" className="text-lg font-semibold text-foreground">
              You are on the list
            </h2>
            <p className="mt-2 text-sm text-gray-300">{message}</p>
          </div>
        ) : (
          <>
            <h2 id="marketing-title" className="pr-6 text-lg font-semibold text-foreground">
              Want to hear about new knives?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              We email when a new product lands — nothing else, never more than once per product.
            </p>
            <label htmlFor="marketing-email" className="mt-4 block text-sm font-medium text-foreground">
              Your email
            </label>
            <input
              id="marketing-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (status === 'error') {
                  setStatus('idle');
                  setMessage('');
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void subscribe();
              }}
              placeholder="you@company.com"
              className="mt-1 w-full rounded-lg border border-border bg-surfaceLight px-3 py-3 text-base text-foreground placeholder:text-gray-500 focus:border-gold focus:outline-none"
            />
            {status === 'error' && message ? (
              <p className="mt-2 text-sm text-red-400">{message}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void subscribe()}
                disabled={status === 'sending'}
                className="min-h-[46px] flex-1 rounded-lg bg-gold px-4 text-base font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {status === 'sending' ? 'Saving…' : 'Yes, email me'}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="min-h-[46px] rounded-lg border border-border px-4 text-base text-gray-300 hover:text-foreground"
              >
                Not now
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              You can unsubscribe at any time from any email.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
