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
    setTimeout(() => {
      ScrollTrigger.refresh();
    }, 100);
  });

  // ===== SAFETY NET =====
  // If GSAP animations haven't made elements visible within 4 seconds
  // (e.g. due to age verification modal, WAF check, or ScrollTrigger
  // failing on mobile), force all [data-gsap-anim] elements visible.
  // This prevents the "blank page" issue on mobile.
  setTimeout(() => {
    const hiddenEls = document.querySelectorAll(
      '[data-gsap-anim]:not([data-gsap-done])'
    );
    hiddenEls.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (parseFloat(getComputedStyle(htmlEl).opacity) < 0.1) {
        gsap.set(htmlEl, { opacity: 1, y: 0, x: 0, scale: 1, visibility: 'visible' });
      }
    });
  }, 4000);
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

/**
 * Wait until the age verification modal has been dismissed before
 * running entrance animations. Returns immediately if already verified.
 */
export function onAgeVerified(cb: () => void): void {
  if (typeof window === 'undefined') return;

  // Check if already verified (sessionStorage set by AppContext)
  try {
    if (sessionStorage.getItem('age_verified') === 'true') {
      cb();
      return;
    }
  } catch {
    // Ignore storage errors
  }

  let fired = false;
  const handler = () => {
    if (fired) return;
    fired = true;
    cb();
    window.removeEventListener('age-verified', handler);
  };

  window.addEventListener('age-verified', handler);

  // Safety net: if the event never fires, run after 5 seconds
  setTimeout(() => {
    if (!fired) handler();
  }, 5000);
}

export { gsap, ScrollTrigger, useGSAP };
export const reducedMotion = prefersReducedMotion;
