'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product3DViewerProps {
  src: string;
  alt: string;
  className?: string;
  sensitivity?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
}

type Stage = 'loading' | 'removing-bg' | 'building-3d' | 'ready' | 'error';

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
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
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
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

// ─── Contour extraction from alpha mask ─────────────────────────────────────

function extractContourFromAlpha(
  imageData: ImageData,
  gridSize: number = 128,
): THREE.Shape | null {
  const { data, width: iw, height: ih } = imageData;
  const cellW = iw / gridSize;
  const cellH = ih / gridSize;

  // 1. Build binary grid
  const grid: boolean[][] = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(false),
  );

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const sx = Math.floor(gx * cellW);
      const sy = Math.floor(gy * cellH);
      const ex = Math.floor((gx + 1) * cellW);
      const ey = Math.floor((gy + 1) * cellH);
      let sum = 0;
      let n = 0;
      for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
          sum += data[(y * iw + x) * 4 + 3]; // alpha
          n++;
        }
      }
      grid[gy][gx] = sum / n > 80;
    }
  }

  // 2. Find bounding box
  let minX = gridSize, maxX = 0, minY = gridSize, maxY = 0;
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      if (grid[gy][gx]) {
        if (gx < minX) minX = gx;
        if (gx > maxX) maxX = gx;
        if (gy < minY) minY = gy;
        if (gy > maxY) maxY = gy;
      }
    }
  }
  if (minX > maxX) return null;

  // Pad slightly
  minX = Math.max(0, minX - 1);
  maxX = Math.min(gridSize - 1, maxX + 1);
  minY = Math.max(0, minY - 1);
  maxY = Math.min(gridSize - 1, maxY + 1);

  // 3. Find all edge cells
  const edgeSet = new Set<string>();
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      if (!grid[gy][gx]) continue;
      let isEdge = false;
      for (let dy = -1; dy <= 1 && !isEdge; dy++) {
        for (let dx = -1; dx <= 1 && !isEdge; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = gy + dy;
          const nx = gx + dx;
          if (ny < 0 || ny >= gridSize || nx < 0 || nx >= gridSize) {
            isEdge = true;
          } else if (!grid[ny][nx]) {
            isEdge = true;
          }
        }
      }
      if (isEdge) edgeSet.add(`${gx},${gy}`);
    }
  }

  if (edgeSet.size === 0) return null;

  // 4. Moore-neighbor contour tracing
  const contour: { x: number; y: number }[] = [];

  // Find start: topmost-leftmost edge cell
  let sx = gridSize, sy = gridSize;
  for (const key of edgeSet) {
    const [gx, gy] = key.split(',').map(Number);
    if (gy < sy || (gy === sy && gx < sx)) {
      sx = gx;
      sy = gy;
    }
  }

  // 8-direction Moore neighborhood, clockwise starting from "up"
  const dirs = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ];

  let cx = sx, cy = sy;
  let dir = 0; // start looking up
  const visited = new Set<string>();
  const maxSteps = 5000;

  for (let step = 0; step < maxSteps; step++) {
    const key = `${cx},${cy}`;
    contour.push({ x: cx, y: cy });

    if (step > 0 && cx === sx && cy === sy) break;
    visited.add(key);

    // Backtrack direction: look clockwise from behind
    let searchDir = (dir + 5) % 8; // roughly opposite + 1
    let found = false;

    for (let i = 0; i < 8; i++) {
      const d = (searchDir + i) % 8;
      const [dx, dy] = dirs[d];
      const nx = cx + dx;
      const ny = cy + dy;
      const nkey = `${nx},${ny}`;

      if (edgeSet.has(nkey) && (!visited.has(nkey) || (nx === sx && ny === sy && step > 2))) {
        cx = nx;
        cy = ny;
        dir = d;
        found = true;
        break;
      }
    }

    if (!found) break;
  }

  if (contour.length < 3) return null;

  // 5. Simplify
  const simplified = simplifyRDP(contour, 0.6);

  // 6. Create THREE.Shape (normalized to image aspect ratio)
  const aspect = iw / ih;
  const scaleX = aspect / gridSize;
  const scaleY = 1 / gridSize;

  const shape = new THREE.Shape();
  const first = simplified[0];
  // Center the shape
  const cx_ = (maxX + minX) / 2;
  const cy_ = (maxY + minY) / 2;
  shape.moveTo(
    (first.x - cx_) * scaleX,
    -(first.y - cy_) * scaleY,
  );

  for (let i = 1; i < simplified.length; i++) {
    shape.lineTo(
      (simplified[i].x - cx_) * scaleX,
      -(simplified[i].y - cy_) * scaleY,
    );
  }
  shape.closePath();

  return shape;
}

// ─── Dynamic background removal loader ──────────────────────────────────────

let removeBgFn: ((src: string) => Promise<Blob>) | null = null;

async function loadRemoveBg(): Promise<(src: string) => Promise<Blob>> {
  if (removeBgFn) return removeBgFn;
  const mod = await import('@imgly/background-removal');
  removeBgFn = mod.removeBackground as (src: string) => Promise<Blob>;
  return removeBgFn;
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

  const [stage, setStage] = useState<Stage>('loading');

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

    // ── Lighting ──

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

    // ── Ground ──

    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.2 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.6;
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

  // ── Build 3D mesh from product image ────────────────────────────────────

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

    setStage('loading');

    (async () => {
      try {
        // ── Step 1: Remove background ──
        setStage('removing-bg');
        const removeBg = await loadRemoveBg();
        const blob = await removeBg(src);

        if (buildId !== buildIdRef.current) return;

        // Convert blob → ImageData
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.crossOrigin = 'anonymous';
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = URL.createObjectURL(blob);
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (buildId !== buildIdRef.current) return;

        // ── Step 2: Extract contour & build 3D ──
        setStage('building-3d');

        const shape = extractContourFromAlpha(imageData, 128);

        if (buildId !== buildIdRef.current) return;

        if (!shape) {
          // Fallback: use a rounded rectangle shape
          setStage('error');
          return;
        }

        const aspect = img.naturalWidth / img.naturalHeight;
        const shapeW = aspect;
        const shapeH = 1;

        // Extrude settings
        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
          steps: 1,
          depth: 0.18,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.02,
          bevelSegments: 2,
        };

        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // Center the geometry
        geo.computeBoundingBox();
        const bb = geo.boundingBox!;
        const offsetX = -(bb.max.x + bb.min.x) / 2;
        const offsetY = -(bb.max.y + bb.min.y) / 2;
        const offsetZ = -(bb.max.z + bb.min.z) / 2;
        geo.translate(offsetX, offsetY, offsetZ);

        // ── Texture for front face ──
        // Use the original image (with background) for better appearance
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

            // Front material: product image
            const frontMat = new THREE.MeshStandardMaterial({
              map: texture,
              roughness: 0.35,
              metalness: 0.05,
              color: '#ffffff',
            });

            // Side material: gold metallic
            const sideMat = new THREE.MeshStandardMaterial({
              color: '#2a2520',
              roughness: 0.3,
              metalness: 0.7,
            });

            // Bevel material: gold accent
            const bevelMat = new THREE.MeshStandardMaterial({
              color: '#c9a962',
              roughness: 0.22,
              metalness: 0.9,
            });

            // Assign materials by material index
            // ExtrudeGeometry: group 0 = sides, group 1 = front/back
            const mesh = new THREE.Mesh(geo, [sideMat, frontMat]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            // ── Gold outline frame ──
            const frameShape = new THREE.Shape();
            const outlinePts = shape.getPoints(64);
            for (let i = 0; i < outlinePts.length; i++) {
              if (i === 0) frameShape.moveTo(outlinePts[i].x, outlinePts[i].y);
              else frameShape.lineTo(outlinePts[i].x, outlinePts[i].y);
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
              extrudeSettings.depth! / 2 + 0.005,
            );

            const frameMesh = new THREE.Mesh(frameGeo, bevelMat);
            frameMesh.castShadow = true;
            group.add(frameMesh);

            setStage('ready');
          },
          undefined,
          () => {
            setStage('error');
          },
        );
      } catch {
        if (buildId === buildIdRef.current) {
          setStage('error');
        }
      }
    })();
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
      onMouseEnter={() => {}}
      onMouseLeave={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {stage === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surfaceLight/60 z-10 gap-2">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          <p className="text-gray-400 text-xs">Loading image...</p>
        </div>
      )}

      {stage === 'removing-bg' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surfaceLight/60 z-10 gap-2">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          <p className="text-gray-400 text-xs">AI extracting product...</p>
        </div>
      )}

      {stage === 'building-3d' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surfaceLight/60 z-10 gap-2">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          <p className="text-gray-400 text-xs">Building 3D mesh...</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-surfaceLight z-10">
          <p className="text-gray-400 text-sm">Could not build 3D model</p>
        </div>
      )}
    </div>
  );
}