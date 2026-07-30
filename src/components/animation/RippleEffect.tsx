'use client';

import { useRef, useEffect } from 'react';

/**
 * S Tier: Touch/Mouse Ripple Effect
 *
 * Creates elegant water-ripple circles that expand outward from every tap or click.
 * Filled with a warm radial gradient for better visibility on mobile.
 *
 * Mobile: ripples on touchstart + touchmove, larger ripples
 * Desktop: ripples on click
 */

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
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
      const isMobile = window.innerWidth < 768;
      ripples.push({
        x,
        y,
        radius: 0,
        maxRadius: (isMobile ? 80 : 60) + Math.random() * 60,
        opacity: 0.5 + Math.random() * 0.3,
        hue: 40 + Math.random() * 15,
      });
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
        r.radius += 2;
        r.opacity -= 0.01;

        if (r.opacity <= 0 || r.radius >= r.maxRadius) {
          ripples.splice(i, 1);
          continue;
        }

        // Filled gradient ripple - much more visible than stroke only
        const grad = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.radius);
        grad.addColorStop(0, `hsla(${r.hue}, 80%, 60%, 0)`);
        grad.addColorStop(0.7, `hsla(${r.hue}, 70%, 55%, ${r.opacity * 0.15})`);
        grad.addColorStop(0.9, `hsla(${r.hue}, 80%, 65%, ${r.opacity * 0.4})`);
        grad.addColorStop(1, `hsla(${r.hue}, 90%, 70%, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.fill();

        // Bright ring outline
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${r.hue}, 85%, 70%, ${r.opacity * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      rafId = requestAnimationFrame(animate);
    };

    animate();

    const handleClick = (e: MouseEvent) => {
      spawnRipple(e.clientX, e.clientY);
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) spawnRipple(touch.clientX, touch.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch && Math.random() > 0.6) {
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
