'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';

interface Product3DViewerProps {
  src: string;
  alt: string;
  className?: string;
  /** Rotation sensitivity. Default: 0.005 */
  sensitivity?: number;
  /** Auto-rotate when idle. Default: true */
  autoRotate?: boolean;
  /** Auto rotation speed (radians/sec). Default: 0.3 */
  autoRotateSpeed?: number;
}

/**
 * True 3D product viewer using Three.js.
 * Creates a 3D box with the product image as texture,
 * metallic side edges, realistic lighting, and drag-to-rotate.
 * The product has actual thickness — not just a flat card spinning.
 */
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
  const textureRef = useRef<THREE.Texture | null>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // --- Scene ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // --- Camera ---
    const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 50);
    camera.position.set(0, 0, 7);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // --- Lights ---
    // Ambient — soft fill
    const ambient = new THREE.AmbientLight('#fff5e8', 0.8);
    scene.add(ambient);

    // Key light — from top-right-front
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.5);
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

    // Rim light — from behind-left
    const rimLight = new THREE.DirectionalLight('#c9a962', 0.7);
    rimLight.position.set(-3, 1, -3);
    scene.add(rimLight);

    // Bottom fill — subtle
    const fillLight = new THREE.DirectionalLight('#8899bb', 0.4);
    fillLight.position.set(0, -2, 2);
    scene.add(fillLight);

    // --- Ground plane ---
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- Product group ---
    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // --- Resize handler ---
    const resize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    // --- Render loop ---
    const clock = new THREE.Clock();
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      const dt = Math.min(clock.getDelta(), 0.1);

      if (group) {
        if (!isDragging.current) {
          // Apply momentum friction
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

        // Smooth lerp toward target
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
      if (textureRef.current) textureRef.current.dispose();
    };
  }, [autoRotate, autoRotateSpeed]);

  // Load texture and create 3D object
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Clear previous meshes
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

    if (textureRef.current) {
      textureRef.current.dispose();
      textureRef.current = null;
    }

    setIsLoading(true);
    setHasError(false);

    const loader = new THREE.TextureLoader();
    loader.load(
      src,
      (texture) => {
        textureRef.current = texture;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;

        const aspect = texture.image.width / texture.image.height;
        const height = 3.6;
        const width = height * aspect;
        const depth = 0.22; // visible thickness

        // --- Front face: product image ---
        const frontMat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.35,
          metalness: 0.05,
          color: '#ffffff',
        });

        // --- Side faces: dark metallic edge ---
        const edgeMat = new THREE.MeshStandardMaterial({
          color: '#2a2520',
          roughness: 0.3,
          metalness: 0.7,
        });

        // --- Back face: dark ---
        const backMat = new THREE.MeshStandardMaterial({
          color: '#1a1815',
          roughness: 0.4,
          metalness: 0.5,
        });

        // Build box with different materials per face
        const boxGeo = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
        const materials = [
          edgeMat,    // +X right
          edgeMat,    // -X left
          edgeMat,    // +Y top
          edgeMat,    // -Y bottom
          frontMat,   // +Z front
          backMat,    // -Z back
        ];

        const box = new THREE.Mesh(boxGeo, materials);
        box.castShadow = true;
        box.receiveShadow = true;
        group.add(box);

        // --- Subtle bevel edge (thin frame around front) ---
        const frameGeo = new THREE.BoxGeometry(width + 0.04, height + 0.04, 0.03);
        const frameMat = new THREE.MeshStandardMaterial({
          color: '#c9a962',
          roughness: 0.25,
          metalness: 0.9,
        });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.z = depth / 2 + 0.015;
        frame.castShadow = true;
        group.add(frame);

        setIsLoading(false);
      },
      undefined,
      () => {
        setHasError(true);
        setIsLoading(false);
      }
    );
  }, [src]);

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    velocityX.current = 0;
    velocityY.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
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
  }, [sensitivity]);

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

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surfaceLight/60 z-10">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-surfaceLight z-10">
          <p className="text-gray-400 text-sm">Image failed to load</p>
        </div>
      )}
    </div>
  );
}