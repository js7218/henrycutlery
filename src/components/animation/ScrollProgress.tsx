'use client';

import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '@/lib/gsap';

/**
 * Subtle scroll progress bar at the top of the viewport.
 * Fills from left to right as the user scrolls down the page.
 * Uses scaleX transform for GPU-accelerated performance.
 * Tone: warm bronze, not blinding gold.
 */
export default function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!barRef.current) return;

    const ctx = gsap.context(() => {
      gsap.to(barRef.current, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          start: 0,
          end: () =>
            document.documentElement.scrollHeight -
            document.documentElement.clientHeight,
          scrub: 0.3,
        },
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[2px] pointer-events-none">
      <div
        ref={barRef}
        className="h-full origin-left"
        style={{
          background: '#a08050',
          transform: 'scaleX(0)',
        }}
      />
    </div>
  );
}
