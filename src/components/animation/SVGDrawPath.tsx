'use client';

import { useRef, ReactNode } from 'react';
import { gsap, useGSAP, ScrollTrigger } from '@/lib/gsap';

interface SVGDrawPathProps {
  className?: string;
  /** SVG path data for the knife/blade outline */
  pathData: string;
  /** Width of the SVG viewBox */
  width?: number;
  /** Height of the SVG viewBox */
  height?: number;
  /** Stroke color. Default: gold */
  strokeColor?: string;
  /** Stroke width. Default: 2 */
  strokeWidth?: number;
  /** ScrollTrigger start position. Default: 'top 70%' */
  start?: string;
  /** Duration of the draw animation. Default: 3 */
  duration?: number;
}

/**
 * A Tier: SVG Path Drawing Animation
 * 
 * Draws an SVG path (knife blade outline) progressively as the user scrolls.
 * Uses stroke-dashoffset technique with GSAP ScrollTrigger scrub.
 * 
 * Works perfectly on both mobile and desktop - it's just SVG + CSS.
 */
export default function SVGDrawPath({
  className = '',
  pathData,
  width = 300,
  height = 400,
  strokeColor = '#c9a962',
  strokeWidth = 2,
  start = 'top 70%',
  duration = 3,
}: SVGDrawPathProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useGSAP(
    () => {
      const path = pathRef.current;
      if (!path) return;

      const length = path.getTotalLength();

      // Set up the dash pattern
      gsap.set(path, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });

      // Animate the draw on scroll
      gsap.to(path, {
        strokeDashoffset: 0,
        duration,
        ease: 'none',
        scrollTrigger: {
          trigger: containerRef.current,
          start,
          end: 'bottom 40%',
          scrub: 1.5,
        },
      });

      // Add a glow that follows the drawing tip
      const glow = containerRef.current?.querySelector('[data-path-glow]');
      if (glow) {
        gsap.set(glow, { opacity: 0 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: containerRef.current,
            start,
            end: 'bottom 40%',
            scrub: 1.5,
          },
        });

        tl.to(glow, { opacity: 1, duration: 0.1 })
          .to(glow, { opacity: 0, duration: 0.1 }, duration * 0.9);
      }
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className={className}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="gold-glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c9a962" />
            <stop offset="50%" stopColor="#f0d98a" />
            <stop offset="100%" stopColor="#c9a962" />
          </linearGradient>
        </defs>
        <path
          ref={pathRef}
          d={pathData}
          stroke="url(#gold-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#gold-glow)"
        />
        {/* Glow circle that follows the drawing tip */}
        <circle
          data-path-glow
          r="8"
          fill="#f0d98a"
          opacity="0"
          style={{ filter: 'blur(4px)' }}
        />
      </svg>
    </div>
  );
}
