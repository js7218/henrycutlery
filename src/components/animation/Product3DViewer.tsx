'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';

interface Product3DViewerProps {
  src: string;
  alt: string;
  className?: string;
  sensitivity?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
}

// ─── Displacement map generator ──────────────────────────────────────────────
// Converts the product image into a depth map where darker pixels (product)
// become raised and lighter pixels (background) become recessed.
// Returns a canvas + the original aspect ratio.
function generateDisplacementMap(
  img: HTMLImageElement,
  maxDim = 512,
): { canvas: HTMLCanvasElement; aspect: number } | null {
  try {
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w === 0 || h === 0) return null;

    const aspect = w / h;

    // Scale down to keep performance reasonable
    if (Math.max(w, h) > maxDim) {
      if (w > h) {
        h = Math.round(maxDim / aspect);
        w = maxDim;
      } else {
        w = Math.round(maxDim * aspect);
        h = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Perceived luminance
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

      // Invert: dark product → raised, light background → recessed
      const inv = 255 - lum;

      // S-curve contrast: push mid-tones away from 128
      // This sharpens the product silhouette while keeping smooth gradients
      const t = inv / 255;
      const enhanced = 255 * (t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2);

      data[i] = data[i + 1] = data[i + 2] = Math.round(enhanced);
    }

    ctx.putImageData(imageData, 0, 0);

    // Simple 3x3 box blur to soften hard edges
    const blurred = document.createElement('canvas');
    blurred.width = w;
    blurred.height = h;
    const bCtx = blurred.getContext('2d');
    if (bCtx) {
      bCtx.filter = 'blur(3px)';
      bCtx.drawImage(canvas, 0, 0);
      return { canvas: blurred, aspect };
    }

    return { canvas, aspect };
  } catch {
    return null;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Product3DViewer({
  src,
  alt,
  className = '',
  sensitivity = 0.005,
  autoRotate = true,
  autoRotateSpeed = 0.3,
}: Product3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const velocityX = useRef(0);
  const velocityY = useRef(0);
  const targetRotY = useRef(0);
  const targetRotX = useRef(0);
  const currentRotY = useRef(0);
  const currentRotX = useRef(0);
  const dispCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // ── Scene initialisation ─────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 50);
    camera.position.set(0, 0.15, 7);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // ── Lights ──

    const ambient = new THREE.AmbientLight('#fff5e8', 0.7);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#ffffff', 3.0);
    keyLight.position.set(5, 4, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // Rim light — grazing angle to accent the 3D relief
    const rimLight = new THREE.DirectionalLight('#c9a962', 0.6);
    rimLight.position.set(-3, 1, -3);
    scene.add(rimLight);

    // Fill from below — lifts shadows
    const fillLight = new THREE.DirectionalLight('#8899bb', 0.35);
    fillLight.position.set(0, -2, 2);
    scene.add(fillLight);

    // ── Ground ──

    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.22 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.8;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Product group ──

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // ── Resize ──

    const resize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    // ── Render loop ──

    const clock = new THREE.Clock();
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      const dt = Math.min(clock.getDelta(), 0.1);

      if (group) {
        if (!isDragging.current) {
          velocityX.current *= 0.95;
          velocityY.current *= 0.95;

          if (Math.abs(velocityX.current) > 0.0001 || Math.abs(velocityY.current) > 0.0001) {
            targetRotY.current += velocityX.current;
            targetRotX.current += velocityY.current;
            targetRotX.current = Math.max(-0.8, Math.min(0.8, targetRotX.current));
          }

          if (autoRotate) {
            targetRotY.current += autoRotateSpeed * dt;
          }
        }

        currentRotY.current += (targetRotY.current - currentRotY.current) * 0.12;
        currentRotX.current += (targetRotX.current - currentRotX.current) * 0.12;

        group.rotation.y = currentRotY.current;
        group.rotation.x = currentRotX.current;
      }

      renderer.render(scene, camera);
    };

    resize();
    animate();

    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (dispCanvasRef.current) {
        dispCanvasRef.current = null;
      }
    };
  }, [autoRotate, autoRotateSpeed]);

  // ── Load texture + build displaced 3D geometry ──────────────────────────

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Clear previous
    while (group.children.length > 0) {
      const child = group.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
      group.remove(child);
    }

    // Dispose old displacement canvas
    if (dispCanvasRef.current) {
      dispCanvasRef.current = null;
    }

    setIsLoading(true);
    setHasError(false);

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    loader.load(
      src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;

        const img = texture.image as HTMLImageElement;
        const aspect = img.naturalWidth / img.naturalHeight;
        const planeH = 3.6;
        const planeW = planeH * aspect;

        // ── Generate displacement map ──
        const dispResult = generateDisplacementMap(img, 512);
        let dispTexture: THREE.CanvasTexture | null = null;

        if (dispResult) {
          dispCanvasRef.current = dispResult.canvas;
          dispTexture = new THREE.CanvasTexture(dispResult.canvas);
          dispTexture.colorSpace = THREE.NoColorSpace;
          dispTexture.minFilter = THREE.LinearMipmapLinearFilter;
          dispTexture.magFilter = THREE.LinearFilter;
          dispTexture.generateMipmaps = true;
        }

        // ── Subdivided plane geometry ──
        const segments = 200;
        const geo = new THREE.PlaneGeometry(planeW, planeH, segments, segments);

        // ── Material with displacement ──
        const mat = new THREE.MeshStandardMaterial({
          map: texture,
          displacementMap: dispTexture,
          displacementScale: 0.18,
          displacementBias: 0,
          roughness: 0.4,
          metalness: 0.06,
          color: '#ffffff',
          side: THREE.DoubleSide,
        });

        const frontPlane = new THREE.Mesh(geo, mat);
        frontPlane.castShadow = true;
        frontPlane.receiveShadow = true;
        group.add(frontPlane);

        // ── Backing plane (dark, gives substance when viewing from behind) ──
        const backGeo = new THREE.PlaneGeometry(planeW, planeH);
        const backMat = new THREE.MeshStandardMaterial({
          color: '#1a1815',
          roughness: 0.5,
          metalness: 0.4,
          side: THREE.DoubleSide,
        });
        const backPlane = new THREE.Mesh(backGeo, backMat);
        backPlane.position.z = -0.25;
        backPlane.receiveShadow = true;
        group.add(backPlane);

        // ── Gold bevel frame around front face ──
        const frameGeo = new THREE.BoxGeometry(planeW + 0.06, planeH + 0.06, 0.04);
        const frameMat = new THREE.MeshStandardMaterial({
          color: '#c9a962',
          roughness: 0.22,
          metalness: 0.92,
        });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.z = 0.12;
        frame.castShadow = true;
        group.add(frame);

        // ── Thin edge strip (side perimeter) ──
        const edgeThickness = 0.015;
        // Top edge
        const topGeo = new THREE.BoxGeometry(planeW + 0.04, edgeThickness, 0.22);
        const topEdge = new THREE.Mesh(topGeo, frameMat);
        topEdge.position.y = planeH / 2 + 0.02;
        topEdge.position.z = -0.01;
        group.add(topEdge);

        // Bottom edge
        const bottomGeo = new THREE.BoxGeometry(planeW + 0.04, edgeThickness, 0.22);
        const bottomEdge = new THREE.Mesh(bottomGeo, frameMat);
        bottomEdge.position.y = -planeH / 2 - 0.02;
        bottomEdge.position.z = -0.01;
        group.add(bottomEdge);

        // Left edge
        const leftGeo = new THREE.BoxGeometry(edgeThickness, planeH + 0.04, 0.22);
        const leftEdge = new THREE.Mesh(leftGeo, frameMat);
        leftEdge.position.x = -planeW / 2 - 0.02;
        leftEdge.position.z = -0.01;
        group.add(leftEdge);

        // Right edge
        const rightGeo = new THREE.BoxGeometry(edgeThickness, planeH + 0.04, 0.22);
        const rightEdge = new THREE.Mesh(rightGeo, frameMat);
        rightEdge.position.x = planeW / 2 + 0.02;
        rightEdge.position.z = -0.01;
        group.add(rightEdge);

        setIsLoading(false);
      },
      undefined,
      () => {
        setHasError(true);
        setIsLoading(false);
      },
    );
  }, [src]);

  // ── Pointer handlers ────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    velocityX.current = 0;
    velocityY.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastX.current;
      const dy = e.clientY - lastY.current;
      velocityX.current = dx * sensitivity;
      velocityY.current = dy * sensitivity;
      targetRotY.current += dx * sensitivity;
      targetRotX.current += dy * sensitivity;
      targetRotX.current = Math.max(-0.8, Math.min(0.8, targetRotX.current));
      lastX.current = e.clientX;
      lastY.current = e.clientY;
    },
    [sensitivity],
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`relative select-none ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        handlePointerUp();
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surfaceLight/60 z-10">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-surfaceLight z-10">
          <p className="text-gray-400 text-sm">Image failed to load</p>
        </div>
      )}
    </div>
  );
}