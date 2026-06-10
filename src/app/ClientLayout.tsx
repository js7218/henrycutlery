'use client';

import { AppProvider } from '@/context/AppContext';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AgeVerification from '@/components/ui/AgeVerification';
import UrlPathHider from '@/components/security/UrlPathHider';
import HumanVerificationGate from '@/components/security/HumanVerificationGate';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProvider>
      <AgeVerification>
        <UrlPathHider />
        <HumanVerificationGate />
        <Header />
        <main className="min-h-screen pt-16 md:pt-20">
          {children}
        </main>
        <Footer />
      </AgeVerification>
    </AppProvider>
  );
}
