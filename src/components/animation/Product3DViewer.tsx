'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Silhouette extraction: detect foreground pixels from a 2D photo   */
/*  and trace a closed polygon outline.                                */
/* ------------------------------------------------------------------ */

const PROCESS_W = 200; // processing resolution width

interface Silhouette {
  outline: [number, number][]; // normalized [0..1] coordinates
  imgW: number;
  imgH: number;
}

function extractSilhouette(img: HTMLImageElement): Silhouette {
  const aspect = img.width / img.height;
  const pw = PROCESS_W;
  const ph = Math.round(PROCESS_W / aspect);
  if (ph < 40) return { outline: [[0, 0], [1, 0], [1, 1], [0, 1]], imgW: img.width, imgH: img.height };

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, pw, ph);
  const data = ctx.getImageData(0, 0, pw, ph).data;

  /* ── Determine background colour from corner / edge samples ── */
  const samples: [number, number, number][] = [];
  const step = Math.max(1, Math.floor(pw / 8));
  for (let x = 0; x < pw; x += step) {
    for (const y of [0, 1, ph - 2, ph - 1]) {
      const i = (y * pw + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  for (let y = 0; y < ph; y += step) {
    for (const x of [0, 1, pw - 2, pw - 1]) {
      const i = (y * pw + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const bgR = samples.reduce((s, c) => s + c[0], 0) / samples.length;
  const bgG = samples.reduce((s, c) => s + c[1], 0) / samples.length;
  const bgB = samples.reduce((s, c) => s + c[2], 0) / samples.length;

  /* ── Build binary mask ── */
  const threshold = 35; // colour distance
  const mask = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      const dr = data[i] - bgR, dg = data[i + 1] - bgG, db = data[i + 2] - bgB;
      mask[y * pw + x] = (dr * dr + dg * dg + db * db > threshold * threshold) ? 1 : 0;
    }
  }

  /* ── Trace outline via row scanning ── */
  // Top half: for each column, find the highest foreground pixel
  const top: [number, number][] = [];
  for (let x = 0; x < pw; x++) {
    for (let y = 0; y < ph; y++) {
      if (mask[y * pw + x]) { top.push([x, y]); break; }
    }
  }
  // Bottom half: for each column, find the lowest foreground pixel (reverse)
  const bottom: [number, number][] = [];
  for (let x = pw - 1; x >= 0; x--) {
    for (let y = ph - 1; y >= 0; y--) {
      if (mask[y * pw + x]) { bottom.push([x, y]); break; }
    }
  }

  if (top.length < 3 || bottom.length < 3) {
    return { outline: [[0, 0], [1, 0], [1, 1], [0, 1]], imgW: img.width, imgH: img.height };
  }

  // Combine: top left→right, then bottom right→left (already reversed)
  const raw = [...top, ...bottom];

  /* ── Simplify (Douglas–Peucker) ── */
  const simplified = simplifyPolyline(raw, 2.0);

  /* ── Normalise to [0..1] ── */
  const norm: [number, number][] = simplified.map(([x, y]) => [x / pw, y / ph]);

  return { outline: norm, imgW: img.width, imgH: img.height };
}

function simplifyPolyline(pts: [number, number][], epsilon: number): [number, number][] {
  if (pts.length < 4) return pts;
  const stack: [number, number][] = [pts[0]];
  let last = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const dx = pts[i][0] - pts[last][0];
    const dy = pts[i][1] - pts[last][1];
    if (dx * dx + dy * dy > epsilon * epsilon) {
      stack.push(pts[i]);
      last = i;
    }
  }
  stack.push(pts[pts.length - 1]);
  return stack;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
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

  /* ── Init Three.js scene ─────────────────────────────────────────── */

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      setHasError(true);
      setIsLoading(false);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1815');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 30);
    camera.position.set(0, 0, 5.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    /* Lighting */
    scene.add(new THREE.AmbientLight('#fff5e8', 0.7));

    const key = new THREE.DirectionalLight('#ffffff', 3.5);
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

    const rim = new THREE.DirectionalLight('#c9a962', 0.8);
    rim.position.set(-3, 1, -3);
    scene.add(rim);

    const fill = new THREE.DirectionalLight('#8899bb', 0.4);
    fill.position.set(0, -2, 2);
    scene.add(fill);

    /* Ground */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.2 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.2;
    ground.receiveShadow = true;
    scene.add(ground);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    /* Resize */
    const resize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    resizeObserverRef.current = new ResizeObserver(() => resize());
    resizeObserverRef.current.observe(container);

    /* Render loop */
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

    requestAnimationFrame(() => resize());
    animate();

    return () => {
      resizeObserverRef.current?.disconnect();
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Load image → extract silhouette → build 3D mesh ─────────────── */

  useEffect(() => {
    const group = groupRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!group || !renderer || !camera || !container) return;

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

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const sil = extractSilhouette(img);
        buildMesh(sil, img);
      } catch {
        setHasError(true);
        setIsLoading(false);
      }
    };
    img.onerror = () => {
      setHasError(true);
      setIsLoading(false);
    };
    img.src = src;

    function buildMesh(sil: Silhouette, image: HTMLImageElement) {
      /* ── Create Three.js Shape from outline ── */
      const shape = new THREE.Shape();
      const pts = sil.outline;
      shape.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
      shape.closePath();

      /* ── Scale to a reasonable world size ── */
      const targetH = 3.2;
      const scale = targetH; // outline is normalised 0..1
      const geoW = sil.imgW / sil.imgH * targetH;

      /* ── Extrude geometry ── */
      const depth = 0.12;
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        steps: 1,
        depth: depth,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 2,
      };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // The shape is 0..1, apply scale and center
      geometry.scale(geoW, targetH, 1);
      geometry.translate(-geoW / 2, -targetH / 2, -depth / 2);
      geometry.computeVertexNormals();

      /* ── Texture ── */
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;

      /* ── Front material (textured) ── */
      const frontMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.35,
        metalness: 0.05,
        color: '#ffffff',
      });

      /* ── Side/back material (metallic) ── */
      const sideMat = new THREE.MeshStandardMaterial({
        color: '#3a3530',
        roughness: 0.25,
        metalness: 0.8,
      });

      /* ── Multi-material mesh ── */
      // ExtrudeGeometry groups: 0=front, 1=back, 2+=sides/bevel
      const mesh = new THREE.Mesh(geometry, [frontMat, sideMat, sideMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      groupRef.current?.add(mesh);

      /* ── Resize ── */
      const ctn = containerRef.current;
      const cam = cameraRef.current;
      const rnd = rendererRef.current;
      if (ctn && rnd && cam) {
        const w = ctn.clientWidth;
        const h = ctn.clientHeight;
        if (w > 0 && h > 0) {
          rnd.setSize(w, h, false);
          cam.aspect = w / h;
          cam.updateProjectionMatrix();
        }
      }

      setIsLoading(false);
    }
  }, [src]);

  /* ── Pointer handlers ─────────────────────────────────────────────── */

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

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div
      ref={containerRef}
      className={className || 'relative w-full h-full'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onMouseLeave={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surfaceLight/60 z-10">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-surfaceLight z-10">
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-2">3D view unavailable</p>
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}