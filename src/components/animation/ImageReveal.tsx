'use client';

import { useRef, ReactNode } from 'react';
import { gsap, useGSAP, onAgeVerified } from '@/lib/gsap';

interface ImageRevealProps {
  children: ReactNode;
  className?: string;
  /** Reveal direction. Default: 'left' */
  direction?: 'left' | 'right' | 'top' | 'bottom' | 'center';
  /** Duration in seconds. Default: 1.2 */
  duration?: number;
  /** Delay before start. Default: 0 */
  delay?: number;
  /** Start ScrollTrigger position. Default: 'top 85%' */
  start?: string;
  /** Whether to trigger on scroll (true) or on load (false). Default: false */
  scrollTrigger?: boolean;
}

const clipMap: Record<string, { from: string; to: string }> = {
  left: {
    from: 'inset(0 100% 0 0)',
    to: 'inset(0 0% 0 0)',
  },
  right: {
    from: 'inset(0 0% 0 100%)',
    to: 'inset(0 0% 0 0%)',
  },
  top: {
    from: 'inset(100% 0 0 0)',
    to: 'inset(0% 0 0 0)',
  },
  bottom: {
    from: 'inset(0% 0 100% 0)',
    to: 'inset(0% 0 0% 0)',
  },
  center: {
    from: 'inset(50% 50% 50% 50%)',
    to: 'inset(0% 0% 0% 0%)',
  },
};

/**
 * Reveals an image (or any content) with a clip-path curtain animation.
 * The content is hidden behind a mask that wipes away to reveal it.
 */
export default function ImageReveal({
  children,
  className = '',
  direction = 'left',
  duration = 1.2,
  delay = 0,
  start = 'top 85%',
  scrollTrigger = false,
}: ImageRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clip = clipMap[direction] || clipMap.left;

  useGSAP(
    () => {
      if (!containerRef.current) return;

      const animate = () => {
        const stConfig = scrollTrigger
          ? {
              trigger: containerRef.current,
              start,
              toggleActions: 'play none none none',
            }
          : undefined;

        gsap.fromTo(
          containerRef.current,
          { clipPath: clip.from, webkitClipPath: clip.from },
          {
            clipPath: clip.to,
            webkitClipPath: clip.to,
            duration,
            delay,
            ease: 'power4.inOut',
            immediateRender: false,
            onStart: () => {
              containerRef.current?.setAttribute('data-gsap-done', 'true');
            },
            scrollTrigger: stConfig,
          }
        );
      };

      onAgeVerified(animate);
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className={className}
      data-gsap-anim
      style={{ clipPath: clip.to, WebkitClipPath: clip.to }}
    >
      {children}
    </div>
  );
}
