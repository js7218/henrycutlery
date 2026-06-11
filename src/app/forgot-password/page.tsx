'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Phone, ShieldCheck, ArrowLeft } from 'lucide-react';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidPhone(phone: string) {
  return /^[0-9+\-\s()]{6,20}$/.test(phone);
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (!isValidEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!isValidPhone(cleanPhone)) {
      setError('Please enter the phone number used for registration.');
      return;
    }

    setIsLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, phone: cleanPhone }),
      });

      setMessage('If the email and phone match a customer account, reset instructions will be sent by email.');
      setEmail('');
      setPhone('');
    } catch {
      setMessage('If the email and phone match a customer account, reset instructions will be sent by email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gold-gradient" style={{ fontFamily: 'Playfair Display, serif' }}>
            Forgot Password
          </h1>
          <p className="text-gray-400">Enter your registered email and phone number.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-8">
          {error && (
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-400" />
                <p className="text-sm text-green-400">{message}</p>
              </div>
            </div>
          )}

          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="your@email.com"
                maxLength={254}
                autoComplete="email"
                disabled={isLoading}
                className="w-full rounded-lg border border-border bg-surfaceLight py-3 pl-12 pr-4 text-foreground placeholder:text-gray-500 transition-colors focus:border-gold focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          <div className="mb-8">
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Phone used at registration"
                maxLength={20}
                autoComplete="tel"
                disabled={isLoading}
                className="w-full rounded-lg border border-border bg-surfaceLight py-3 pl-12 pr-4 text-foreground placeholder:text-gray-500 transition-colors focus:border-gold focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold py-4 font-medium text-background transition-colors hover:bg-goldLight disabled:opacity-70"
          >
            {isLoading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
            ) : (
              'Send Reset Instructions'
            )}
          </button>

          <Link href="/login" className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-400 transition-colors hover:text-gold">
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </Link>
        </form>
      </div>
    </div>
  );
}
