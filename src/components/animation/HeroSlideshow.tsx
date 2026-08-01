'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

interface Slide {
  src: string;
  alt: string;
}

interface HeroSlideshowProps {
  slides: Slide[];
  interval?: number; // ms between slides, default 3500
  className?: string;
}

/**
 * Auto-cycling hero slideshow with crossfade.
 * Each slide fades in/out smoothly. Never stops.
 */
export default function HeroSlideshow({
  slides,
  interval = 3500,
  className = '',
}: HeroSlideshowProps) {
  const [current, setCurrent] = useState(0);
  const [failedSlides, setFailedSlides] = useState<Record<number, boolean>>({});

  const handleError = useCallback((idx: number) => {
    setFailedSlides((prev) => ({ ...prev, [idx]: true }));
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, interval);
    return () => clearInterval(timer);
  }, [slides.length, interval]);

  if (slides.length === 0) return null;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {slides.map((slide, idx) => {
        if (failedSlides[idx]) return null;
        return (
          <div
            key={idx}
            className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
            style={{ opacity: idx === current ? 1 : 0 }}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              priority={idx === 0}
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-cover"
              onError={() => handleError(idx)}
            />
          </div>
        );
      })}
    </div>
  );
}