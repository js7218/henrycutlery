'use client';

import { useRef, useEffect, ReactNode } from 'react';

interface UniversalRevealProps {
  children: ReactNode;
  className?: string;
  /** Animation type. Default: 'fade-up' */
  anim?: 'fade-up' | 'fade-in' | 'scale-in' | 'slide-left' | 'slide-right';
  /** Stagger delay in seconds for child elements. Default: 0 */
  stagger?: number;
  /** Root margin for IntersectionObserver. Default: '0px 0px -50px 0px' */
  rootMargin?: string;
  /** Threshold. Default: 0.1 */
  threshold?: number;
}

/**
 * UNIVERSAL REVEAL — Works on ALL browsers, ALL devices.
 *
 * Uses IntersectionObserver (supported on 97%+ of browsers including
 * iOS Safari 12+, Android Chrome, Samsung Internet, WeChat, UC, etc.)
 * to add CSS classes when elements enter the viewport.
 *
 * ZERO dependencies: no GSAP, no Canvas, no WebGL.
 * Pure DOM + CSS. Falls back to immediately visible if observer fails.
 */
export default function UniversalReveal({
  children,
  className = '',
  anim = 'fade-up',
  stagger = 0,
  rootMargin = '0px 0px -40px 0px',
  threshold = 0.1,
}: UniversalRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('revealed');
      el.querySelectorAll('[data-reveal-child]').forEach((c) =>
        c.classList.add('revealed')
      );
      return;
    }

    const animClass = `anim-${anim}`;

    // If no IntersectionObserver support, show immediately
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('revealed', animClass);
      el.querySelectorAll('[data-reveal-child]').forEach((c) =>
        c.classList.add('revealed', animClass)
      );
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('revealed', animClass);

            // Stagger children
            const children = el.querySelectorAll('[data-reveal-child]');
            children.forEach((child, i) => {
              const htmlChild = child as HTMLElement;
              const childAnim = htmlChild.dataset.revealAnim
                ? `anim-${htmlChild.dataset.revealAnim}`
                : animClass;
              const childDelay = stagger > 0
                ? i * stagger
                : parseFloat(htmlChild.dataset.revealDelay || '0');

              setTimeout(() => {
                htmlChild.classList.add('revealed', childAnim);
              }, childDelay * 1000);
            });

            observer.unobserve(el);
          }
        });
      },
      { rootMargin, threshold }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [anim, stagger, rootMargin, threshold]);

  return (
    <div ref={ref} className={className} data-reveal-container>
      {children}
    </div>
  );
}

/**
 * Wrap a single child element for staggered reveals.
 * Usage: <UniversalReveal stagger={0.1}>
 *   <RevealChild>Item 1</RevealChild>
 *   <RevealChild>Item 2</RevealChild>
 * </UniversalReveal>
 */
export function RevealChild({
  children,
  className = '',
  anim,
  delay,
}: {
  children: ReactNode;
  className?: string;
  anim?: string;
  delay?: number;
}) {
  return (
    <div
      className={className}
      data-reveal-child
      data-reveal-anim={anim}
      data-reveal-delay={delay}
    >
      {children}
    </div>
  );
}