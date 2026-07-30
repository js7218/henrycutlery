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
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
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

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // ── Init scene (runs once) ──────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 30);
    camera.position.set(0, 0, 6.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Lighting
    const ambient = new THREE.AmbientLight('#fff5e8', 0.6);
    scene.add(ambient);

    const key = new THREE.DirectionalLight('#ffffff', 3);
    key.position.set(4, 3, 5);
    key.castShadow = true;
    key.shadow.mapSize.width = 1024;
    key.shadow.mapSize.height = 1024;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0001;
    scene.add(key);

    const rim = new THREE.DirectionalLight('#c9a962', 0.6);
    rim.position.set(-3, 1, -3);
    scene.add(rim);

    const fill = new THREE.DirectionalLight('#8899bb', 0.3);
    fill.position.set(0, -2, 2);
    scene.add(fill);

    // Ground (shadow receiver)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.18 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.4;
    ground.receiveShadow = true;
    scene.add(ground);

    // Product group
    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // Resize
    const resize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    // Render loop
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
            targetRotX.current = Math.max(-0.6, Math.min(0.6, targetRotX.current));
          }
          if (autoRotate) targetRotY.current += autoRotateSpeed * dt;
        }
        currentRotY.current += (targetRotY.current - currentRotY.current) * 0.10;
        currentRotX.current += (targetRotX.current - currentRotX.current) * 0.10;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load texture & build mesh ───────────────────────────────────────────

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Clear previous
    while (group.children.length > 0) {
      const child = group.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
      group.remove(child);
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

        const aspect = texture.image
          ? texture.image.width / texture.image.height
          : 4 / 3;
        const planeH = 3.2;
        const planeW = planeH * aspect;
        const depth = 0.15;

        // ── Front face (product image) ──
        const frontGeo = new THREE.PlaneGeometry(planeW, planeH);
        const frontMat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.35,
          metalness: 0.05,
          color: '#ffffff',
        });
        const frontPlane = new THREE.Mesh(frontGeo, frontMat);
        frontPlane.position.z = depth / 2;
        frontPlane.castShadow = true;
        frontPlane.receiveShadow = true;
        group.add(frontPlane);

        // ── Back plate ──
        const backGeo = new THREE.PlaneGeometry(planeW, planeH);
        const backMat = new THREE.MeshStandardMaterial({
          color: '#1a1815',
          roughness: 0.4,
          metalness: 0.5,
        });
        const backPlane = new THREE.Mesh(backGeo, backMat);
        backPlane.position.z = -depth / 2;
        backPlane.rotation.y = Math.PI;
        backPlane.receiveShadow = true;
        group.add(backPlane);

        // ── Side edges (4 strips) ──
        const edgeMat = new THREE.MeshStandardMaterial({
          color: '#2a2520',
          roughness: 0.3,
          metalness: 0.7,
        });
        const edgeThick = 0.015;

        // top
        const topGeo = new THREE.BoxGeometry(planeW, edgeThick, depth);
        const topEdge = new THREE.Mesh(topGeo, edgeMat);
        topEdge.position.y = planeH / 2;
        group.add(topEdge);

        // bottom
        const bottomGeo = new THREE.BoxGeometry(planeW, edgeThick, depth);
        const bottomEdge = new THREE.Mesh(bottomGeo, edgeMat);
        bottomEdge.position.y = -planeH / 2;
        group.add(bottomEdge);

        // left
        const leftGeo = new THREE.BoxGeometry(edgeThick, planeH, depth);
        const leftEdge = new THREE.Mesh(leftGeo, edgeMat);
        leftEdge.position.x = -planeW / 2;
        group.add(leftEdge);

        // right
        const rightGeo = new THREE.BoxGeometry(edgeThick, planeH, depth);
        const rightEdge = new THREE.Mesh(rightGeo, edgeMat);
        rightEdge.position.x = planeW / 2;
        group.add(rightEdge);

        // ── Gold frame on front ──
        const frameMat = new THREE.MeshStandardMaterial({
          color: '#c9a962',
          roughness: 0.25,
          metalness: 0.9,
        });
        const fw = 0.04; // frame width
        // top bar
        const ftGeo = new THREE.BoxGeometry(planeW + fw * 2, fw, 0.025);
        const ft = new THREE.Mesh(ftGeo, frameMat);
        ft.position.set(0, planeH / 2 + fw / 2, depth / 2 + 0.012);
        ft.castShadow = true;
        group.add(ft);
        // bottom bar
        const fb = new THREE.Mesh(ftGeo, frameMat);
        fb.position.set(0, -planeH / 2 - fw / 2, depth / 2 + 0.012);
        fb.castShadow = true;
        group.add(fb);
        // left bar
        const flGeo = new THREE.BoxGeometry(fw, planeH, 0.025);
        const fl = new THREE.Mesh(flGeo, frameMat);
        fl.position.set(-planeW / 2 - fw / 2, 0, depth / 2 + 0.012);
        fl.castShadow = true;
        group.add(fl);
        // right bar
        const fr = new THREE.Mesh(flGeo, frameMat);
        fr.position.set(planeW / 2 + fw / 2, 0, depth / 2 + 0.012);
        fr.castShadow = true;
        group.add(fr);

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
      targetRotX.current = Math.max(-0.6, Math.min(0.6, targetRotX.current));
      lastX.current = e.clientX;
      lastY.current = e.clientY;
    },
    [sensitivity],
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative select-none ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onMouseLeave={handlePointerUp}
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