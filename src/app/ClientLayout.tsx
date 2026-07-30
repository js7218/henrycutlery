'use client';

import { Suspense } from 'react';
import { AppProvider } from '@/context/AppContext';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AgeVerification from '@/components/ui/AgeVerification';
import UrlPathHider from '@/components/security/UrlPathHider';
import HumanVerificationGate from '@/components/security/HumanVerificationGate';
import WafBrowserCheck from '@/components/security/WafBrowserCheck';
import ChatWidget from '@/components/support/ChatWidget';
import ScrollProgress from '@/components/animation/ScrollProgress';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProvider>
      <ScrollProgress />
      <Suspense fallback={null}>
        <HumanVerificationGate />
      </Suspense>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gold">Loading…</div></div>}>
        <WafBrowserCheck>
          <AgeVerification>
            <UrlPathHider />
            <Header />
            <main className="min-h-screen pt-16 md:pt-20">
              {children}
            </main>
            <Footer />
            <ChatWidget />
          </AgeVerification>
        </WafBrowserCheck>
      </Suspense>
    </AppProvider>
  );
}
