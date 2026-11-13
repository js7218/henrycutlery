import Link from 'next/link';
import { unsubscribeByToken } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

/**
 * One-click unsubscribe from the new-arrival emails. The token is unique per
 * subscriber and is included in every marketing email.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params?.token === 'string' ? params.token : '';
  let ok = false;
  try {
    ok = await unsubscribeByToken(token);
  } catch {
    ok = false;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>
        {ok ? 'You are unsubscribed' : 'Link not valid'}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-gray-300">
        {ok
          ? 'We removed this address from the new-arrival list. You will still receive order and shipping emails for any order you place.'
          : 'This unsubscribe link is invalid or has already been used. If you keep receiving emails you do not want, reply to one of them and we will remove you.'}
      </p>
      <Link href="/" className="mt-8 inline-block text-sm font-semibold text-gold underline">
        Back to the shop
      </Link>
    </div>
  );
}
