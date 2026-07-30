'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AppProvider } from '@/context/AppContext';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AgeVerification from '@/components/ui/AgeVerification';
import UrlPathHider from '@/components/security/UrlPathHider';
import HumanVerificationGate from '@/components/security/HumanVerificationGate';
import WafBrowserCheck from '@/components/security/WafBrowserCheck';
import ChatWidget from '@/components/support/ChatWidget';
import ScrollProgress from '@/components/animation/ScrollProgress';

// CSS-only effects (always reliable, all browsers)
const FilmGrain = dynamic(() => import('@/components/animation/FilmGrain'), { ssr: false });
const Vignette = dynamic(() => import('@/components/animation/Vignette'), { ssr: false });
const AmbientLight = dynamic(() => import('@/components/animation/AmbientLight'), { ssr: false });

// Canvas-based effects (enhancement layer, desktop-first)
const PageTransition = dynamic(() => import('@/components/animation/PageTransition'), { ssr: false });
const CustomCursor = dynamic(() => import('@/components/animation/CustomCursor'), { ssr: false });
const TouchTrail = dynamic(() => import('@/components/animation/TouchTrail'), { ssr: false });
const RippleEffect = dynamic(() => import('@/components/animation/RippleEffect'), { ssr: false });
const ParticleNetwork = dynamic(() => import('@/components/animation/ParticleNetwork'), { ssr: false });
const CursorGlow = dynamic(() => import('@/components/animation/CursorGlow'), { ssr: false });

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProvider>
      {/* CSS-only effects: always work, no JS needed after load */}
      <ScrollProgress />
      <AmbientLight />
      <FilmGrain opacity={0.04} />
      <Vignette intensity={0.25} />

      {/* Canvas enhancements: gracefully degrade on unsupported browsers */}
      <PageTransition />
      <CustomCursor />
      <TouchTrail />
      <RippleEffect />
      <ParticleNetwork count={50} maxDistance={140} />
      <CursorGlow color="rgba(201, 169, 98, 0.10)" size={350} />

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