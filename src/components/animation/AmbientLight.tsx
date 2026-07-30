'use client';

import { useRef, useEffect } from 'react';

/**
 * S Tier: Ambient Light
 *
 * A soft, warm radial glow that gently follows the cursor (desktop) or
 * the last touch point (mobile). Think of it as a candle in a dark room —
 * it doesn't flash or blind, it just makes the space feel warm and alive.
 *
 * Opacity is very low (6%) so it's felt, not seen.
 * Color: warm amber, not gold.
 *
 * Mobile & Desktop: Works on both. Pure CSS transform, no canvas.
 */

export default function AmbientLight() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const glow = glowRef.current;
    if (!glow) return;

    // Mobile: brighter glow for visibility on small screens
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      glow.style.background =
        'radial-gradient(circle, rgba(200, 160, 90, 0.16) 0%, rgba(200, 160, 90, 0.08) 40%, transparent 70%)';
      glow.style.width = '500px';
      glow.style.height = '500px';
    } else {
      glow.style.background =
        'radial-gradient(circle, rgba(190, 150, 85, 0.12) 0%, rgba(190, 150, 85, 0.05) 40%, transparent 70%)';
    }

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let rafId: number;

    const animate = () => {
      // Smooth lerp toward target
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;

      glow.style.transform = `translate(${currentX - 300}px, ${currentY - 300}px)`;

      rafId = requestAnimationFrame(animate);
    };

    animate();

    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        targetX = touch.clientX;
        targetY = touch.clientY;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        targetX = touch.clientX;
        targetY = touch.clientY;
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div
        ref={glowRef}
        style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(190, 150, 85, 0.12) 0%, rgba(190, 150, 85, 0.05) 40%, transparent 70%)',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
