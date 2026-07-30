'use client';

import { useRef, useEffect, useCallback } from 'react';
import { gsap, isTouchDevice } from '@/lib/gsap';

/**
 * A Tier: Custom Magnetic Gold Cursor
 * 
 * Replaces the default cursor with a glowing gold ring that:
 * - Smoothly follows the mouse with elastic lag
 * - Enlarges and snaps to interactive elements (buttons, links)
 * - Shows "VIEW" text on product cards
 * - Auto-hides on touch devices
 * 
 * Desktop only. Zero impact on mobile.
 */
export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Skip entirely on touch devices
    if (isTouchDevice) return;

    // Check reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    const label = labelRef.current;
    if (!dot || !ring || !label) return;

    // Show cursor elements
    gsap.set([dot, ring, label], { opacity: 0 });
    gsap.to([dot, ring], { opacity: 1, duration: 0.3, delay: 0.5 });

    const xTo = gsap.quickTo(ring, 'x', { duration: 0.4, ease: 'power3.out' });
    const yTo = gsap.quickTo(ring, 'y', { duration: 0.4, ease: 'power3.out' });
    const xToDot = gsap.quickTo(dot, 'x', { duration: 0.1, ease: 'power3.out' });
    const yToDot = gsap.quickTo(dot, 'y', { duration: 0.1, ease: 'power3.out' });
    const xToLabel = gsap.quickTo(label, 'x', { duration: 0.3, ease: 'power3.out' });
    const yToLabel = gsap.quickTo(label, 'y', { duration: 0.3, ease: 'power3.out' });

    const handleMouseMove = (e: MouseEvent) => {
      xTo(e.clientX);
      yTo(e.clientY);
      xToDot(e.clientX);
      yToDot(e.clientY);
      xToLabel(e.clientX);
      yToLabel(e.clientY);
    };

    // Magnetic snap to interactive elements
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Product card - show "VIEW"
      const productCard = target.closest('[data-product-card], .group.block');
      if (productCard) {
        gsap.to(ring, {
          width: 60,
          height: 60,
          borderWidth: 2,
          duration: 0.3,
          ease: 'back.out(1.4)',
        });
        gsap.to(label, { opacity: 1, scale: 1, duration: 0.2 });
        return;
      }

      // Buttons and links - enlarge
      const interactive = target.closest('a, button, input, [role="button"]');
      if (interactive) {
        gsap.to(ring, {
          width: 45,
          height: 45,
          borderWidth: 2,
          borderColor: 'rgba(201, 169, 98, 0.8)',
          duration: 0.3,
          ease: 'back.out(1.4)',
        });
        gsap.to(label, { opacity: 0, scale: 0.5, duration: 0.15 });
        return;
      }

      // Default state
      gsap.to(ring, {
        width: 30,
        height: 30,
        borderWidth: 1.5,
        borderColor: 'rgba(201, 169, 98, 0.4)',
        duration: 0.3,
      });
      gsap.to(label, { opacity: 0, scale: 0.5, duration: 0.15 });
    };

    // Hide on mouse leave window
    const handleMouseLeave = () => {
      gsap.to([dot, ring, label], { opacity: 0, duration: 0.2 });
    };

    const handleMouseEnter = () => {
      gsap.to([dot, ring], { opacity: 1, duration: 0.2 });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    // Hide default cursor
    document.body.style.cursor = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.body.style.cursor = '';
    };
  }, []);

  // Don't render on touch devices
  if (typeof window !== 'undefined' && isTouchDevice) return null;

  return (
    <>
      {/* Outer ring */}
      <div
        ref={ringRef}
        className="fixed top-0 left-0 z-[9999] pointer-events-none rounded-full"
        style={{
          width: 30,
          height: 30,
          border: '1.5px solid rgba(201, 169, 98, 0.4)',
          transform: 'translate(-50%, -50%)',
          willChange: 'transform',
          marginLeft: '-15px',
          marginTop: '-15px',
        }}
      />
      {/* Center dot */}
      <div
        ref={dotRef}
        className="fixed top-0 left-0 z-[9999] pointer-events-none rounded-full"
        style={{
          width: 6,
          height: 6,
          background: '#c9a962',
          boxShadow: '0 0 8px rgba(201, 169, 98, 0.8)',
          transform: 'translate(-50%, -50%)',
          willChange: 'transform',
          marginLeft: '-3px',
          marginTop: '-3px',
        }}
      />
      {/* Label that appears on product cards */}
      <div
        ref={labelRef}
        className="fixed top-0 left-0 z-[9999] pointer-events-none text-xs font-bold text-gold uppercase tracking-wider"
        style={{
          opacity: 0,
          transform: 'translate(-50%, -50%) scale(0.5)',
          marginLeft: '15px',
          marginTop: '15px',
          willChange: 'transform, opacity',
          textShadow: '0 0 10px rgba(0,0,0,0.8)',
        }}
      >
        View
      </div>
    </>
  );
}
