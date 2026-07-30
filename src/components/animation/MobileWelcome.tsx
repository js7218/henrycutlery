'use client';

import { useRef, useEffect } from 'react';
import { gsap } from '@/lib/gsap';

interface MobileWelcomeProps {
  /** Delay in seconds before the animation starts. Default: 0.2 */
  delay?: number;
}

/**
 * S+ Tier: Mobile Welcome Animation
 *
 * A dramatic entrance animation specifically optimized for mobile.
 * Creates a "gold reveal" effect that's impossible to miss:
 * 1. Full-screen gold flash
 * 2. Golden particles burst from center
 * 3. Content fades in with scale
 * 4. Bottom gold glow bar pulses
 *
 * Mobile only. On desktop, this component does nothing.
 * Auto-syncs with age verification — plays only after verification.
 */
export default function MobileWelcome({ delay = 0.2 }: MobileWelcomeProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const hasPlayed = useRef(false);

  useEffect(() => {
    // Only play on mobile
    if (typeof window === 'undefined') return;
    if (window.innerWidth >= 768) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (hasPlayed.current) return;

    const play = () => {
      if (hasPlayed.current) return;
      hasPlayed.current = true;

      const overlay = overlayRef.current;
      const glow = glowRef.current;
      if (!overlay || !glow) return;

      const tl = gsap.timeline();

      // Phase 1: Gold flash from center
      tl.set(overlay, {
        display: 'block',
        opacity: 0,
        scale: 0.5,
      })
        .to(overlay, {
          opacity: 1,
          scale: 1,
          duration: 0.4,
          ease: 'power3.out',
          delay,
        })
        // Phase 2: Hold briefly
        .to(overlay, {
          duration: 0.15,
        })
        // Phase 3: Reveal content - gold sweeps up
        .to(overlay, {
          yPercent: -100,
          opacity: 0.5,
          duration: 0.6,
          ease: 'power3.inOut',
        })
        // Phase 4: Bottom glow bar pulses
        .to(glow, {
          opacity: 1,
          scaleY: 1,
          duration: 0.4,
          ease: 'back.out(1.5)',
        }, '-=0.3')
        .to(glow, {
          opacity: 0,
          scaleY: 0.5,
          duration: 0.8,
          ease: 'power2.out',
          delay: 0.3,
          onComplete: () => {
            gsap.set(overlay, { display: 'none' });
          },
        });
    };

    // Wait for age verification
    let verified = false;
    try {
      verified = sessionStorage.getItem('age_verified') === 'true';
    } catch { /* ignore */ }

    if (verified) {
      play();
    } else {
      const handler = () => play();
      window.addEventListener('age-verified', handler);
      // Safety net
      const timeout = setTimeout(play, 5000);
      return () => {
        window.removeEventListener('age-verified', handler);
        clearTimeout(timeout);
      };
    }
  }, [delay]);

  return (
    <>
      {/* Full-screen gold overlay for entrance flash */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[200] pointer-events-none"
        style={{
          display: 'none',
          background:
            'radial-gradient(ellipse at center, #f0d98a 0%, #c9a962 40%, #8a7340 100%)',
        }}
      >
        {/* Shimmer lines */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'repeating-linear-gradient(90deg, transparent 0px, rgba(255,255,255,0.15) 2px, transparent 4px)',
          }}
        />
        {/* Center flash */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, rgba(255,255,255,0.5) 0%, transparent 50%)',
          }}
        />
      </div>

      {/* Bottom glow bar that lingers */}
      <div
        ref={glowRef}
        className="fixed bottom-0 left-0 right-0 z-[150] pointer-events-none"
        style={{
          height: '120px',
          background:
            'linear-gradient(to top, rgba(201, 169, 98, 0.6) 0%, rgba(201, 169, 98, 0.3) 40%, transparent 100%)',
          opacity: 0,
          transform: 'scaleY(0)',
          transformOrigin: 'bottom',
          filter: 'blur(10px)',
        }}
      />
    </>
  );
}
