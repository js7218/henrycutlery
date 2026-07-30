'use client';

import { useRef, ReactNode } from 'react';
import { gsap, useGSAP, onAgeVerified } from '@/lib/gsap';

interface TextSplitRevealProps {
  children: string;
  className?: string;
  /** Split by 'chars' or 'words'. Default: 'chars' */
  splitBy?: 'chars' | 'words';
  /** Stagger between each item in seconds. Default: 0.04 */
  stagger?: number;
  /** Duration of each item animation. Default: 0.8 */
  duration?: number;
  /** Delay before starting. Default: 0 */
  delay?: number;
  /** Y offset in px. Default: 100 */
  yOffset?: number;
  /** Rotation in degrees. Default: 0 */
  rotation?: number;
}

/**
 * Splits text into individual characters or words,
 * then animates each one with a staggered reveal.
 * Each char/word wraps in an inline-block span with overflow hidden.
 */
export default function TextSplitReveal({
  children,
  className = '',
  splitBy = 'chars',
  stagger = 0.04,
  duration = 0.8,
  delay = 0,
  yOffset = 100,
  rotation = 0,
}: TextSplitRevealProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!containerRef.current) return;

      const items = containerRef.current.querySelectorAll('[data-split-item]');
      if (items.length === 0) return;

      onAgeVerified(() => {
        gsap.fromTo(
          items,
          {
            yPercent: 100,
            opacity: 0,
            rotation,
          },
          {
            yPercent: 0,
            opacity: 1,
            rotation: 0,
            duration,
            delay,
            stagger,
            ease: 'back.out(1.4)',
            immediateRender: false,
            onStart: () => {
              containerRef.current?.setAttribute('data-gsap-done', 'true');
            },
          }
        );
      });
    },
    { scope: containerRef }
  );

  // Split text into chars or words
  const units =
    splitBy === 'chars'
      ? children.split('')
      : children.split(/\s+/);

  return (
    <span
      ref={containerRef}
      className={className}
      data-gsap-anim
      style={{ display: 'inline-block' }}
    >
      {splitBy === 'chars'
        ? units.map((char, i) => (
            <span
              key={i}
              data-split-item
              style={{
                display: 'inline-block',
                overflow: 'hidden',
                whiteSpace: 'pre',
              }}
            >
              <span style={{ display: 'inline-block' }}>{char}</span>
            </span>
          ))
        : units.map((word, i) => (
            <span
              key={i}
              data-split-item
              style={{
                display: 'inline-block',
                overflow: 'hidden',
                marginRight: '0.25em',
              }}
            >
              <span style={{ display: 'inline-block' }}>{word}</span>
            </span>
          ))}
    </span>
  );
}
