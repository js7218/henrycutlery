'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import Image from 'next/image';
import { RotateCw } from 'lucide-react';
import { gsap } from '@/lib/gsap';

interface Product360ViewerProps {
  src: string;
  alt: string;
  className?: string;
  /** Rotation sensitivity (0-1). Default: 0.4 */
  sensitivity?: number;
  /** Enable auto-rotate when idle. Default: false */
  autoRotate?: boolean;
  /** Auto rotation speed in seconds per full rotation. Default: 20 */
  autoRotateSpeed?: number;
}

/**
 * 3D product viewer that allows users to drag-to-rotate the product image.
 * Simulates viewing the product from different angles using perspective transforms.
 */
export default function Product360Viewer({
  src,
  alt,
  className = '',
  sensitivity = 0.4,
  autoRotate = false,
  autoRotateSpeed = 20,
}: Product360ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const rotateY = useRef(0);
  const rotateX = useRef(0);
  const velocityX = useRef(0);
  const velocityY = useRef(0);
  const animationId = useRef<number>(0);
  const autoRotateTween = useRef<gsap.core.Tween | null>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [showHint, setShowHint] = useState(true);

  // Hide hint after first interaction
  useEffect(() => {
    if (!showHint) return;
    const timer = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(timer);
  }, [showHint]);

  // Momentum animation loop
  const animate = useCallback(() => {
    if (isDragging.current) {
      animationId.current = requestAnimationFrame(animate);
      return;
    }

    const absVX = Math.abs(velocityX.current);
    const absVY = Math.abs(velocityY.current);

    if (absVX < 0.01 && absVY < 0.01) {
      animationId.current = 0;
      return;
    }

    // Apply friction
    velocityX.current *= 0.95;
    velocityY.current *= 0.95;

    rotateY.current += velocityX.current;
    rotateX.current += velocityY.current;

    // Clamp X rotation
    rotateX.current = Math.max(-45, Math.min(45, rotateX.current));

    if (imageRef.current) {
      imageRef.current.style.transform = `
        perspective(800px)
        rotateX(${rotateX.current}deg)
        rotateY(${rotateY.current}deg)
        scale3d(1, 1, 1)
      `;
    }

    animationId.current = requestAnimationFrame(animate);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDragging.current = true;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      velocityX.current = 0;
      velocityY.current = 0;
      setShowHint(false);

      // Cancel auto-rotate
      if (autoRotateTween.current) {
        autoRotateTween.current.kill();
        autoRotateTween.current = null;
      }

      // Cancel any existing animation
      if (animationId.current) {
        cancelAnimationFrame(animationId.current);
        animationId.current = 0;
      }

      // Capture pointer for smooth tracking
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;

      const deltaX = e.clientX - lastX.current;
      const deltaY = e.clientY - lastY.current;

      velocityX.current = deltaX * sensitivity;
      velocityY.current = deltaY * sensitivity;

      rotateY.current += deltaX * sensitivity;
      rotateX.current += deltaY * sensitivity;

      // Clamp vertical rotation to prevent flipping
      rotateX.current = Math.max(-45, Math.min(45, rotateX.current));

      lastX.current = e.clientX;
      lastY.current = e.clientY;

      if (imageRef.current) {
        imageRef.current.style.transform = `
          perspective(800px)
          rotateX(${rotateX.current}deg)
          rotateY(${rotateY.current}deg)
          scale3d(1, 1, 1)
        `;
      }
    },
    [sensitivity]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;

    // Start momentum animation
    if (!animationId.current) {
      animationId.current = requestAnimationFrame(animate);
    }
  }, [animate]);

  const handleReset = useCallback(() => {
    velocityX.current = 0;
    velocityY.current = 0;

    if (animationId.current) {
      cancelAnimationFrame(animationId.current);
      animationId.current = 0;
    }

    if (autoRotateTween.current) {
      autoRotateTween.current.kill();
      autoRotateTween.current = null;
    }

    gsap.to(imageRef.current, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.8,
      ease: 'power3.out',
      transformPerspective: 800,
      onUpdate: () => {
        if (imageRef.current) {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(imageRef.current).transform);
          // Extract rotation from matrix for momentum tracking
        }
      },
      onComplete: () => {
        rotateX.current = 0;
        rotateY.current = 0;
      },
    });
  }, []);

  // Auto-rotate
  useEffect(() => {
    if (!autoRotate || isDragging.current) return;

    autoRotateTween.current = gsap.to(imageRef.current, {
      rotateY: '+=360',
      duration: autoRotateSpeed,
      repeat: -1,
      ease: 'none',
      transformPerspective: 800,
      onUpdate: () => {
        if (imageRef.current && !isDragging.current) {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(imageRef.current).transform);
          // Keep current rotation in sync
        }
      },
    });

    return () => {
      if (autoRotateTween.current) {
        autoRotateTween.current.kill();
      }
    };
  }, [autoRotate, autoRotateSpeed]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationId.current) {
        cancelAnimationFrame(animationId.current);
      }
      if (autoRotateTween.current) {
        autoRotateTween.current.kill();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative select-none ${className}`}
      style={{ perspective: '800px' }}
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
        className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-surfaceLight"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Ground reflection plane */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/3 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(201,169,98,0.08) 0%, transparent 100%)',
            zIndex: 0,
          }}
        />

        {/* 3D Image */}
        <div
          ref={imageRef}
          className="absolute inset-0 rounded-2xl overflow-hidden"
          style={{
            transformStyle: 'preserve-3d',
            willChange: 'transform',
            cursor: isDragging.current ? 'grabbing' : 'grab',
            zIndex: 1,
          }}
        >
          {/* Edge highlight */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              zIndex: 10,
              border: '1px solid rgba(201,169,98,0.15)',
              boxShadow: 'inset 0 0 60px rgba(201,169,98,0.06)',
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

          {/* Dynamic light reflection overlay */}
          {isHovering && (
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                zIndex: 5,
                mixBlendMode: 'soft-light',
                background: `
                  radial-gradient(
                    ellipse at 70% 30%,
                    rgba(255,255,255,0.3) 0%,
                    transparent 60%
                  ),
                  radial-gradient(
                    ellipse at 30% 70%,
                    rgba(201,169,98,0.15) 0%,
                    transparent 60%
                  )
                `,
              }}
            />
          )}
        </div>

        {/* Drag hint overlay */}
        {showHint && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 60%)',
            }}
          >
            <div className="flex flex-col items-center gap-2 text-white/70">
              <RotateCw className="w-8 h-8 animate-spin" style={{ animationDuration: '3s' }} />
              <span className="text-sm font-medium tracking-wide">Drag to rotate</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 z-20 flex gap-2">
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