'use client';

import { useRef, useCallback } from 'react';
import Image from 'next/image';
import { gsap, useGSAP, isTouchDevice } from '@/lib/gsap';

interface ThreeDImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
  containerClassName?: string;
  /** Max tilt in degrees. Default: 20 */
  maxTilt?: number;
  /** Scale on hover. Default: 1.05 */
  scale?: number;
  /** Show gold glare. Default: true */
  glare?: boolean;
  /** Show edge highlight. Default: true */
  edgeHighlight?: boolean;
  /** Floating animation speed. Default: 5 (seconds) */
  floatSpeed?: number;
  /** Shadow intensity. Default: 0.4 */
  shadowIntensity?: number;
}

/**
 * 3D product image with perspective tilt, dynamic shadow,
 * gold glare reflection, and subtle floating animation.
 */
export default function ThreeDImage({
  src,
  alt,
  fill = false,
  width,
  height,
  priority = false,
  sizes,
  className = '',
  containerClassName = '',
  maxTilt = 20,
  scale = 1.05,
  glare = true,
  edgeHighlight = true,
  floatSpeed = 5,
  shadowIntensity = 0.4,
}: ThreeDImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isTouchDevice) return;
      const container = containerRef.current;
      const inner = innerRef.current;
      const glareEl = glareRef.current;
      const shadowEl = shadowRef.current;
      if (!container || !inner) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -maxTilt;
      const rotateY = ((x - centerX) / centerX) * maxTilt;

      gsap.to(inner, {
        rotateX,
        rotateY,
        scale,
        duration: 0.4,
        ease: 'power2.out',
        transformPerspective: 800,
        transformOrigin: 'center center',
      });

      // Dynamic shadow
      if (shadowEl) {
        const shadowX = rotateY * -2;
        const shadowY = rotateX * -2;
        const shadowBlur = 40 + Math.abs(rotateX) * 2 + Math.abs(rotateY) * 2;
        const shadowAlpha = shadowIntensity + (Math.abs(rotateX) + Math.abs(rotateY)) / maxTilt * 0.2;
        shadowEl.style.boxShadow = `
          ${shadowX}px ${shadowY}px ${shadowBlur}px rgba(0,0,0,${shadowAlpha}),
          0 0 ${30 + Math.abs(rotateX) + Math.abs(rotateY)}px rgba(201,169,98,${shadowAlpha * 0.5})
        `;
      }

      // Glare
      if (glare && glareEl) {
        const glareX = (x / rect.width) * 100;
        const glareY = (y / rect.height) * 100;
        gsap.to(glareEl, {
          background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.22) 0%, rgba(201,169,98,0.1) 35%, transparent 65%)`,
          opacity: 1,
          duration: 0.3,
        });
      }
    },
    [maxTilt, scale, glare, shadowIntensity]
  );

  const handleMouseEnter = useCallback(() => {
    if (isTouchDevice) return;
    if (innerRef.current) {
      gsap.killTweensOf(innerRef.current, 'y');
      gsap.to(innerRef.current, { y: 0, duration: 0.3 });
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isTouchDevice) return;
    const inner = innerRef.current;
    const glareEl = glareRef.current;
    const shadowEl = shadowRef.current;

    if (inner) {
      gsap.to(inner, {
        rotateX: 0,
        rotateY: 0,
        scale: 1,
        duration: 0.7,
        ease: 'power3.out',
        onComplete: () => {
          if (innerRef.current) {
            gsap.to(innerRef.current, {
              y: -8,
              duration: floatSpeed * 0.6,
              repeat: -1,
              yoyo: true,
              ease: 'sine.inOut',
            });
          }
        },
      });
    }

    if (glareEl) {
      gsap.to(glareEl, { opacity: 0, duration: 0.4 });
    }

    if (shadowEl) {
      shadowEl.style.boxShadow = `
        0 10px 40px rgba(0,0,0,${shadowIntensity}),
        0 0 15px rgba(201,169,98,${shadowIntensity * 0.25})
      `;
    }
  }, [floatSpeed, shadowIntensity]);

  // Idle float animation
  useGSAP(
    () => {
      const inner = innerRef.current;
      if (!inner || isTouchDevice) return;

      gsap.to(inner, {
        y: -8,
        duration: floatSpeed * 0.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: 0.5,
      });
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className={`relative ${containerClassName}`}
      style={{ perspective: '800px' }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Dynamic shadow layer */}
      <div
        ref={shadowRef}
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          boxShadow: `
            0 10px 40px rgba(0,0,0,${shadowIntensity}),
            0 0 15px rgba(201,169,98,${shadowIntensity * 0.25})
          `,
          zIndex: 0,
        }}
      />

      {/* 3D image wrapper — fills the container */}
      <div
        ref={innerRef}
        className="absolute inset-0 rounded-2xl overflow-hidden"
        style={{
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          zIndex: 1,
        }}
      >
        {/* Edge highlight */}
        {edgeHighlight && (
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              zIndex: 10,
              border: '1px solid rgba(201,169,98,0.2)',
              boxShadow: 'inset 0 0 40px rgba(201,169,98,0.08)',
            }}
          />
        )}

        <Image
          src={src}
          alt={alt}
          fill={fill}
          width={!fill ? width : undefined}
          height={!fill ? height : undefined}
          priority={priority}
          sizes={sizes}
          className={`object-cover ${className}`}
        />

        {/* Gold glare overlay */}
        {glare && (
          <div
            ref={glareRef}
            className="pointer-events-none absolute inset-0 opacity-0"
            style={{
              zIndex: 5,
              mixBlendMode: 'soft-light',
            }}
          />
        )}
      </div>
    </div>
  );
}