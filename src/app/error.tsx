'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-foreground mb-3">Something went wrong</h1>
        <p className="text-gray-400 mb-6">
          This page hit an unexpected error. Your cart is saved — try again, or go back to the shop.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-3 rounded-lg bg-gold text-black font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/products"
            className="px-5 py-3 rounded-lg border border-border text-gray-300 hover:text-foreground transition-colors"
          >
            Continue shopping
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-gray-600">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
