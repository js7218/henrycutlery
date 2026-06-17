'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AppProvider } from '@/context/AppContext';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AgeVerification from '@/components/ui/AgeVerification';
import UrlPathHider from '@/components/security/UrlPathHider';

const HumanVerificationGate = dynamic(
  () => import('@/components/security/HumanVerificationGate'),
  { ssr: false }
);
const WafBrowserCheck = dynamic(
  () => import('@/components/security/WafBrowserCheck'),
  { ssr: false }
);

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProvider>
      <Suspense fallback={null}>
        <HumanVerificationGate />
      </Suspense>
      <Suspense fallback={null}>
        <WafBrowserCheck>
          <AgeVerification>
            <UrlPathHider />
            <Header />
            <main className="min-h-screen pt-16 md:pt-20">
              {children}
            </main>
            <Footer />
          </AgeVerification>
        </WafBrowserCheck>
      </Suspense>
    </AppProvider>
  );
}
