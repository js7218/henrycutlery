'use client';

import { useRef, useEffect } from 'react';

/**
 * S Tier: Touch/Mouse Ripple Effect
 *
 * Creates elegant water-ripple circles that expand outward from every tap or click.
 * Subtle, organic, and deeply satisfying — like touching a calm surface.
 *
 * Mobile: ripples on touchstart + touchmove
 * Desktop: ripples on click
 * Auto-pauses when tab is hidden.
 */

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  lineWidth: number;
  hue: number;
}

export default function RippleEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ripples: Ripple[] = [];
    let rafId: number;
    let isPaused = false;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnRipple = (x: number, y: number) => {
      ripples.push({
        x,
        y,
        radius: 0,
        maxRadius: 60 + Math.random() * 60,
        opacity: 0.4 + Math.random() * 0.3,
        lineWidth: 1.5 + Math.random(),
        hue: 40 + Math.random() * 15, // gold tones
      });
      // Cap ripples
      if (ripples.length > 20) ripples.shift();
    };

    const animate = () => {
      if (isPaused) {
        rafId = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += 1.5;
        r.opacity -= 0.008;
        r.lineWidth *= 0.99;

        if (r.opacity <= 0 || r.radius >= r.maxRadius) {
          ripples.splice(i, 1);
          continue;
        }

        // Outer ring
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${r.hue}, 60%, 55%, ${r.opacity})`;
        ctx.lineWidth = r.lineWidth;
        ctx.stroke();

        // Inner ring (smaller, faster)
        if (r.radius > 10) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${r.hue}, 50%, 65%, ${r.opacity * 0.5})`;
          ctx.lineWidth = r.lineWidth * 0.6;
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    animate();

    // Desktop: click
    const handleClick = (e: MouseEvent) => {
      spawnRipple(e.clientX, e.clientY);
    };

    // Mobile: touch
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) spawnRipple(touch.clientX, touch.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch && Math.random() > 0.7) {
        spawnRipple(touch.clientX, touch.clientY);
      }
    };

    window.addEventListener('click', handleClick, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    const handleVisibility = () => {
      isPaused = document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('visibilitychange', handleVisibility);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[95] pointer-events-none"
    />
  );
}
