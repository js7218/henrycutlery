'use client';

import { useEffect, useRef } from 'react';

interface ScanLineProps {
  /** Scan line color */
  color?: string;
  /** Scan duration in seconds */
  duration?: number;
  /** Line height in px */
  height?: number;
  className?: string;
}

/**
 * Subtle scan line effect — a thin golden line sweeps from top to bottom.
 * Very unobtrusive, adds a "tech" feel without being distracting.
 */
export default function ScanLine({
  color = 'rgba(201, 169, 98, 0.06)',
  duration = 6,
  height = 2,
  className = '',
}: ScanLineProps) {
  const lineRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = (elapsed % (duration * 1000)) / (duration * 1000);

      line.style.top = `${progress * 100}%`;
      line.style.opacity = progress < 0.05 || progress > 0.95 ? '0' : '1';

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [duration]);

  return (
    <div
      ref={lineRef}
      className={`fixed left-0 right-0 pointer-events-none z-[2] ${className}`}
      style={{
        height: `${height}px`,
        background: `linear-gradient(90deg, transparent 0%, ${color} 20%, ${color} 80%, transparent 100%)`,
        boxShadow: `0 0 ${height * 4}px ${height}px ${color}`,
        willChange: 'top, opacity',
        transition: 'opacity 0.5s ease',
      }}
      aria-hidden="true"
    />
  );
}