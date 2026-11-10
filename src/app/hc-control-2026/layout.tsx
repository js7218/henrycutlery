import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin screens are intentionally excluded from browser translation.
 * Machine translation rewrites the DOM that React owns, which both garbles
 * the labels and can throw "removeChild" errors while editing inputs.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div translate="no" className="notranslate">
      {children}
    </div>
  );
}
