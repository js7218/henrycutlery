'use client';

import { useRef, ReactNode, useCallback } from 'react';
import { gsap, useGSAP, isTouchDevice } from '@/lib/gsap';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees. Default: 8 */
  maxTilt?: number;
  /** Scale on hover. Default: 1.03 */
  scale?: number;
  /** Glare effect. Default: true */
  glare?: boolean;
}

/**
 * 3D tilt card that follows mouse movement (desktop)
 * or device orientation (mobile, if available).
 * Adds a subtle gold glare highlight on desktop.
 */
export default function TiltCard({
  children,
  className = '',
  maxTilt = 8,
  scale = 1.03,
  glare = true,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const card = cardRef.current;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -maxTilt;
      const rotateY = ((x - centerX) / centerX) * maxTilt;

      gsap.to(card, {
        rotateX,
        rotateY,
        scale,
        duration: 0.3,
        ease: 'power2.out',
        transformPerspective: 800,
        transformOrigin: 'center',
      });

      if (glare && glareRef.current) {
        const glareX = (x / rect.width) * 100;
        const glareY = (y / rect.height) * 100;
        gsap.to(glareRef.current, {
          background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(201,169,98,0.15) 0%, transparent 60%)`,
          opacity: 1,
          duration: 0.3,
        });
      }
    },
    [maxTilt, scale, glare]
  );

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;

    gsap.to(card, {
      rotateX: 0,
      rotateY: 0,
      scale: 1,
      duration: 0.5,
      ease: 'power3.out',
    });

    if (glareRef.current) {
      gsap.to(glareRef.current, { opacity: 0, duration: 0.3 });
    }
  }, []);

  useGSAP(
    () => {
      const card = cardRef.current;
      if (!card) return;

      // Skip tilt on touch devices to avoid performance issues
      if (isTouchDevice) return;

      card.addEventListener('mousemove', handleMouseMove);
      card.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        card.removeEventListener('mousemove', handleMouseMove);
        card.removeEventListener('mouseleave', handleMouseLeave);
      };
    },
    { scope: cardRef }
  );

  return (
    <div
      ref={cardRef}
      className={className}
      style={{
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
    >
      {children}
      {glare && (
        <div
          ref={glareRef}
          className="pointer-events-none absolute inset-0 rounded-lg opacity-0"
          style={{ zIndex: 1 }}
        />
      )}
    </div>
  );
}
