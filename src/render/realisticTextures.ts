import * as THREE from 'three';

/**
 * Generates high-quality procedural procedural textures for realistic terrain,
 * water, roads, grass, and paths without external image asset dependencies.
 */

// Helper to create a fast deterministic 2D value noise
function pseudoNoise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;

  // Smoothstep
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = pseudoNoise(i, j);
  const n10 = pseudoNoise(i + 1, j);
  const n01 = pseudoNoise(i, j + 1);
  const n11 = pseudoNoise(i + 1, j + 1);

  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  return nx0 * (1 - sy) + nx1 * sy;
}

function fractalNoise(x: number, y: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let max = 0;

  for (let o = 0; o < octaves; o++) {
    val += smoothNoise(x * freq, y * freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return val / max;
}

/**
 * 1. Realistic Dynamic Water Ripple Normal & Specular Texture
 */
export function createRealisticWaterRippleCanvas(time = 0): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  // Animated wave ripples combining multiple wave angles
  const t1 = time * 0.0018;
  const t2 = time * 0.0012;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const nx = x / size;
      const ny = y / size;

      // Primary gentle wave train
      const w1 = Math.sin((nx * 14 + ny * 10 + t1) * Math.PI * 2);
      // Secondary cross wave train
      const w2 = Math.sin((nx * -10 + ny * 16 + t2) * Math.PI * 2);
      // Micro-choppy caustic ripples
      const w3 = Math.sin((nx * 28 + ny * 24 - t1 * 1.5) * Math.PI * 2) * 0.4;
      const w4 = Math.sin((nx * 36 - ny * 32 + t2 * 1.8) * Math.PI * 2) * 0.3;

      const wave = (w1 * 0.35 + w2 * 0.35 + w3 + w4);

      // Deep aquatic gradient with realistic refraction highlights
      // Deep water: #0b283d (11, 40, 61), Azure transition: #124e78 (18, 78, 120), Shimmer: #38bdf8
      const baseR = 14 + wave * 16;
      const baseG = 65 + wave * 32;
      const baseB = 105 + wave * 45;

      data[idx] = Math.min(255, Math.max(0, Math.round(baseR)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(baseG)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(baseB)));
      data[idx + 3] = 245; // high opacity
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Overlay subtle caustic highlights
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const cx = (i * 37 + time * 12) % size;
    const cy = (i * 53 + time * 8) % size;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 + (i % 3) * 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  return canvas;
}

/**
 * 2. Realistic Grassland, Park & Forest Multi-tonal Textures
 */
export function createRealisticGrassTexture(type: 'grass' | 'park' | 'forest' | 'meadow' = 'grass'): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  // Base palette configurations
  let rBase = 32, gBase = 84, bBase = 42; // standard grass
  let rVar = 18, gVar = 36, bVar = 14;

  if (type === 'park') {
    // Manicured vibrant park lawn
    rBase = 28; gBase = 102; bBase = 48;
    rVar = 16; gVar = 42; bVar = 18;
  } else if (type === 'forest') {
    // Deep mossy woodland floor
    rBase = 16; gBase = 48; bBase = 28;
    rVar = 12; gVar = 24; bVar = 12;
  } else if (type === 'meadow') {
    // Wild dry meadow / pasture
    rBase = 52; gBase = 86; bBase = 40;
    rVar = 24; gVar = 32; bVar = 20;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const nMacro = fractalNoise(x * 0.02, y * 0.02, 3);
      const nMicro = fractalNoise(x * 0.12, y * 0.12, 2);
      const nFine = pseudoNoise(x, y);

      const blend = nMacro * 0.6 + nMicro * 0.3 + nFine * 0.1;

      const r = Math.round(rBase + (blend - 0.5) * rVar * 2);
      const g = Math.round(gBase + (blend - 0.5) * gVar * 2);
      const b = Math.round(bBase + (blend - 0.5) * bVar * 2);

      data[idx] = Math.min(255, Math.max(0, r));
      data[idx + 1] = Math.min(255, Math.max(0, g));
      data[idx + 2] = Math.min(255, Math.max(0, b));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Add subtle blade tufts
  ctx.strokeStyle = 'rgba(74, 145, 68, 0.45)';
  ctx.lineWidth = 1.0;
  for (let i = 0; i < 400; i++) {
    const bx = Math.random() * size;
    const by = Math.random() * size;
    const len = 3 + Math.random() * 4;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(ang) * len, by + Math.sin(ang) * len);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * 3. Realistic Weathered Asphalt Road Texture
 */
export function createRealisticAsphaltTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const nGrain = pseudoNoise(x, y);
      const nAggregate = fractalNoise(x * 0.08, y * 0.08, 3);
      const nWear = fractalNoise(x * 0.015, y * 0.015, 2);

      // Dark weathered bitumen (#2c2e33) with stone aggregate flecks (#4a4e57)
      const base = 44 + nWear * 8 + nAggregate * 14 + (nGrain - 0.5) * 16;
      const r = Math.round(base * 0.94);
      const g = Math.round(base * 0.96);
      const b = Math.round(base * 1.02);

      data[idx] = Math.min(255, Math.max(0, r));
      data[idx + 1] = Math.min(255, Math.max(0, g));
      data[idx + 2] = Math.min(255, Math.max(0, b));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Subtle aggregate micro-specks
  ctx.fillStyle = 'rgba(120, 130, 145, 0.25)';
  for (let i = 0; i < 600; i++) {
    const rx = Math.random() * size;
    const ry = Math.random() * size;
    ctx.fillRect(rx, ry, 1.2, 1.2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * 4. Realistic Pedestrian & Paving Path Texture
 */
export function createRealisticPathTexture(isPaved = true): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  if (isPaved) {
    // Flagstone / Concrete paver grid
    ctx.fillStyle = '#4c525c';
    ctx.fillRect(0, 0, size, size);

    // Stone block grid pattern
    const tileSize = 64;
    ctx.strokeStyle = '#2b2f36';
    ctx.lineWidth = 3;

    for (let x = 0; x < size; x += tileSize) {
      for (let y = 0; y < size; y += tileSize) {
        const stoneNoise = fractalNoise(x * 0.05, y * 0.05, 2);
        const stoneBright = Math.round(75 + stoneNoise * 30);
        ctx.fillStyle = `rgb(${stoneBright}, ${stoneBright + 2}, ${stoneBright + 6})`;
        ctx.fillRect(x + 1.5, y + 1.5, tileSize - 3, tileSize - 3);
      }
    }

    // Grid lines
    for (let x = 0; x <= size; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y <= size; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  } else {
    // Compacted dirt / gravel trail
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const n1 = fractalNoise(x * 0.04, y * 0.04, 3);
        const n2 = pseudoNoise(x, y);
        const v = n1 * 0.7 + n2 * 0.3;

        // Earthy brown-gray (#524639)
        const r = Math.round(72 + v * 30);
        const g = Math.round(62 + v * 26);
        const b = Math.round(52 + v * 22);

        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * 5. Realistic Concrete Curb Texture
 */
export function createRealisticCurbTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#6b7280';
  ctx.fillRect(0, 0, size, size);

  // Micro stone texture
  ctx.fillStyle = 'rgba(240, 244, 248, 0.15)';
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  ctx.fillStyle = 'rgba(30, 35, 45, 0.2)';
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  return texture;
}

/**
 * 6. Base Ground Earth Texture
 */
export function createRealisticGroundEarthTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const n1 = fractalNoise(x * 0.015, y * 0.015, 3);
      const n2 = fractalNoise(x * 0.08, y * 0.08, 2);
      const n3 = pseudoNoise(x, y);

      const val = n1 * 0.6 + n2 * 0.3 + n3 * 0.1;

      // Dark tactical loam / dry soil (#1f2329 to #2a2f38)
      const base = 30 + val * 22;
      const r = Math.round(base * 0.95);
      const g = Math.round(base * 1.0);
      const b = Math.round(base * 0.98);

      data[idx] = Math.min(255, Math.max(0, r));
      data[idx + 1] = Math.min(255, Math.max(0, g));
      data[idx + 2] = Math.min(255, Math.max(0, b));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 24);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
