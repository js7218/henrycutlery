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

// ─── RDP polygon simplification ─────────────────────────────────────────────

function simplifyRDP(
  points: { x: number; y: number }[],
  epsilon: number,
): { x: number; y: number }[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = simplifyRDP(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyRDP(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function perpDist(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// ─── Foreground mask from edge detection + flood fill ───────────────────────

function extractForegroundMask(
  imageData: ImageData,
  gridSize: number = 128,
): { grid: boolean[][]; minX: number; maxX: number; minY: number; maxY: number } | null {
  const { data, width: iw, height: ih } = imageData;
  const cellW = iw / gridSize;
  const cellH = ih / gridSize;

  // 1. Compute average color per cell
  type CellInfo = { r: number; g: number; b: number; count: number };
  const cells: CellInfo[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => ({ r: 0, g: 0, b: 0, count: 0 })),
  );

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const sx = Math.floor(gx * cellW);
      const sy = Math.floor(gy * cellH);
      const ex = Math.floor((gx + 1) * cellW);
      const ey = Math.floor((gy + 1) * cellH);
      const c = cells[gy][gx];
      for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
          const i = (y * iw + x) * 4;
          c.r += data[i];
          c.g += data[i + 1];
          c.b += data[i + 2];
          c.count++;
        }
      }
    }
  }

  // 2. Estimate background color from border cells (top row, bottom row, left/right columns)
  let bgR = 0, bgG = 0, bgB = 0, bgN = 0;
  const sampleBg = (gy: number, gx: number) => {
    const c = cells[gy][gx];
    if (c.count > 0) {
      bgR += c.r / c.count;
      bgG += c.g / c.count;
      bgB += c.b / c.count;
      bgN++;
    }
  };
  // Top & bottom rows
  for (let gx = 0; gx < gridSize; gx++) {
    sampleBg(0, gx);
    sampleBg(gridSize - 1, gx);
  }
  // Left & right columns (skip corners, already sampled)
  for (let gy = 1; gy < gridSize - 1; gy++) {
    sampleBg(gy, 0);
    sampleBg(gy, gridSize - 1);
  }

  if (bgN === 0) return null;
  bgR /= bgN; bgG /= bgN; bgB /= bgN;

  // 3. Build foreground mask: cells that differ from background
  const threshold = 35; // color distance threshold
  const grid: boolean[][] = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(false),
  );

  let minX = gridSize, maxX = 0, minY = gridSize, maxY = 0;

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const c = cells[gy][gx];
      if (c.count === 0) continue;
      const cr = c.r / c.count;
      const cg = c.g / c.count;
      const cb = c.b / c.count;
      const dist = Math.sqrt(
        (cr - bgR) ** 2 + (cg - bgG) ** 2 + (cb - bgB) ** 2,
      );
      if (dist > threshold) {
        grid[gy][gx] = true;
        if (gx < minX) minX = gx;
        if (gx > maxX) maxX = gx;
        if (gy < minY) minY = gy;
        if (gy > maxY) maxY = gy;
      }
    }
  }

  if (minX > maxX) return null;

  // 4. Flood fill from center of bounding box to fill holes
  const cx = Math.floor((minX + maxX) / 2);
  const cy = Math.floor((minY + maxY) / 2);

  // Find the closest foreground cell to center
  let bestDist = Infinity;
  let seedX = cx, seedY = cy;
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      if (grid[gy][gx]) {
        const d = (gx - cx) ** 2 + (gy - cy) ** 2;
        if (d < bestDist) {
          bestDist = d;
          seedX = gx;
          seedY = gy;
        }
      }
    }
  }

  if (bestDist === Infinity) return null;

  // BFS flood fill — only keep the connected component
  const visited = new Set<string>();
  const queue: [number, number][] = [[seedX, seedY]];
  visited.add(`${seedX},${seedY}`);
  const cleanGrid: boolean[][] = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(false),
  );

  // Also expand: fill in "holes" — cells surrounded by foreground
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      if (!grid[gy][gx]) {
        // Check if this cell is surrounded by foreground cells
        let fgNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ny = gy + dy, nx = gx + dx;
            if (ny >= 0 && ny < gridSize && nx >= 0 && nx < gridSize && grid[ny][nx]) {
              fgNeighbors++;
            }
          }
        }
        if (fgNeighbors >= 6) {
          grid[gy][gx] = true;
        }
      }
    }
  }

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    cleanGrid[y][x] = true;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;

    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        const key = `${nx},${ny}`;
        if (grid[ny][nx] && !visited.has(key)) {
          visited.add(key);
          queue.push([nx, ny]);
        }
      }
    }
  }

  // Pad
  minX = Math.max(0, minX - 1);
  maxX = Math.min(gridSize - 1, maxX + 1);
  minY = Math.max(0, minY - 1);
  maxY = Math.min(gridSize - 1, maxY + 1);

  return { grid: cleanGrid, minX, maxX, minY, maxY };
}

// ─── Contour extraction from binary grid ────────────────────────────────────

function extractContour(
  grid: boolean[][],
  minX: number, maxX: number, minY: number, maxY: number,
  gridSize: number,
  aspect: number,
): THREE.Shape | null {
  // Find edge cells
  const edgeSet = new Set<string>();
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      if (!grid[gy][gx]) continue;
      let isEdge = false;
      for (let dy = -1; dy <= 1 && !isEdge; dy++) {
        for (let dx = -1; dx <= 1 && !isEdge; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = gy + dy, nx = gx + dx;
          if (ny < 0 || ny >= gridSize || nx < 0 || nx >= gridSize || !grid[ny][nx]) {
            isEdge = true;
          }
        }
      }
      if (isEdge) edgeSet.add(`${gx},${gy}`);
    }
  }
  if (edgeSet.size === 0) return null;

  // Moore-neighbor tracing
  let sx = gridSize, sy = gridSize;
  for (const key of edgeSet) {
    const [gx, gy] = key.split(',').map(Number);
    if (gy < sy || (gy === sy && gx < sx)) { sx = gx; sy = gy; }
  }

  const dirs = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ];

  let cx = sx, cy = sy, dir = 0;
  const visited = new Set<string>();
  const contour: { x: number; y: number }[] = [];

  for (let step = 0; step < 5000; step++) {
    contour.push({ x: cx, y: cy });
    if (step > 0 && cx === sx && cy === sy) break;
    visited.add(`${cx},${cy}`);

    let searchDir = (dir + 5) % 8;
    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (searchDir + i) % 8;
      const [dx, dy] = dirs[d];
      const nx = cx + dx, ny = cy + dy;
      const nkey = `${nx},${ny}`;
      if (edgeSet.has(nkey) && (!visited.has(nkey) || (nx === sx && ny === sy && step > 2))) {
        cx = nx; cy = ny; dir = d; found = true; break;
      }
    }
    if (!found) break;
  }

  if (contour.length < 3) return null;

  const simplified = simplifyRDP(contour, 0.6);

  const scaleX = aspect / gridSize;
  const scaleY = 1 / gridSize;
  const centerX = (maxX + minX) / 2;
  const centerY = (maxY + minY) / 2;

  const shape = new THREE.Shape();
  shape.moveTo(
    (simplified[0].x - centerX) * scaleX,
    -(simplified[0].y - centerY) * scaleY,
  );
  for (let i = 1; i < simplified.length; i++) {
    shape.lineTo(
      (simplified[i].x - centerX) * scaleX,
      -(simplified[i].y - centerY) * scaleY,
    );
  }
  shape.closePath();

  return shape;
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
  const buildIdRef = useRef(0);

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // ── Scene init ──────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 50);
    camera.position.set(0, 0.15, 7);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Lights
    const ambient = new THREE.AmbientLight('#fff5e8', 0.75);
    scene.add(ambient);

    const key = new THREE.DirectionalLight('#ffffff', 3.5);
    key.position.set(5, 4, 5);
    key.castShadow = true;
    key.shadow.mapSize.width = 1024;
    key.shadow.mapSize.height = 1024;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0001;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    const rim = new THREE.DirectionalLight('#c9a962', 0.7);
    rim.position.set(-3, 1, -3);
    scene.add(rim);

    const fill = new THREE.DirectionalLight('#8899bb', 0.35);
    fill.position.set(0, -2, 2);
    scene.add(fill);

    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.2 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.6;
    ground.receiveShadow = true;
    scene.add(ground);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    const resize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

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
          if (autoRotate) targetRotY.current += autoRotateSpeed * dt;
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
    };
  }, [autoRotate, autoRotateSpeed]);

  // ── Build 3D mesh ───────────────────────────────────────────────────────

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const buildId = ++buildIdRef.current;

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

    setIsLoading(true);
    setHasError(false);

    // Load image → extract foreground → build 3D extrusion
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (buildId !== buildIdRef.current) return;

      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const aspect = w / h;

      // Draw to canvas and extract foreground mask
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);

      if (buildId !== buildIdRef.current) return;

      const mask = extractForegroundMask(imageData, 128);

      if (buildId !== buildIdRef.current) return;

      let shape: THREE.Shape | null = null;

      if (mask) {
        shape = extractContour(
          mask.grid, mask.minX, mask.maxX, mask.minY, mask.maxY, 128, aspect,
        );
      }

      if (!shape) {
        // Fallback: rounded rectangle
        const rw = aspect * 0.9;
        const rh = 0.9;
        const rr = 0.06;
        shape = new THREE.Shape();
        shape.moveTo(-rw / 2 + rr, -rh / 2);
        shape.lineTo(rw / 2 - rr, -rh / 2);
        shape.quadraticCurveTo(rw / 2, -rh / 2, rw / 2, -rh / 2 + rr);
        shape.lineTo(rw / 2, rh / 2 - rr);
        shape.quadraticCurveTo(rw / 2, rh / 2, rw / 2 - rr, rh / 2);
        shape.lineTo(-rw / 2 + rr, rh / 2);
        shape.quadraticCurveTo(-rw / 2, rh / 2, -rw / 2, rh / 2 - rr);
        shape.lineTo(-rw / 2, -rh / 2 + rr);
        shape.quadraticCurveTo(-rw / 2, -rh / 2, -rw / 2 + rr, -rh / 2);
      }

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        steps: 1,
        depth: 0.18,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.02,
        bevelSegments: 2,
      };

      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      geo.translate(
        -(bb.max.x + bb.min.x) / 2,
        -(bb.max.y + bb.min.y) / 2,
        -(bb.max.z + bb.min.z) / 2,
      );

      // Load original image as texture
      const texLoader = new THREE.TextureLoader();
      texLoader.crossOrigin = 'anonymous';

      texLoader.load(
        src,
        (texture) => {
          if (buildId !== buildIdRef.current) return;

          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;

          const frontMat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.35,
            metalness: 0.05,
            color: '#ffffff',
          });

          const sideMat = new THREE.MeshStandardMaterial({
            color: '#2a2520',
            roughness: 0.3,
            metalness: 0.7,
          });

          const bevelMat = new THREE.MeshStandardMaterial({
            color: '#c9a962',
            roughness: 0.22,
            metalness: 0.9,
          });

          const mesh = new THREE.Mesh(geo, [sideMat, frontMat]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);

          // Gold outline frame
          const frameShape = new THREE.Shape();
          const outlinePts = shape!.getPoints(64);
          frameShape.moveTo(outlinePts[0].x, outlinePts[0].y);
          for (let i = 1; i < outlinePts.length; i++) {
            frameShape.lineTo(outlinePts[i].x, outlinePts[i].y);
          }
          frameShape.closePath();

          const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
            steps: 1,
            depth: 0.015,
            bevelEnabled: false,
          });
          frameGeo.computeBoundingBox();
          const fbb = frameGeo.boundingBox!;
          frameGeo.translate(
            -(fbb.max.x + fbb.min.x) / 2,
            -(fbb.max.y + fbb.min.y) / 2,
            (extrudeSettings.depth ?? 0.18) / 2 + 0.005,
          );

          const frameMesh = new THREE.Mesh(frameGeo, bevelMat);
          frameMesh.castShadow = true;
          group.add(frameMesh);

          setIsLoading(false);
        },
        undefined,
        () => {
          if (buildId === buildIdRef.current) {
            setHasError(true);
            setIsLoading(false);
          }
        },
      );
    };

    img.onerror = () => {
      if (buildId === buildIdRef.current) {
        setHasError(true);
        setIsLoading(false);
      }
    };

    img.src = src;
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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surfaceLight/60 z-10 gap-2">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          <p className="text-gray-400 text-xs">Building 3D model...</p>
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