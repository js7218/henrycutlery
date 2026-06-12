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
      setError('链接无效');
      return;
    }
    if (password.length < 8) {
      setError('密码至少 8 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的新密码不一致');
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
        setError(data.error || '重置失败');
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 1500);
    } catch {
      setError('网络错误，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16 bg-background text-textPrimary">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-8 shadow-xl">
        <h1 className="text-2xl font-semibold mb-2">设置新密码</h1>
        <p className="text-sm text-gray-400 mb-6">
          重置链接 30 分钟内有效，使用后立即失效。
        </p>

        {done ? (
          <p className="text-green-400">密码已更新，正在跳转到登录页...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">新密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-surfaceLight border border-border rounded-md focus:outline-none focus:border-gold"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">确认新密码</label>
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
              {submitting ? '提交中...' : '更新密码'}
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
