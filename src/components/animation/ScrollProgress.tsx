'use client';

import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '@/lib/gsap';

/**
 * Gold scroll progress bar at the top of the viewport.
 * Fills from left to right as the user scrolls down the page.
 * Uses scaleX transform for GPU-accelerated performance.
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
    <div className="fixed top-0 left-0 right-0 z-[60] h-[3px] pointer-events-none">
      <div
        ref={barRef}
        className="h-full origin-left"
        style={{
          background:
            'linear-gradient(90deg, #c9a962 0%, #d4b978 30%, #f0d98a 50%, #d4b978 70%, #c9a962 100%)',
          transform: 'scaleX(0)',
          boxShadow: '0 0 8px rgba(201, 169, 98, 0.6)',
        }}
      />
    </div>
  );
}
