'use client';

import { useRef, useCallback, useState } from 'react';
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
  /** Max tilt in degrees. Default: 15 */
  maxTilt?: number;
  /** Scale on hover. Default: 1.04 */
  scale?: number;
  /** Show gold glare. Default: true */
  glare?: boolean;
  /** Show edge highlight. Default: true */
  edgeHighlight?: boolean;
  /** Floating animation speed. Default: 6 (seconds) */
  floatSpeed?: number;
  /** Shadow intensity. Default: 0.3 */
  shadowIntensity?: number;
}

/**
 * 3D product image with perspective tilt, dynamic shadow,
 * gold glare reflection, and subtle floating animation.
 * 
 * On desktop: follows mouse for 3D tilt effect.
 * On mobile: graceful fallback with subtle float only.
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
  maxTilt = 15,
  scale = 1.04,
  glare = true,
  edgeHighlight = true,
  floatSpeed = 6,
  shadowIntensity = 0.3,
}: ThreeDImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  // Mouse move handler
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

      // Tilt: negative rotateX = tilt forward (mouse below center), positive = tilt back
      const rotateX = ((y - centerY) / centerY) * -maxTilt;
      const rotateY = ((x - centerX) / centerX) * maxTilt;

      gsap.to(inner, {
        rotateX,
        rotateY,
        scale,
        duration: 0.4,
        ease: 'power2.out',
        transformPerspective: 900,
        transformOrigin: 'center center',
      });

      // Dynamic shadow: shifts opposite to tilt
      if (shadowEl) {
        const shadowX = rotateY * -1.5;
        const shadowY = rotateX * -1.5;
        const shadowBlur = 35 + Math.abs(rotateX) * 1.5 + Math.abs(rotateY) * 1.5;
        const shadowAlpha = shadowIntensity + (Math.abs(rotateX) + Math.abs(rotateY)) / maxTilt * 0.15;
        shadowEl.style.boxShadow = `
          ${shadowX}px ${shadowY}px ${shadowBlur}px rgba(0,0,0,${shadowAlpha}),
          0 0 ${20 + Math.abs(rotateX) + Math.abs(rotateY)}px rgba(201,169,98,${shadowAlpha * 0.4})
        `;
      }

      // Glare: follows mouse position
      if (glare && glareEl) {
        const glareX = (x / rect.width) * 100;
        const glareY = (y / rect.height) * 100;
        gsap.to(glareEl, {
          background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.18) 0%, rgba(201,169,98,0.08) 40%, transparent 70%)`,
          opacity: 1,
          duration: 0.3,
        });
      }
    },
    [maxTilt, scale, glare, shadowIntensity]
  );

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    // Pause float animation
    if (innerRef.current) {
      gsap.to(innerRef.current, { y: 0, duration: 0.3 });
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    const inner = innerRef.current;
    const glareEl = glareRef.current;
    const shadowEl = shadowRef.current;

    if (inner) {
      gsap.to(inner, {
        rotateX: 0,
        rotateY: 0,
        scale: 1,
        duration: 0.6,
        ease: 'power3.out',
        onComplete: () => {
          // Resume float after reset
          gsap.to(inner, {
            y: -6,
            duration: floatSpeed * 0.7,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
        },
      });
    }

    if (glareEl) {
      gsap.to(glareEl, { opacity: 0, duration: 0.4 });
    }

    if (shadowEl) {
      shadowEl.style.boxShadow = `
        0 8px 30px rgba(0,0,0,${shadowIntensity}),
        0 0 10px rgba(201,169,98,${shadowIntensity * 0.2})
      `;
    }
  }, [floatSpeed, shadowIntensity]);

  // Idle float animation
  useGSAP(
    () => {
      const inner = innerRef.current;
      if (!inner || isTouchDevice) return;

      gsap.to(inner, {
        y: -6,
        duration: floatSpeed * 0.7,
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
      style={{ perspective: '900px' }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Dynamic shadow layer */}
      <div
        ref={shadowRef}
        className="absolute inset-0 rounded-2xl pointer-events-none transition-shadow duration-300"
        style={{
          boxShadow: `
            0 8px 30px rgba(0,0,0,${shadowIntensity}),
            0 0 10px rgba(201,169,98,${shadowIntensity * 0.2})
          `,
          transform: 'translateZ(-20px)',
        }}
      />

      {/* 3D image wrapper */}
      <div
        ref={innerRef}
        className="relative rounded-2xl overflow-hidden"
        style={{
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
      >
        {/* Edge highlight */}
        {edgeHighlight && (
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none z-10"
            style={{
              border: '1px solid rgba(201,169,98,0.15)',
              boxShadow: 'inset 0 0 30px rgba(201,169,98,0.06)',
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
            className="pointer-events-none absolute inset-0 opacity-0 z-10"
            style={{
              mixBlendMode: 'soft-light',
            }}
          />
        )}
      </div>
    </div>
  );
}