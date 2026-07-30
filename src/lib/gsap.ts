/**
 * GSAP Setup & Registration
 * Registers all plugins once on the client side.
 * Import from this file instead of 'gsap' directly to ensure plugins are registered.
 */
'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

// Register plugins (client-side only)
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, useGSAP);

  // Mobile optimisation: ignore `resize` spam from iOS address-bar show/hide
  // and only refresh ScrollTrigger when the *width* actually changes.
  let lastWidth = window.innerWidth;
  ScrollTrigger.addEventListener('scrollEnd', () => ScrollTrigger.refresh());

  // Debounced resize – only refresh when width changes (not height)
  let resizeTimer: ReturnType<typeof setTimeout>;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        ScrollTrigger.refresh();
      }
    }, 200);
  });

  // When the WAF browser check passes, refresh ScrollTrigger so that
  // entrance animations are recalculated and play at the right time.
  window.addEventListener('waf-check-passed', () => {
    // Small delay to allow React to flush the DOM update
    setTimeout(() => {
      ScrollTrigger.refresh();
    }, 100);
  });
}

// Default ease for premium feel
gsap.defaults({
  ease: 'power3.out',
  duration: 0.8,
});

// Respect reduced motion
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
  gsap.globalTimeline.timeScale(0);
}

/** True when the current device is a touch / mobile device. */
export const isTouchDevice =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

/** True when viewport width is below the tablet breakpoint (768px). */
export const isMobileViewport =
  typeof window !== 'undefined' && window.innerWidth < 768;

export { gsap, ScrollTrigger, useGSAP };
export const reducedMotion = prefersReducedMotion;
