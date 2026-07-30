'use client';

import { useRef, useEffect } from 'react';

interface FilmGrainProps {
  /** Opacity of the grain. Default: 0.04 */
  opacity?: number;
}

/**
 * S Tier: Film Grain Overlay
 *
 * Adds subtle animated film grain / noise over the entire viewport.
 * Creates a premium, cinematic texture that makes the site feel like
 * a high-end editorial — not a generic template.
 *
 * Mobile & Desktop: Pure CSS, zero JS overhead.
 * Uses a tiny data-URI noise texture + CSS animation.
 */

export default function FilmGrain({ opacity = 0.04 }: FilmGrainProps) {
  return (
    <div
      className="fixed inset-0 z-[90] pointer-events-none"
      style={{
        opacity,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 200px',
        mixBlendMode: 'overlay',
        animation: 'grain 0.5s steps(10) infinite',
      }}
      aria-hidden="true"
    />
  );
}
