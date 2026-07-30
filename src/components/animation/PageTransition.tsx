'use client';

import { useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { gsap } from '@/lib/gsap';

/**
 * S+ Tier: Liquid Gold Page Transition
 *
 * Creates a premium "liquid gold sweep" overlay when navigating between pages.
 * A golden wave fills the screen from left to right, then recedes, revealing the new page.
 *
 * How it works:
 * 1. Listens for Next.js route changes (pathname change)
 * 2. On change, animates a gold overlay that sweeps across the screen
 * 3. Uses GSAP clip-path animation for a smooth "liquid" feel
 *
 * Mobile & Desktop: Works perfectly on both. Pure CSS + GSAP, no WebGL.
 */

export default function PageTransition() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip the transition on first render (initial page load)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const overlay = overlayRef.current;
    if (!overlay) return;

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Phase 1: Gold sweep IN (cover the screen)
    const tl = gsap.timeline();

    tl.set(overlay, {
      display: 'block',
      clipPath: 'inset(0 100% 0 0)', // Hidden from right
      opacity: 1,
    })
      .to(overlay, {
        clipPath: 'inset(0 0% 0 0)', // Cover full screen
        duration: 0.5,
        ease: 'power3.inOut',
      })
      // Phase 2: Brief hold with shimmer
      .to(overlay, {
        duration: 0.15,
      })
      // Phase 3: Gold sweep OUT (reveal new page from left)
      .to(overlay, {
        clipPath: 'inset(0 0 0 100%)', // Exit to left
        duration: 0.5,
        ease: 'power3.inOut',
        onComplete: () => {
          gsap.set(overlay, { display: 'none' });
        },
      });

    // Scroll to top on page change (after overlay covers)
    const scrollTimeout = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 500);

    return () => {
      clearTimeout(scrollTimeout);
      tl.kill();
    };
  }, [pathname]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] pointer-events-none"
      style={{
        display: 'none',
        background:
          'linear-gradient(135deg, #8a7340 0%, #c9a962 20%, #f0d98a 40%, #d4b978 60%, #c9a962 80%, #8a7340 100%)',
        boxShadow: 'inset 0 0 100px rgba(255, 220, 150, 0.3)',
      }}
    >
      {/* Shimmer overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%)',
          mixBlendMode: 'overlay',
        }}
      />
      {/* Center logo during transition */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="text-3xl md:text-5xl font-bold text-background/80"
          style={{
            fontFamily: 'Playfair Display, serif',
            letterSpacing: '0.15em',
          }}
        >
          ADAM CUTLERY
        </div>
      </div>
    </div>
  );
}
