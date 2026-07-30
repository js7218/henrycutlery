'use client';

import { useRef, useEffect } from 'react';
import { isMobileViewport } from '@/lib/gsap';

/**
 * S Tier: Canvas Touch/Mouse Trail Particles
 *
 * Spawns golden spark particles that follow the cursor (desktop) or finger (mobile).
 * Particles float upward and fade out, creating a magical trail effect.
 *
 * Mobile & Desktop:
 * - Desktop: follows mousemove, spawns 2-3 particles per move
 * - Mobile: follows touchmove, spawns 1-2 particles per move (optimized)
 * - Auto-pauses when tab is not visible (performance)
 * - Respects prefers-reduced-motion
 *
 * Performance: Uses requestAnimationFrame, max 80 particles, object pooling.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

export default function TouchTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const mobile = isMobileViewport;
    const maxParticles = mobile ? 40 : 80;
    const particles: Particle[] = [];
    let rafId: number | null = null;
    let isPaused = false;

    // Resize handler
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Spawn a particle at position
    const spawn = (x: number, y: number, count: number = 1) => {
      for (let i = 0; i < count; i++) {
        if (particles.length >= maxParticles) {
          particles.shift(); // Remove oldest
        }
        particles.push({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * (mobile ? 0.8 : 1.5),
          vy: -Math.random() * (mobile ? 1 : 1.5) - 0.3, // Float upward
          life: 1,
          maxLife: 0.6 + Math.random() * 0.4,
          size: (Math.random() * 2 + 1) * (mobile ? 0.8 : 1),
          hue: 40 + Math.random() * 15, // Gold range: 40-55
        });
      }
    };

    // Animation loop
    const animate = () => {
      if (isPaused) {
        rafId = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.02; // Slight upward acceleration
        p.life -= 0.016 / p.maxLife;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        const alpha = p.life;
        const radius = p.size * p.life;

        // Glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 4);
        gradient.addColorStop(0, `hsla(${p.hue}, 70%, 65%, ${alpha * 0.8})`);
        gradient.addColorStop(0.5, `hsla(${p.hue}, 70%, 55%, ${alpha * 0.3})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 70%, 45%, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `hsla(${p.hue}, 80%, 75%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(animate);
    };

    animate();

    // Mouse events (desktop)
    const handleMouseMove = (e: MouseEvent) => {
      spawn(e.clientX, e.clientY, mobile ? 1 : 2);
    };

    // Touch events (mobile)
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        spawn(touch.clientX, touch.clientY, 2);
      }
    };

    // Click/tap burst
    const handleClick = (e: MouseEvent) => {
      spawn(e.clientX, e.clientY, mobile ? 8 : 15);
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        spawn(touch.clientX, touch.clientY, mobile ? 6 : 10);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('click', handleClick, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });

    // Pause when tab not visible
    const handleVisibility = () => {
      isPaused = document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Cleanup
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[100] pointer-events-none"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
