'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import ThreeDImage from '@/components/animation/ThreeDImage';
import { formatPrice } from '@/lib/utils';
import type { Product } from '@/types';

interface AutoScrollShowcaseProps {
  products: Product[];
  speed?: number; // pixels per second, default 80
  gap?: number;
  className?: string;
}

/**
 * Auto-scrolling product showcase carousel.
 * Continuously scrolls right with a seamless infinite loop.
 * Pauses on hover so the customer can click through.
 */
export default function AutoScrollShowcase({
  products,
  speed = 80,
  gap = 24,
  className = '',
}: AutoScrollShowcaseProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const offsetRef = useRef(0);
  const lastTimeRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const handleImageError = useCallback((productId: string) => {
    setFailedImages((prev) => ({ ...prev, [productId]: true }));
  }, []);

  // RAF-based animation for smooth, reliable auto-scroll
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (!isPaused && delta < 200) {
        offsetRef.current += (speed * delta) / 1000;
        // Loop: when we've scrolled past the first full set, reset
        const singleSetWidth = track.scrollWidth / 2;
        if (offsetRef.current >= singleSetWidth) {
          offsetRef.current -= singleSetWidth;
        }
        track.style.transform = `translateX(${-offsetRef.current}px)`;
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPaused, speed]);

  const doubled = [...products, ...products];

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Gradient fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-16 md:w-24 z-10 pointer-events-none bg-gradient-to-r from-background to-transparent" />
      <div className="absolute right-0 top-0 bottom-0 w-16 md:w-24 z-10 pointer-events-none bg-gradient-to-r from-transparent to-background" />

      {/* Scrolling track */}
      <div
        ref={trackRef}
        className="flex will-change-transform"
        style={{ gap: `${gap}px`, width: 'max-content' }}
      >
        {doubled.map((product, idx) => {
          const imgSrc = failedImages[product.id]
            ? '/products/test-product-placeholder.png'
            : (product.images[0] || '/products/test-product-placeholder.png');

          return (
            <Link
              key={`${product.id}-${idx}`}
              href={`/product/${product.id}`}
              className="group flex-shrink-0 w-[75vw] sm:w-[55vw] md:w-[30vw] lg:w-[24vw] block"
            >
              <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-border hover:border-gold/40 transition-all duration-500 hover:shadow-2xl hover:shadow-gold/5">
                <ThreeDImage
                  src={imgSrc}
                  alt={product.name}
                  fill
                  fillContainer
                  sizes="(max-width: 640px) 75vw, (max-width: 768px) 55vw, (max-width: 1024px) 30vw, 24vw"
                  maxTilt={8}
                  scale={1.02}
                  onError={() => handleImageError(product.id)}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
                {/* Info */}
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                  <p className="text-gold text-[10px] md:text-xs tracking-wider uppercase mb-1.5">
                    {product.category}
                  </p>
                  <h3
                    className="text-sm md:text-lg font-bold text-foreground mb-1.5 leading-tight"
                    style={{ fontFamily: 'Playfair Display, serif' }}
                  >
                    {product.name}
                  </h3>
                  <span className="text-lg md:text-xl font-bold text-gold">
                    {formatPrice(product.price)}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}