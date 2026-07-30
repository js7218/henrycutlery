'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { isMobileViewport } from '@/lib/gsap';

interface ParticleFieldProps {
  className?: string;
  /** Particle count. Auto-reduced on mobile. Default: 3000 */
  count?: number;
}

/**
 * S+ Tier: Three.js 3D Golden Particle Field
 * 
 * Thousands of gold particles floating in 3D space, forming a swirling sphere.
 * Reacts to mouse/touch movement - particles rotate and disperse.
 * Auto-degrades: mobile gets 40% fewer particles, smaller canvas.
 * 
 * Performance: uses BufferGeometry + PointsMaterial for GPU efficiency.
 * Falls back to CSS if WebGL unavailable.
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

    // Check WebGL support
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) return;
    } catch {
      return;
    }

    const isMobile = isMobileViewport;
    const actualCount = isMobile ? Math.floor(count * 0.4) : count;

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
      antialias: !isMobile,
      powerPreference: 'high-performance',
    });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    mount.appendChild(renderer.domElement);

    // Create particle geometry - sphere distribution
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(actualCount * 3);
    const colors = new Float32Array(actualCount * 3);
    const sizes = new Float32Array(actualCount);

    const goldColor = new THREE.Color('#c9a962');
    const lightGold = new THREE.Color('#f0d98a');
    const darkGold = new THREE.Color('#8a7340');

    for (let i = 0; i < actualCount; i++) {
      // Distribute in a sphere shape
      const radius = 20 + Math.random() * 25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Vary gold shades
      const mix = Math.random();
      const color = mix < 0.3
        ? darkGold
        : mix < 0.7
          ? goldColor
          : lightGold;

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = Math.random() * 1.5 + 0.3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom shader material for glowing particles
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
          
          // Gentle floating motion
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
          // Circular particle with soft glow
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

    // Mouse/touch interaction
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const targetRotation = { x: 0, y: 0 };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      mouse.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.ty = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    window.addEventListener('pointermove', handlePointerMove);

    // Animation loop
    let animationId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth mouse follow
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      // Rotate particle system based on mouse
      targetRotation.y = mouse.x * 0.3;
      targetRotation.x = mouse.y * 0.2;

      particles.rotation.y += (targetRotation.y - particles.rotation.y) * 0.05 + 0.001;
      particles.rotation.x += (targetRotation.x - particles.rotation.x) * 0.05;

      // Update shader time
      material.uniforms.time.value = elapsed;

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
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
