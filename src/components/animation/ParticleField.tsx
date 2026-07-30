'use client';

import { useRef, useEffect, useState } from 'react';
import { getIsMobile } from '@/lib/gsap';

interface ParticleFieldProps {
  className?: string;
  /** Particle count. Auto-reduced on mobile. Default: 3000 */
  count?: number;
}

/**
 * S+ Tier: 3D Golden Particle Field
 *
 * Golden particles floating in 3D space, forming a swirling sphere.
 * Reacts to touch/mouse movement.
 *
 * Mobile: Uses Canvas 2D fallback with larger, brighter particles.
 * Desktop: Uses Three.js WebGL with shader effects.
 *
 * Falls back to pure CSS radial glow if canvas/WebGL unavailable.
 */
export default function ParticleField({
  className = '',
  count = 3000,
}: ParticleFieldProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const isMobile = getIsMobile();

    // ---- Mobile: Canvas 2D fallback (more reliable, brighter) ----
    if (isMobile) {
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      mount.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const resize = () => {
        canvas.width = mount.clientWidth;
        canvas.height = mount.clientHeight;
      };
      resize();
      window.addEventListener('resize', resize);

      // Mobile: fewer but larger, brighter particles
      const particleCount = 80;
      const particles = Array.from({ length: particleCount }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 3 + 1.5,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: (Math.random() - 0.5) * 0.3 - 0.1,
        life: Math.random(),
        lifeSpeed: 0.003 + Math.random() * 0.005,
        hue: 40 + Math.random() * 15,
      }));

      let rafId: number;
      let touchX = canvas.width / 2;
      let touchY = canvas.height / 2;

      const handleTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (touch) {
          const rect = mount.getBoundingClientRect();
          touchX = touch.clientX - rect.left;
          touchY = touch.clientY - rect.top;
        }
      };
      mount.addEventListener('touchmove', handleTouchMove, { passive: true });

      const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const p of particles) {
          // Move
          p.x += p.speedX;
          p.y += p.speedY;

          // Gentle attraction to touch point
          const dx = touchX - p.x;
          const dy = touchY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150 && dist > 0) {
            p.x += dx * 0.002;
            p.y += dy * 0.002;
          }

          // Wrap around edges
          if (p.x < -20) p.x = canvas.width + 20;
          if (p.x > canvas.width + 20) p.x = -20;
          if (p.y < -20) p.y = canvas.height + 20;
          if (p.y > canvas.height + 20) p.y = -20;

          // Pulse life
          p.life += p.lifeSpeed;
          if (p.life > 1 || p.life < 0) p.lifeSpeed = -p.lifeSpeed;
          const alpha = 0.3 + Math.abs(p.life) * 0.7;

          // Glow
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6);
          glow.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${alpha * 0.6})`);
          glow.addColorStop(0.4, `hsla(${p.hue}, 70%, 55%, ${alpha * 0.2})`);
          glow.addColorStop(1, `hsla(${p.hue}, 70%, 45%, 0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 6, 0, Math.PI * 2);
          ctx.fill();

          // Core
          ctx.fillStyle = `hsla(${p.hue}, 90%, 80%, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }

        rafId = requestAnimationFrame(animate);
      };

      animate();

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', resize);
        mount.removeEventListener('touchmove', handleTouchMove);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      };
    }

    // ---- Desktop: Three.js WebGL ----
    // Check WebGL support
    let gl: WebGLRenderingContext | null = null;
    try {
      const testCanvas = document.createElement('canvas');
      gl = (testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    } catch {
      // Fall through to CSS fallback
    }

    if (!gl) {
      // CSS fallback: radial glow
      mount.innerHTML = `
        <div style="
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, rgba(201, 169, 98, 0.15) 0%, transparent 70%);
          animation: pulse 4s ease-in-out infinite;
        "></div>
      `;
      return;
    }

    // Dynamically import Three.js (desktop only)
    import('three').then((THREE) => {
      const actualCount = Math.floor(count * 0.7);

      // Scene setup
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        60,
        mount.clientWidth / mount.clientHeight,
        0.1,
        1000
      );
      camera.position.z = 50;

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mount.appendChild(renderer.domElement);

      // Create particle geometry
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(actualCount * 3);
      const colors = new Float32Array(actualCount * 3);
      const sizes = new Float32Array(actualCount);

      const goldColor = new THREE.Color('#c9a962');
      const lightGold = new THREE.Color('#f0d98a');
      const darkGold = new THREE.Color('#8a7340');

      for (let i = 0; i < actualCount; i++) {
        const radius = 20 + Math.random() * 25;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);

        const mix = Math.random();
        const color = mix < 0.3 ? darkGold : mix < 0.7 ? goldColor : lightGold;
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        sizes[i] = Math.random() * 1.5 + 0.3;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          pixelRatio: { value: renderer.getPixelRatio() },
        },
        vertexShader: `
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          uniform float time;
          uniform float pixelRatio;
          void main() {
            vColor = color;
            vec3 pos = position;
            pos.x += sin(time * 0.3 + position.y * 0.1) * 2.0;
            pos.y += cos(time * 0.2 + position.x * 0.1) * 2.0;
            pos.z += sin(time * 0.4 + position.z * 0.1) * 1.5;
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
            alpha = pow(alpha, 1.5);
            gl_FragColor = vec4(vColor, alpha * 0.8);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const particles = new THREE.Points(geometry, material);
      scene.add(particles);

      const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

      const handlePointerMove = (e: PointerEvent) => {
        const rect = mount.getBoundingClientRect();
        mouse.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.ty = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      };
      window.addEventListener('pointermove', handlePointerMove);

      let animationId: number;
      const clock = new THREE.Clock();

      const animate = () => {
        animationId = requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();

        mouse.x += (mouse.tx - mouse.x) * 0.05;
        mouse.y += (mouse.ty - mouse.y) * 0.05;

        particles.rotation.y += (mouse.x * 0.3 - particles.rotation.y) * 0.05 + 0.001;
        particles.rotation.x += (mouse.y * 0.2 - particles.rotation.x) * 0.05;

        material.uniforms.time.value = elapsed;
        renderer.render(scene, camera);
      };

      animate();

      const handleResize = () => {
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
      };
      window.addEventListener('resize', handleResize);

      // Store cleanup on mount ref for later
      (mount as any)._cleanup = () => {
        cancelAnimationFrame(animationId);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('resize', handleResize);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    });

    return () => {
      if ((mount as any)._cleanup) {
        (mount as any)._cleanup();
      }
    };
  }, [count]);

  return (
    <div
      ref={mountRef}
      className={`absolute inset-0 ${className}`}
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    />
  );
}
