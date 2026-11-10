import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

/**
 * Short "what this page is for" reminder shown on every admin screen.
 * Staff forget the manual; this keeps the answer one glance (and one click) away.
 */
export default function AdminHint({
  section,
  children,
}: {
  section: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3">
      <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
      <div className="text-sm leading-6 text-gray-200">
        <p>{children}</p>
        <Link
          href={`/hc-control-2026/guide#${section}`}
          className="mt-1 inline-block font-medium text-gold underline underline-offset-4 hover:text-gold/80"
        >
          忘了怎么操作？点这里看这个模块的手册 &rarr;
        </Link>
      </div>
    </div>
  );
}
