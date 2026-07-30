'use client';

import { useRef, ReactNode } from 'react';
import { gsap, useGSAP } from '@/lib/gsap';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Direction to reveal from: 'up' | 'down' | 'left' | 'right' | 'scale' | 'fade' */
  direction?: 'up' | 'down' | 'left' | 'right' | 'scale' | 'fade';
  /** Delay in seconds before the animation starts */
  delay?: number;
  /** Stagger between child elements if multiple. Set to 0 to animate as one block. */
  stagger?: number;
  /** Distance to travel in px (for directional reveals) */
  distance?: number;
  /** ScrollTrigger start position. Default: 'top 85%' */
  start?: string;
  /** Play once and never reverse. Default: true */
  once?: boolean;
}

const directionMap: Record<string, { from: gsap.TweenVars }> = {
  up: { from: { y: 80, opacity: 0 } },
  down: { from: { y: -80, opacity: 0 } },
  left: { from: { x: -80, opacity: 0 } },
  right: { from: { x: 80, opacity: 0 } },
  scale: { from: { scale: 0.8, opacity: 0 } },
  fade: { from: { opacity: 0 } },
};

export default function ScrollReveal({
  children,
  className = '',
  direction = 'up',
  delay = 0,
  stagger = 0,
  distance,
  start = 'top 85%',
  once = true,
}: ScrollRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = containerRef.current;
      if (!el) return;

      const vars = directionMap[direction] || directionMap.up;
      const fromVars: gsap.TweenVars = { ...vars.from };

      if (distance && 'x' in fromVars) {
        fromVars.x = direction === 'left' ? -distance : distance;
      }
      if (distance && 'y' in fromVars) {
        fromVars.y = direction === 'up' ? distance : -distance;
      }

      const targets = stagger > 0 ? el.children : el;

      gsap.from(targets, {
        ...fromVars,
        delay,
        stagger: stagger > 0 ? stagger : 0,
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start,
          toggleActions: once ? 'play none none none' : 'play reverse play reverse',
        },
      });
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
