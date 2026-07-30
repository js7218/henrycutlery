'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import Image from 'next/image';
import { RotateCw, Maximize2 } from 'lucide-react';
import { gsap, isTouchDevice } from '@/lib/gsap';

interface Product360ViewerProps {
  src: string;
  alt: string;
  className?: string;
  /** Rotation sensitivity (0-1). Default: 0.55 */
  sensitivity?: number;
  /** Enable auto-rotate when idle. Default: true */
  autoRotate?: boolean;
  /** Auto rotation speed: seconds per 360° lap. Default: 18 */
  autoRotateSpeed?: number;
}

/**
 * VR-style 360° product viewer.
 * Users drag to spin the product in any direction — full horizontal 360° + vertical tilt.
 * Includes momentum, auto-rotation, 3D depth, reflection, and ambient shadow.
 */
export default function Product360Viewer({
  src,
  alt,
  className = '',
  sensitivity = 0.55,
  autoRotate = true,
  autoRotateSpeed = 18,
}: Product360ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const rotateY = useRef(0);
  const rotateX = useRef(0);
  const velocityX = useRef(0);
  const velocityY = useRef(0);
  const momentumRaf = useRef<number>(0);
  const autoRotateTween = useRef<gsap.core.Tween | null>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [showHint, setShowHint] = useState(true);

  // Hide hint after 6s
  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, [showHint]);

  // Apply transform to card
  const applyTransform = useCallback((rotX: number, rotY: number) => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = `
      perspective(900px)
      rotateX(${rotX}deg)
      rotateY(${rotY}deg)
      scale3d(1, 1, 1)
    `;
  }, []);

  // Momentum animation loop
  const runMomentum = useCallback(() => {
    if (isDragging.current) {
      momentumRaf.current = requestAnimationFrame(runMomentum);
      return;
    }

    const absVX = Math.abs(velocityX.current);
    const absVY = Math.abs(velocityY.current);

    if (absVX < 0.005 && absVY < 0.005) {
      momentumRaf.current = 0;
      return;
    }

    velocityX.current *= 0.94;
    velocityY.current *= 0.94;

    rotateY.current += velocityX.current;
    rotateX.current += velocityY.current;
    rotateX.current = Math.max(-55, Math.min(55, rotateX.current));

    applyTransform(rotateX.current, rotateY.current);
    momentumRaf.current = requestAnimationFrame(runMomentum);
  }, [applyTransform]);

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    velocityX.current = 0;
    velocityY.current = 0;
    setShowHint(false);

    if (autoRotateTween.current) {
      autoRotateTween.current.kill();
      autoRotateTween.current = null;
    }
    if (momentumRaf.current) {
      cancelAnimationFrame(momentumRaf.current);
      momentumRaf.current = 0;
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;

    const dx = e.clientX - lastX.current;
    const dy = e.clientY - lastY.current;

    velocityX.current = dx * sensitivity;
    velocityY.current = dy * sensitivity;

    rotateY.current += dx * sensitivity;
    rotateX.current += dy * sensitivity;
    rotateX.current = Math.max(-55, Math.min(55, rotateX.current));

    lastX.current = e.clientX;
    lastY.current = e.clientY;

    applyTransform(rotateX.current, rotateY.current);
  }, [sensitivity, applyTransform]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    if (!momentumRaf.current) {
      momentumRaf.current = requestAnimationFrame(runMomentum);
    }
  }, [runMomentum]);

  // Reset rotation
  const handleReset = useCallback(() => {
    velocityX.current = 0;
    velocityY.current = 0;

    if (momentumRaf.current) {
      cancelAnimationFrame(momentumRaf.current);
      momentumRaf.current = 0;
    }
    if (autoRotateTween.current) {
      autoRotateTween.current.kill();
      autoRotateTween.current = null;
    }

    gsap.to(cardRef.current, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.9,
      ease: 'power3.out',
      transformPerspective: 900,
      onComplete: () => {
        rotateX.current = 0;
        rotateY.current = 0;
        // Restart auto-rotate
        if (autoRotate) {
          startAutoRotate();
        }
      },
    });
  }, [autoRotate]);

  // Start auto-rotate
  const startAutoRotate = useCallback(() => {
    if (isDragging.current || !cardRef.current) return;

    autoRotateTween.current = gsap.to(cardRef.current, {
      rotateY: '+=360',
      duration: autoRotateSpeed,
      repeat: -1,
      ease: 'none',
      transformPerspective: 900,
      onUpdate: () => {
        if (!isDragging.current && cardRef.current) {
          // Read current rotation to keep in sync
          const style = getComputedStyle(cardRef.current);
          const matrix = new DOMMatrixReadOnly(style.transform);
          // gsap handles the animation, refs track current state
        }
      },
    });
  }, [autoRotateSpeed]);

  // Manage auto-rotate
  useEffect(() => {
    if (!autoRotate || isDragging.current) return;

    const card = cardRef.current;
    if (!card) return;

    // Small delay before starting
    const timer = setTimeout(() => {
      if (!isDragging.current) startAutoRotate();
    }, 1500);

    return () => {
      clearTimeout(timer);
      if (autoRotateTween.current) {
        autoRotateTween.current.kill();
        autoRotateTween.current = null;
      }
    };
  }, [autoRotate, startAutoRotate]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (momentumRaf.current) cancelAnimationFrame(momentumRaf.current);
      if (autoRotateTween.current) autoRotateTween.current.kill();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative select-none ${className}`}
      style={{ perspective: '900px' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        handlePointerUp();
      }}
    >
      {/* 3D Stage */}
      <div
        className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Ambient floor reflection */}
        <div
          className="absolute bottom-0 left-0 right-0 h-2/5 pointer-events-none"
          style={{
            zIndex: 0,
            background: `
              linear-gradient(to top,
                rgba(201,169,98,0.12) 0%,
                rgba(201,169,98,0.04) 30%,
                transparent 100%
              )
            `,
          }}
        />

        {/* 3D Card */}
        <div
          ref={cardRef}
          className="absolute inset-0 rounded-2xl overflow-hidden"
          style={{
            transformStyle: 'preserve-3d',
            willChange: 'transform',
            cursor: isDragging.current ? 'grabbing' : 'grab',
            zIndex: 1,
            transformOrigin: 'center center',
          }}
        >
          {/* Back face — subtle dark for depth */}
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, #1c1a17 0%, #2e2b26 50%, #1c1a17 100%)',
              transform: 'translateZ(-1px)',
              zIndex: -1,
            }}
          />

          {/* Gold frame edge */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              zIndex: 10,
              border: '1px solid rgba(201,169,98,0.2)',
              boxShadow: 'inset 0 0 80px rgba(201,169,98,0.05)',
            }}
          />

          <Image
            src={src}
            alt={alt}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            draggable={false}
          />

          {/* Dynamic light sweep */}
          {isHovering && !isDragging.current && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                zIndex: 5,
                mixBlendMode: 'soft-light',
                background: `
                  radial-gradient(ellipse at 65% 25%, rgba(255,255,255,0.25) 0%, transparent 55%),
                  radial-gradient(ellipse at 25% 65%, rgba(201,169,98,0.12) 0%, transparent 55%),
                  radial-gradient(ellipse at 75% 80%, rgba(201,169,98,0.06) 0%, transparent 50%)
                `,
              }}
            />
          )}
        </div>

        {/* Dynamic floor shadow */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/4 pointer-events-none"
          style={{
            zIndex: 0,
            background: `
              radial-gradient(
                ellipse at center,
                rgba(0,0,0,0.3) 0%,
                rgba(0,0,0,0.1) 40%,
                transparent 70%
              )
            `,
            transform: 'translateY(40%) scale(0.85)',
          }}
        />

        {/* Hint overlay */}
        {showHint && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, transparent 65%)',
            }}
          >
            <div className="flex flex-col items-center gap-3 text-white/80">
              <div className="relative">
                <RotateCw
                  className="w-10 h-10"
                  style={{ animation: 'spin 3s linear infinite' }}
                />
                <Maximize2 className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gold" />
              </div>
              <span className="text-sm font-medium tracking-wide">Drag to rotate 360°</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="absolute bottom-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ opacity: isHovering ? 1 : 0 }}
      >
        <button
          onClick={handleReset}
          className="p-2.5 bg-background/80 backdrop-blur-sm rounded-full text-gray-400 hover:text-gold hover:bg-background transition-all border border-border/50"
          title="Reset view"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}