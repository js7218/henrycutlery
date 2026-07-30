'use client';

import { useRef, ReactNode } from 'react';
import { gsap, useGSAP, ScrollTrigger } from '@/lib/gsap';

interface HorizontalPinScrollProps {
  children: ReactNode;
  className?: string;
  /** Total width of the horizontal content as a multiple of viewport width. Default: 3 */
  panels?: number;
  /** Gap between panels in pixels. Default: 24 */
  gap?: number;
}

/**
 * S+ Tier: Horizontal Pin Scroll Product Showcase
 *
 * Pins a section vertically while the user scrolls, and translates the content
 * horizontally — creating a premium "horizontal scroll" experience.
 *
 * Desktop: Full pin + horizontal scroll with skew effect on fast scroll
 * Mobile: Falls back to native horizontal swipe (overflow-x: auto) with snap
 *
 * Usage:
 * <HorizontalPinScroll panels={4}>
 *   <div>Panel 1</div>
 *   <div>Panel 2</div>
 *   <div>Panel 3</div>
 *   <div>Panel 4</div>
 * </HorizontalPinScroll>
 */

export default function HorizontalPinScroll({
  children,
  className = '',
  panels = 3,
  gap = 24,
}: HorizontalPinScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const container = containerRef.current;
      const track = trackRef.current;
      if (!container || !track) return;

      const mm = gsap.matchMedia();

      // Desktop / Tablet (≥768px): Pin + horizontal scroll
      mm.add('(min-width: 768px)', () => {
        const totalScroll = track.scrollWidth - window.innerWidth + 100;

        const tween = gsap.to(track, {
          x: -totalScroll,
          ease: 'none',
          scrollTrigger: {
            trigger: container,
            start: 'top top',
            end: () => `+=${totalScroll}`,
            scrub: 1,
            pin: true,
            pinSpacing: true,
            invalidateOnRefresh: true,
          },
        });

        // Skew effect on fast scroll for dynamic feel
        let lastScrollY = window.scrollY;
        let skewTimeout: ReturnType<typeof setTimeout>;

        const handleScroll = () => {
          const diff = window.scrollY - lastScrollY;
          lastScrollY = window.scrollY;
          const skew = Math.max(-8, Math.min(8, diff * 0.3));

          gsap.to(track.querySelectorAll('.hs-panel'), {
            skewX: skew,
            duration: 0.2,
            ease: 'power2.out',
          });

          clearTimeout(skewTimeout);
          skewTimeout = setTimeout(() => {
            gsap.to(track.querySelectorAll('.hs-panel'), {
              skewX: 0,
              duration: 0.3,
              ease: 'power3.out',
            });
          }, 150);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
          window.removeEventListener('scroll', handleScroll);
          clearTimeout(skewTimeout);
        };
      });

      // Mobile (<768px): Native horizontal scroll with snap, no pin
      // CSS handles this — no GSAP needed
      mm.add('(max-width: 767px)', () => {
        // Just ensure panels are visible
        gsap.set(track, { x: 0, skewX: 0 });
      });
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden ${className}`}
    >
      {/* Desktop: full-width track that gets translated */}
      <div
        ref={trackRef}
        className="flex will-change-transform"
        style={{
          gap: `${gap}px`,
          padding: `0 ${gap}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Wrapper for each panel inside HorizontalPinScroll.
 * Ensures consistent sizing and snap behavior.
 */
export function HorizontalPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`hs-panel flex-shrink-0 w-[85vw] md:w-[40vw] lg:w-[30vw] snap-center ${className}`}
    >
      {children}
    </div>
  );
}
