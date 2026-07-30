'use client';

import { useRef, useMemo } from 'react';
import { gsap, useGSAP, onAgeVerified, isMobileViewport } from '@/lib/gsap';

interface GoldParticlesProps {
  /** Number of particles. Auto-reduces on mobile. Default: 30 */
  count?: number;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

/**
 * Ambient floating gold particles that drift upward continuously.
 * Uses DOM elements animated by GSAP for maximum browser compatibility.
 * Particle count auto-reduces on mobile for performance.
 */
export default function GoldParticles({
  count = 30,
  className = '',
}: GoldParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Reduce particles on mobile for performance
  const actualCount = isMobileViewport ? Math.floor(count * 0.4) : count;

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: actualCount }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 1,
      duration: Math.random() * 8 + 6,
      delay: Math.random() * 5,
      opacity: Math.random() * 0.4 + 0.1,
    }));
  }, [actualCount]);

  useGSAP(
    () => {
      if (!containerRef.current) return;

      const particleEls =
        containerRef.current.querySelectorAll('[data-particle]');

      onAgeVerified(() => {
        particleEls.forEach((el, i) => {
          const p = particles[i];
          if (!p) return;

          // Floating upward animation, infinite
          gsap.to(el, {
            y: `-=${window.innerHeight + 100}`,
            x: `+=${(Math.random() - 0.5) * 200}`,
            opacity: 0,
            duration: p.duration,
            delay: p.delay,
            repeat: -1,
            ease: 'none',
            onStart: () => {
              gsap.set(el, { opacity: p.opacity });
            },
          });

          // Subtle twinkle effect
          gsap.to(el, {
            scale: Math.random() * 0.5 + 0.8,
            duration: Math.random() * 2 + 1,
            delay: p.delay,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
        });
      });
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {particles.map((p, i) => (
        <div
          key={i}
          data-particle
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(201,169,98,0.8) 0%, rgba(201,169,98,0) 70%)',
            opacity: 0,
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}
