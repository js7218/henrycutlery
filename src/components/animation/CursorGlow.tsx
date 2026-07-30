'use client';

import { useRef, useEffect, useCallback } from 'react';

interface CursorGlowProps {
  /** Glow color in rgba format, default gold */
  color?: string;
  /** Glow size in px, default 400 */
  size?: number;
  className?: string;
}

export default function CursorGlow({
  color = 'rgba(201, 169, 98, 0.12)',
  size = 400,
  className = '',
}: CursorGlowProps) {
  const glowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  const animate = useCallback(() => {
    const glow = glowRef.current;
    if (!glow) return;

    // Smooth lerp
    currentRef.current.x += (targetRef.current.x - currentRef.current.x) * 0.08;
    currentRef.current.y += (targetRef.current.y - currentRef.current.y) * 0.08;

    glow.style.transform = `translate(${currentRef.current.x - size / 2}px, ${currentRef.current.y - size / 2}px)`;

    rafRef.current = requestAnimationFrame(animate);
  }, [size]);

  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile) return; // No cursor glow on mobile

    const onMouseMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY };
    };

    rafRef.current = requestAnimationFrame(animate);
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [animate]);

  return (
    <div
      ref={glowRef}
      className={`fixed pointer-events-none z-[1] ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        willChange: 'transform',
      }}
      aria-hidden="true"
    />
  );
}