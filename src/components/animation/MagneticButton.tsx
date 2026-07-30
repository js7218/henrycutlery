'use client';

import { useRef, ReactNode } from 'react';
import { gsap, useGSAP, isTouchDevice } from '@/lib/gsap';

interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  href?: string;
  strength?: number;
  onClick?: (e: React.MouseEvent) => void;
}

export default function MagneticButton({
  children,
  className = '',
  href,
  strength = 0.3,
  onClick,
}: MagneticButtonProps) {
  const btnRef = useRef<HTMLElement>(null);

  useGSAP(
    (context, contextSafe) => {
      const btn = btnRef.current;
      if (!btn) return;

      // Skip magnetic effect on touch devices – no cursor to track
      if (isTouchDevice) return;

      const onMove = contextSafe!((e: MouseEvent) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        gsap.to(btn, {
          x: x * strength,
          y: y * strength,
          duration: 0.4,
          ease: 'power2.out',
        });
      });

      const onLeave = contextSafe!(() => {
        gsap.to(btn, {
          x: 0,
          y: 0,
          duration: 0.5,
          ease: 'elastic.out(1, 0.4)',
        });
      });

      btn.addEventListener('mousemove', onMove);
      btn.addEventListener('mouseleave', onLeave);

      return () => {
        btn.removeEventListener('mousemove', onMove);
        btn.removeEventListener('mouseleave', onLeave);
      };
    },
    { scope: btnRef }
  );

  if (href) {
    return (
      <a
        ref={btnRef as React.RefObject<HTMLAnchorElement>}
        href={href}
        className={`inline-block ${className}`}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={btnRef as React.RefObject<HTMLButtonElement>}
      className={className}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
