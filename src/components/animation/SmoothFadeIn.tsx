'use client';

import { useRef, useEffect } from 'react';

/**
 * A Tier: Smooth Fade-In
 *
 * The entire page content gently fades in from opacity 0 → 1 over 0.6s.
 * No sweeps, no flashes — just a calm, smooth entrance.
 * Like opening your eyes in a well-lit room.
 *
 * Mobile & Desktop: Identical behavior. Pure CSS animation.
 */

export default function SmoothFadeIn() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Use Web Animations API for smooth, JS-controlled fade
    const anim = el.animate(
      [
        { opacity: 0, filter: 'blur(4px)' },
        { opacity: 1, filter: 'blur(0px)' },
      ],
      {
        duration: 600,
        easing: 'ease-out',
        fill: 'forwards',
      }
    );

    return () => anim.cancel();
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[75] pointer-events-none"
      style={{ opacity: 0, background: 'var(--background, #1a1a1a)' }}
      aria-hidden="true"
    />
  );
}
