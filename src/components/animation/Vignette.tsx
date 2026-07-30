'use client';

interface VignetteProps {
  /** Edge darkness. 0 = none, 1 = completely black edges. Default: 0.25 */
  intensity?: number;
}

/**
 * A Tier: Cinematic Vignette
 *
 * Subtle darkening at the edges of the screen — like a high-end camera lens.
 * Adds depth and draws the eye to the center content.
 * No animation, no JS, pure CSS gradient. Invisible but felt.
 *
 * Mobile & Desktop: Works identically on both.
 */

export default function Vignette({ intensity = 0.25 }: VignetteProps) {
  return (
    <div
      className="fixed inset-0 z-[85] pointer-events-none"
      style={{
        background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${intensity}) 100%)`,
        mixBlendMode: 'multiply',
      }}
      aria-hidden="true"
    />
  );
}
