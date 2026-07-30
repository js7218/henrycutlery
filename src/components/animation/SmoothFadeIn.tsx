'use client';

import { useRef, useEffect } from 'react';

/**
 * A Tier: Smooth Fade-In
 *
 * A dark overlay covers the screen on load, then gently fades away
 * (opacity 1 → 0) over 0.6s with a blur transition.
 * Like opening your eyes in a well-lit room.
 *
 * Mobile & Desktop: Identical behavior. Pure CSS animation.
 */

export default function SmoothFadeIn() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Start fully opaque, fade to transparent
    const anim = el.animate(
      [
        { opacity: 1, filter: 'blur(4px)' },
        { opacity: 0, filter: 'blur(0px)' },
      ],
      {
        duration: 600,
        easing: 'ease-out',
        fill: 'forwards',
      }
    );

    // After animation, hide element completely
    anim.onfinish = () => {
      el.style.display = 'none';
    };

    return () => anim.cancel();
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[75] pointer-events-none"
      style={{ opacity: 1, background: '#1a1a1a' }}
      aria-hidden="true"
    />
  );
}
