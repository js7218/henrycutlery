'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { gsap, useGSAP } from '@/lib/gsap';

interface ParallaxImageProps {
  src: string;
  alt: string;
  /** Speed multiplier. Positive = moves up slower than scroll, negative = moves down. */
  speed?: number;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  sizes?: string;
}

export default function ParallaxImage({
  src,
  alt,
  speed = 0.3,
  className = '',
  imgClassName = '',
  priority = false,
  sizes,
}: ParallaxImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useGSAP(
    () => {
      if (!containerRef.current || !imgRef.current) return;

      const containerHeight = containerRef.current.offsetHeight;
      const imgHeight = imgRef.current.offsetHeight;
      const overflow = Math.max(0, imgHeight - containerHeight);

      gsap.fromTo(
        imgRef.current,
        { y: -overflow * 0.5 },
        {
          y: overflow * 0.5,
          ease: 'none',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: speed,
          },
        }
      );
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <Image
        ref={imgRef}
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={`object-cover ${imgClassName}`}
      />
    </div>
  );
}
