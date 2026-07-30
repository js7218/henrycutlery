'use client';

import { useRef, useCallback, ReactNode } from 'react';
import Link from 'next/link';
import { gsap, useGSAP, isTouchDevice } from '@/lib/gsap';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'cta';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ThreeDButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  /** Depth of the 3D extrusion in px. Default: 8 */
  depth?: number;
  /** Magnetic pull strength (0-1). Default: 0.25 */
  magneticStrength?: number;
  /** Show icon arrow on hover. Default: false */
  showArrow?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
  xl: 'px-10 py-5 text-xl',
};

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border: string; glow: string; cssClass: string }> = {
  primary: {
    bg: 'linear-gradient(135deg, #c9a962 0%, #d4b978 50%, #c9a962 100%)',
    text: '#1c1a17',
    border: 'rgba(201,169,98,0.5)',
    glow: 'rgba(201,169,98,0.4)',
    cssClass: 'btn-3d-extrude btn-3d-gold',
  },
  secondary: {
    bg: 'linear-gradient(135deg, #2e2b26 0%, #3d3a34 100%)',
    text: '#c9a962',
    border: 'rgba(201,169,98,0.4)',
    glow: 'rgba(201,169,98,0.2)',
    cssClass: 'btn-3d-extrude btn-3d-dark',
  },
  outline: {
    bg: 'transparent',
    text: '#c9a962',
    border: 'rgba(201,169,98,0.5)',
    glow: 'rgba(201,169,98,0.15)',
    cssClass: 'btn-3d-extrude',
  },
  ghost: {
    bg: 'transparent',
    text: '#f5f3ef',
    border: 'transparent',
    glow: 'rgba(255,255,255,0.05)',
    cssClass: '',
  },
  cta: {
    bg: 'linear-gradient(135deg, #c9a962 0%, #e8c97a 30%, #d4b978 60%, #c9a962 100%)',
    text: '#1c1a17',
    border: 'rgba(201,169,98,0.6)',
    glow: 'rgba(201,169,98,0.5)',
    cssClass: 'btn-3d-extrude btn-3d-gold',
  },
};

export default function ThreeDButton({
  children,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  depth = 8,
  magneticStrength = 0.25,
  showArrow = false,
  type = 'button',
}: ThreeDButtonProps) {
  const btnRef = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const isPressed = useRef(false);
  const styles = variantStyles[variant];

  const buildShadow = useCallback(
    (isHovered: boolean, depthOffset: number = 0) => {
      const d = depth + depthOffset;
      const layers: string[] = [];

      if (variant === 'ghost') {
        if (isHovered) {
          layers.push(`0 2px 8px rgba(0,0,0,0.15)`);
          layers.push(`0 0 20px ${styles.glow}`);
        }
        return layers.join(', ');
      }

      if (variant === 'outline') {
        if (isHovered) {
          layers.push(`0 ${d}px 0 rgba(201,169,98,0.15)`);
          layers.push(`0 ${d * 2}px ${d * 3}px rgba(0,0,0,0.25)`);
        } else {
          layers.push(`0 ${d}px 0 rgba(201,169,98,0.1)`);
          layers.push(`0 ${d * 2}px ${d * 3}px rgba(0,0,0,0.2)`);
        }
        layers.push(`0 0 ${isHovered ? 25 : 10}px ${styles.glow}`);
        return layers.join(', ');
      }

      if (isHovered) {
        layers.push(`0 ${d + 2}px 0 rgba(0,0,0,0.25)`);
        layers.push(`0 ${d + 4}px 0 rgba(0,0,0,0.12)`);
        layers.push(`0 ${d * 2 + 4}px ${d * 3 + 10}px rgba(0,0,0,0.35)`);
        if (variant === 'cta') {
          layers.push(`0 0 40px ${styles.glow}`);
          layers.push(`0 0 80px rgba(201,169,98,0.2)`);
        } else {
          layers.push(`0 0 25px ${styles.glow}`);
        }
      } else {
        layers.push(`0 ${d}px 0 rgba(0,0,0,0.3)`);
        layers.push(`0 ${d + 2}px 0 rgba(0,0,0,0.15)`);
        layers.push(`0 ${d * 2}px ${d * 3}px rgba(0,0,0,0.25)`);
        if (variant === 'cta') {
          layers.push(`0 0 20px ${styles.glow}`);
        } else {
          layers.push(`0 0 10px ${styles.glow}`);
        }
      }

      return layers.join(', ');
    },
    [depth, variant, styles.glow]
  );

  // Magnetic hover (desktop only)
  useGSAP(
    () => {
      const btn = btnRef.current;
      if (!btn || isTouchDevice || disabled) return;

      const onMove = (e: MouseEvent) => {
        if (isPressed.current) return;
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        gsap.to(btn, {
          x: x * magneticStrength,
          y: y * magneticStrength - 2,
          duration: 0.4,
          ease: 'power2.out',
        });
      };

      const onLeave = () => {
        if (isPressed.current) return;
        gsap.to(btn, {
          x: 0,
          y: 0,
          duration: 0.5,
          ease: 'elastic.out(1, 0.4)',
        });
      };

      btn.addEventListener('mousemove', onMove);
      btn.addEventListener('mouseleave', onLeave);

      return () => {
        btn.removeEventListener('mousemove', onMove);
        btn.removeEventListener('mouseleave', onLeave);
      };
    },
    { scope: btnRef }
  );

  // Press animation
  const handleMouseDown = useCallback(() => {
    if (disabled || isTouchDevice) return;
    isPressed.current = true;
    const btn = btnRef.current;
    if (!btn) return;

    gsap.to(btn, {
      y: depth,
      x: 0,
      scale: 0.97,
      duration: 0.1,
      ease: 'power2.in',
      onUpdate: () => {
        btn.style.boxShadow = buildShadow(false, -depth);
      },
    });
  }, [disabled, depth, buildShadow]);

  const handleMouseUp = useCallback(() => {
    if (disabled || isTouchDevice) return;
    isPressed.current = false;
    const btn = btnRef.current;
    if (!btn) return;

    gsap.to(btn, {
      y: 0,
      x: 0,
      scale: 1,
      duration: 0.3,
      ease: 'elastic.out(1, 0.5)',
      onUpdate: () => {
        btn.style.boxShadow = buildShadow(false);
      },
    });
  }, [disabled, buildShadow]);

  // Initial shadow
  useGSAP(
    () => {
      const btn = btnRef.current;
      if (!btn) return;
      btn.style.boxShadow = buildShadow(false);
    },
    { scope: btnRef }
  );

  const baseClasses = [
    'inline-flex items-center justify-center font-semibold rounded-lg',
    'cursor-pointer select-none relative',
    'transition-colors duration-200',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    styles.cssClass,
    sizeClasses[size],
    className,
  ].filter(Boolean).join(' ');

  const style: React.CSSProperties = {
    background: variant === 'ghost' ? 'transparent' : styles.bg,
    color: styles.text,
    border: variant === 'ghost' ? 'none' : `1px solid ${styles.border}`,
    backgroundSize: variant === 'cta' ? '200% auto' : undefined,
    willChange: 'transform, box-shadow',
  };

  const content = (
    <>
      <span className="relative z-10 flex items-center gap-2">
        {children}
        {showArrow && (
          <svg
            className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        )}
      </span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link
        ref={btnRef as React.RefObject<HTMLAnchorElement>}
        href={href}
        className={`group ${baseClasses}`}
        style={style}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      ref={btnRef as React.RefObject<HTMLButtonElement>}
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`group ${baseClasses}`}
      style={style}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {content}
    </button>
  );
}