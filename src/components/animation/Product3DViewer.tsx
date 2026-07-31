'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Silhouette extraction: flood fill + morphological cleanup          */
/* ------------------------------------------------------------------ */

const PROCESS_W = 200;

interface Silhouette {
  outline: [number, number][];
  imgW: number;
  imgH: number;
}

/**
 * Flood-fill from image edges to identify background pixels.
 * Works on both solid-color and textured backgrounds (bark, wood, etc.)
 * by using an adaptive threshold based on background color variance.
 */
function extractSilhouette(img: HTMLImageElement): Silhouette {
  const aspect = img.width / img.height;
  const pw = PROCESS_W;
  const ph = Math.round(PROCESS_W / aspect);
  if (ph < 40) {
    return { outline: [[0, 0], [1, 0], [1, 1], [0, 1]], imgW: img.width, imgH: img.height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, pw, ph);
  const data = ctx.getImageData(0, 0, pw, ph).data;

  /* ── Sample background pixels from all 4 edges ── */
  const samples: [number, number, number][] = [];
  // Top & bottom edges
  for (let x = 0; x < pw; x++) {
    for (const y of [0, 1, ph - 2, ph - 1]) {
      const i = (y * pw + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  // Left & right edges
  for (let y = 0; y < ph; y++) {
    for (const x of [0, 1, pw - 2, pw - 1]) {
      const i = (y * pw + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  const n = samples.length;
  const bgR = samples.reduce((s, c) => s + c[0], 0) / n;
  const bgG = samples.reduce((s, c) => s + c[1], 0) / n;
  const bgB = samples.reduce((s, c) => s + c[2], 0) / n;

  // Compute variance to determine adaptive threshold
  const varR = samples.reduce((s, c) => s + (c[0] - bgR) ** 2, 0) / n;
  const varG = samples.reduce((s, c) => s + (c[1] - bgG) ** 2, 0) / n;
  const varB = samples.reduce((s, c) => s + (c[2] - bgB) ** 2, 0) / n;
  const maxStd = Math.sqrt(Math.max(varR, varG, varB));

  // Adaptive threshold: tighter for uniform backgrounds, looser for textured ones
  const threshold = Math.max(25, Math.min(80, 2 * maxStd + 15));

  /* ── Flood fill from edges ── */
  // 0 = unchecked, 1 = background (filled), 2 = foreground (product)
  const mask = new Uint8Array(pw * ph);

  // BFS queue
  const queue: number[] = [];

  function isBackground(idx: number): boolean {
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    return dr * dr + dg * dg + db * db <= threshold * threshold;
  }

  // Seed: all edge pixels
  for (let x = 0; x < pw; x++) {
    for (const y of [0, ph - 1]) {
      const idx = y * pw + x;
      if (mask[idx] === 0 && isBackground(idx * 4)) {
        mask[idx] = 1;
        queue.push(idx);
      }
    }
  }
  for (let y = 1; y < ph - 1; y++) {
    for (const x of [0, pw - 1]) {
      const idx = y * pw + x;
      if (mask[idx] === 0 && isBackground(idx * 4)) {
        mask[idx] = 1;
        queue.push(idx);
      }
    }
  }

  // BFS
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % pw;
    const y = Math.floor(idx / pw);

    // 4-way neighbors
    const neighbors: [number, number][] = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= pw || ny < 0 || ny >= ph) continue;
      const nidx = ny * pw + nx;
      if (mask[nidx] === 0 && isBackground(nidx * 4)) {
        mask[nidx] = 1;
        queue.push(nidx);
      }
    }
  }

  // Any unchecked pixel is foreground
  for (let i = 0; i < pw * ph; i++) {
    if (mask[i] === 0) mask[i] = 2;
  }

  /* ── Morphological closing (dilate + erode) to fill holes ── */
  const closed = morphologicalClose(mask, pw, ph, 2);

  /* ── Trace outline via column scanning ── */
  const top: [number, number][] = [];
  for (let x = 0; x < pw; x++) {
    for (let y = 0; y < ph; y++) {
      if (closed[y * pw + x] === 2) { top.push([x, y]); break; }
    }
  }
  const bottom: [number, number][] = [];
  for (let x = pw - 1; x >= 0; x--) {
    for (let y = ph - 1; y >= 0; y--) {
      if (closed[y * pw + x] === 2) { bottom.push([x, y]); break; }
    }
  }

  if (top.length < 3 || bottom.length < 3) {
    return { outline: [[0, 0], [1, 0], [1, 1], [0, 1]], imgW: img.width, imgH: img.height };
  }

  const raw = [...top, ...bottom];
  const simplified = simplifyPolyline(raw, 2.0);
  const norm: [number, number][] = simplified.map(([x, y]) => [x / pw, y / ph]);

  return { outline: norm, imgW: img.width, imgH: img.height };
}

function morphologicalClose(
  mask: Uint8Array, w: number, h: number, iterations: number,
): Uint8Array {
  let result = new Uint8Array(mask);
  for (let iter = 0; iter < iterations; iter++) {
    // Dilate
    const dilated = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (result[y * w + x] === 2) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                dilated[ny * w + nx] = 2;
              }
            }
          }
        }
      }
    }
    // Erode
    const eroded = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let allFg = true;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) { allFg = false; break; }
            if (dilated[ny * w + nx] !== 2) { allFg = false; break; }
          }
          if (!allFg) break;
        }
        if (allFg) eroded[y * w + x] = 2;
      }
    }
    result = eroded;
  }
  return result;
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
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    // Brighter background — warm grey instead of near-black
    scene.background = new THREE.Color('#3a3530');
    scene.fog = new THREE.Fog('#3a3530', 8, 22);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 30);
    camera.position.set(0, 0, 5.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    /* Lighting — brighter overall */
    scene.add(new THREE.AmbientLight('#fff8f0', 1.0));

    const key = new THREE.DirectionalLight('#ffffff', 4.0);
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

    const rim = new THREE.DirectionalLight('#c9a962', 1.0);
    rim.position.set(-3, 1, -3);
    scene.add(rim);

    const backLight = new THREE.DirectionalLight('#8899cc', 0.6);
    backLight.position.set(0, 0.5, -4);
    scene.add(backLight);

    const fill = new THREE.DirectionalLight('#aabbcc', 0.5);
    fill.position.set(0, -1.5, 2);
    scene.add(fill);

    /* Ground — softer shadow */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.15 }),
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

      /* ── Front material (full-brightness texture) ── */
      const frontMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.3,
        metalness: 0.05,
        color: '#ffffff',
      });

      /* ── Back material (same texture, darkened) ── */
      const backMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.35,
        metalness: 0.1,
        color: '#555555', // darkens the texture ~67%
      });

      /* ── Side material (metallic edge) ── */
      const sideMat = new THREE.MeshStandardMaterial({
        color: '#5a5550',
        roughness: 0.2,
        metalness: 0.9,
      });

      /* ── Multi-material mesh ── */
      // ExtrudeGeometry groups: 0=front, 1=back, 2+=sides/bevel
      const mesh = new THREE.Mesh(geometry, [frontMat, backMat, sideMat]);
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