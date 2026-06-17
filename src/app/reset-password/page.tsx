'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Invalid link');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || 'Reset failed');
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 1500);
    } catch {
      setError('Network error, please try again later');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16 bg-background text-textPrimary">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-8 shadow-xl">
        <h1 className="text-2xl font-semibold mb-2">Set New Password</h1>
        <p className="text-sm text-gray-400 mb-6">
          The reset link is valid for 30 minutes and expires immediately after use.
        </p>

        {done ? (
          <p className="text-green-400">Password updated, redirecting to login...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-surfaceLight border border-border rounded-md focus:outline-none focus:border-gold"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2 bg-surfaceLight border border-border rounded-md focus:outline-none focus:border-gold"
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !token}
              className="w-full py-2 rounded-md bg-gold text-black font-medium disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
