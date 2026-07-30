'use client';

import { useRef, useEffect } from 'react';
import { getIsMobile } from '@/lib/gsap';

/**
 * S Tier: Canvas Touch/Mouse Trail Particles
 *
 * Spawns golden spark particles that follow the cursor (desktop) or finger (mobile).
 * Particles float upward and fade out, creating a magical trail effect.
 *
 * Mobile & Desktop:
 * - Desktop: follows mousemove, spawns 2 particles per move
 * - Mobile: follows touchmove, spawns 3-4 larger, brighter particles per move
 * - Auto-pauses when tab is not visible (performance)
 * - Respects prefers-reduced-motion
 *
 * Performance: Uses requestAnimationFrame, max particles capped per device.
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

    const isMobile = getIsMobile();
    // Mobile: more particles, larger size, brighter glow
    const maxParticles = isMobile ? 60 : 100;
    const particleSize = isMobile ? 2.5 : 2;
    const glowSize = isMobile ? 8 : 5;
    const spawnCount = isMobile ? 3 : 2;
    const baseAlpha = isMobile ? 0.9 : 0.7;

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
          x: x + (Math.random() - 0.5) * 12,
          y: y + (Math.random() - 0.5) * 12,
          vx: (Math.random() - 0.5) * (isMobile ? 1.5 : 2),
          vy: -Math.random() * (isMobile ? 1.5 : 2) - 0.5, // Float upward
          life: 1,
          maxLife: 0.5 + Math.random() * 0.5,
          size: Math.random() * particleSize + particleSize * 0.5,
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
        p.vy -= 0.03; // Slight upward acceleration
        p.life -= 0.016 / p.maxLife;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        const alpha = p.life * baseAlpha;
        const radius = p.size * p.life;

        // Outer glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * glowSize);
        gradient.addColorStop(0, `hsla(${p.hue}, 90%, 75%, ${alpha})`);
        gradient.addColorStop(0.3, `hsla(${p.hue}, 80%, 60%, ${alpha * 0.5})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 70%, 45%, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = `hsla(${p.hue}, 100%, 90%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(animate);
    };

    animate();

    // Mouse events (desktop)
    const handleMouseMove = (e: MouseEvent) => {
      spawn(e.clientX, e.clientY, spawnCount);
    };

    // Touch events (mobile)
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        spawn(touch.clientX, touch.clientY, spawnCount + 1);
      }
    };

    // Click/tap burst
    const handleClick = (e: MouseEvent) => {
      spawn(e.clientX, e.clientY, isMobile ? 12 : 20);
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        spawn(touch.clientX, touch.clientY, isMobile ? 10 : 15);
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
