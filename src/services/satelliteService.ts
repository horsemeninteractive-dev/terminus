import * as THREE from 'three';
import { GeoPoint } from '../types/map';
import type { SatelliteQuality } from '../types/saveGame';

const EARTH_RADIUS = 6378137; // meters (WGS84)
const RAD = Math.PI / 180;

// Endpoint + budget tuning -------------------------------------------------
// ArcGIS World_Imagery delivers 256px tiles; zoom 16 ≈ 1.22 m/px, 17 ≈ 0.61,
// 18 ≈ 0.30, 19 ≈ 0.15. The canvas is always sized to the full square map
// extent (the maps are 8km x 8km squares, matching mapData.bounds), and the
// tile plan covers that ENTIRE square at zoom 17 base (~0.61 m/px) with two
// sharper square bands layered over the centre: zoom 18 in the central 30%-side
// band and zoom 19 in the central 10%-side core. Every point of the square is
// covered; nothing is left to the old coarse zoom-16 base.
const PER_TILE_TIMEOUT_MS = 6000; // per endpoint attempt
const STREAM_DEADLINE_MS = 90000; // keep streaming tiles up to this long
const INITIAL_RENDER_MS = 2500; // return the texture after this much wall time
const WORKERS = 12; // concurrent tile fetches

// Per-tier render profiles. The maps are 8km x 8km squares matching
// mapData.bounds; each tier keeps full-square coverage and only trades how
// dense the base tier + focal bands are.
interface SatelliteProfile {
  density: number; // canvas pixels per meter for mid-size sectors (capped at CANVAS_MAX)
  maxTiles: number; // hard cap on tile fetches per texture
  baseZoom: number; // zoom covering the ENTIRE square
  midZoom: number; // focal square band zoom (30%-side band)
  coreZoom: number; // focal square core zoom (10%-side core)
  midBand: number; // mid band half-length as fraction of terrain size
  coreBand: number; // core half-length as fraction of terrain size
}
const SATELLITE_PROFILES: Record<SatelliteQuality, SatelliteProfile> = {
  performance: {
    density: 1.3,
    maxTiles: 1300,
    baseZoom: 16,
    midZoom: 17,
    coreZoom: 18,
    midBand: 0.12,
    coreBand: 0.05,
  },
  balanced: {
    density: 2.2,
    maxTiles: 3600,
    baseZoom: 17,
    midZoom: 18,
    coreZoom: 19,
    midBand: 0.15,
    coreBand: 0.05,
  },
  detail: {
    density: 2.6,
    maxTiles: 5600,
    baseZoom: 17,
    midZoom: 18,
    coreZoom: 19,
    midBand: 0.2,
    coreBand: 0.08,
  },
};

// Canvas pixel budget. The old single 8192px canvas stretched across an 8km
// sector at ~1.07 m/px, so even native zoom-17/18 tiles were downsampled into
// visible pixel blocks. Quadrupling to 16384 for large sectors drops the base
// sampling to ~0.54 m/px and lets the focal zoom tiers actually reach the
// screen at native density. Mid-size sectors are sized to match the zoom-18
// source (~0.30–0.45 m/px) so their whole canvas is natively sharp.
const CANVAS_MAX = 16384;

/**
 * Estimated GPU memory cost of the satellite canvas texture for a quality tier
 * and terrain extent, in bytes. Uses the exact same canvas sizing as
 * loadSatelliteTexture (density × terrain size, clamped to [4096, CANVAS_MAX])
 * and assumes RGBA8 (4 bytes/px) plus the mipmap chain (~1.33×).
 */
export function estimateSatelliteVram(
  quality: SatelliteQuality,
  terrainSizeMeters: number
): number {
  const profile = SATELLITE_PROFILES[quality] || SATELLITE_PROFILES.balanced;
  const canvasSize = Math.min(CANVAS_MAX, Math.max(4096, Math.round(terrainSizeMeters * profile.density)));
  const pixels = canvasSize * canvasSize;
  return Math.round(pixels * 4 * 1.33); // RGBA8 + mip chain
}

/**
 * Probes the device's GPU/CPU/memory capabilities and returns the satellite
 * quality tier to default to on first launch (when no save/preference exists
 * yet). Deterministic per machine: integrated or software GPUs and low memory
 * fall back to 'performance'; discrete GPUs with ample RAM/VRAM get 'detail'.
 * Callers can always override with the in-game LOW/MED/HIGH picker.
 */
export function detectSatelliteQuality(): SatelliteQuality {
  let gpuScore = 0;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl') || null) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = (dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '').toLowerCase();
      if (renderer) {
        if (/nvidia|geforce|rtx|gtx|quadro|firepro|radeon rx|rx\s*\d|arc a|apple m\d|apple m[1-9]/i.test(renderer)) gpuScore = 2;
        else if (/intel|iris|uhd|hd graphics|mali|adreno|powervr|llvmpipe|swiftshader|software|basic display/i.test(renderer)) gpuScore = 0;
        else gpuScore = 1; // unknown dedicated-class GPU
      }
      // The 8 km maps at MED/HIGH need a 16384² canvas; if the GPU can't, cap it.
      if ((gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) >= 16384) gpuScore = Math.max(gpuScore, 1);
    }
  } catch {
    /* WebGL unavailable (headless/SSR) — fall through to CPU heuristics */
  }

  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;

  let score = gpuScore;
  if (typeof deviceMemory === 'number') {
    if (deviceMemory >= 8) score += 1;
    else if (deviceMemory < 4) score -= 1;
  }
  if (cores >= 8) score += 1;
  else if (cores <= 2) score -= 1;

  if (score >= 3) return 'detail';
  if (score >= 1) return 'balanced';
  return 'performance';
}

/**
 * Generates or fetches high-resolution satellite imagery covering the exact
 * terrain mesh bounding box, sharpest near the map centre (zoom-tiered) and
 * streamed in so the overlay appears quickly and sharpens live.
 *
 * Matches local Cartesian meter coordinates (X: East, -Z: North) with
 * sub-pixel precision. The returned CanvasTexture is cached and reused; its
 * canvas keeps receiving tiles in the background after the promise resolves.
 */
export async function loadSatelliteTexture(
  center: GeoPoint,
  terrainSizeMeters: number,
  quality: SatelliteQuality = 'balanced'
): Promise<THREE.CanvasTexture> {
  const profile = SATELLITE_PROFILES[quality] || SATELLITE_PROFILES.balanced;
  const maxTiles = profile.maxTiles;
  const cacheKey = `${CANVAS_VERSION}_${quality}_${center.lat.toFixed(5)}_${center.lon.toFixed(5)}_${Math.round(terrainSizeMeters)}`;
  const cached = satelliteCache.get(cacheKey);
  if (cached) return cached;

  // Canvas density per tier (capped at CANVAS_MAX for 8 km sectors).
  const canvasSize = Math.min(CANVAS_MAX, Math.max(4096, Math.round(terrainSizeMeters * profile.density)));
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  satelliteCache.set(cacheKey, texture);

  if (!ctx) return texture;

  // Paint the dark tactical foundation so un-fetched areas read as terrain
  // rather than black.
  ctx.fillStyle = '#1c221e';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  const halfSize = terrainSizeMeters / 2;
  const avgLatRad = center.lat * RAD;

  // Exact geographic corners of the 3D terrain mesh:
  // North is -Z in 3D world, South is +Z; West -X, East +X.
  const latNW = center.lat + halfSize / (RAD * EARTH_RADIUS);
  const lonNW = center.lon - halfSize / (RAD * EARTH_RADIUS * Math.cos(avgLatRad));
  const latSE = center.lat - halfSize / (RAD * EARTH_RADIUS);
  const lonSE = center.lon + halfSize / (RAD * EARTH_RADIUS * Math.cos(avgLatRad));

  // -------------------------------------------------------------------
  // Square tier bands covering the FULL square extent (no circular "rings"):
  //   base : covers the ENTIRE square — every corner gets imagery
  //   mid  : focal square band
  //   core : focal square core
  // Bands are square (axis-aligned around the map centre, matching the square
  // map bounds), mutually exclusive, and drawn smallest-first so sharper tiles
  // always win where they overlap. Sizes/zooms come from the quality profile.
  const baseZoom = profile.baseZoom;
  const coreHalf = terrainSizeMeters * profile.coreBand;
  const midHalf = terrainSizeMeters * profile.midBand;
  const coreZoom = profile.coreZoom;
  const midZoom = profile.midZoom;

  interface TilePlan { tx: number; ty: number; zoom: number; }
  const plan: TilePlan[] = [];

  const collectSquare = (
    zoom: number,
    halfExtentM: number,
    excludeInnerHalfM: number
  ) => {
    const latN = center.lat + halfExtentM / (RAD * EARTH_RADIUS);
    const lonW = center.lon - halfExtentM / (RAD * EARTH_RADIUS * Math.cos(avgLatRad));
    const latS = center.lat - halfExtentM / (RAD * EARTH_RADIUS);
    const lonE = center.lon + halfExtentM / (RAD * EARTH_RADIUS * Math.cos(avgLatRad));
    const nw = latLonToTile(latN, lonW, zoom);
    const se = latLonToTile(latS, lonE, zoom);
    const minX = Math.min(nw.x, se.x);
    const maxX = Math.max(nw.x, se.x);
    const minY = Math.min(nw.y, se.y);
    const maxY = Math.max(nw.y, se.y);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (excludeInnerHalfM > 0) {
          // Skip tiles fully inside the sharper inner square.
          const c = tileCenterLatLon(tx, ty, zoom);
          const dx = Math.abs(c.lon - center.lon) * RAD * EARTH_RADIUS * Math.cos(avgLatRad);
          const dz = Math.abs(c.lat - center.lat) * RAD * EARTH_RADIUS;
          if (dx < excludeInnerHalfM && dz < excludeInnerHalfM) continue;
        }
        plan.push({ tx, ty, zoom });
      }
    }
  };

  // core (innermost, sharpest) — covers itself fully.
  if (coreHalf > 0) collectSquare(coreZoom, coreHalf, 0);
  // mid — cover the 30% band minus the core square.
  if (midHalf > coreHalf) collectSquare(midZoom, midHalf, coreHalf);
  // base — the ENTIRE square extent minus the mid band, so every corner of the
  // 8km x 8km map gets satellite imagery (at least zoom 16/17).
  collectSquare(baseZoom, halfSize, midHalf);

  if (plan.length === 0) return texture;

  // Prioritise tiles near the centre (where the camera/hq are) so the first
  // frames of the stream show the area the player actually looks at sharpest.
  plan.sort((a, b) => {
    const da = tileCenterDistanceM(a, center, avgLatRad);
    const db = tileCenterDistanceM(b, center, avgLatRad);
    return da - db;
  });
  plan.length = Math.min(plan.length, maxTiles);

  // ------------------------------------------------------------- stream
  const queue = plan.slice();
  let successCount = 0;
  let lastFlush = performance.now();
  const started = performance.now();

  // The stream and the camera-follow re-burn share the same canvas, so leave
  // the canvas/context/center state on the module for updateSatelliteCamera.
  registerSatelliteContext({
    canvas,
    ctx,
    texture,
    center,
    terrainSizeMeters,
    currentQuality: quality,
  });

  const workers = Array.from({ length: WORKERS }, async () => {
    while (queue.length > 0 && performance.now() - started < STREAM_DEADLINE_MS) {
      const item = queue.shift();
      if (!item) break;
      const img = await fetchTileImageCached(item.tx, item.ty, item.zoom);
      if (img && ctx) {
        try {
          drawTileFromCache(img, item.tx, item.ty, item.zoom);
          successCount++;
        } catch {
          // ignore draw errors for a single tile
        }
      }
      if (performance.now() - lastFlush > 250) {
        lastFlush = performance.now();
        texture.needsUpdate = true;
      }
      // Allow the surrounding frame work to interleave with the fetch waves.
      await new Promise((r) => setTimeout(r, 0));
    }
  });

  // Let the first (centre-priority) tiles land, then return so the overlay
  // appears quickly. The workers are NOT awaited to completion: they keep
  // streaming the remaining tiles into the canvas in the background, flushing
  // needsUpdate so the layer sharpens live until the queue drains or the
  // streaming deadline hits.
  await Promise.race([
    Promise.all(workers),
    new Promise((r) => setTimeout(r, INITIAL_RENDER_MS)),
  ]);

  // Offline fallback only when nothing at all arrived in the initial window.
  if (successCount === 0) {
    const grad = ctx.createRadialGradient(
      canvasSize / 2,
      canvasSize / 2,
      50,
      canvasSize / 2,
      canvasSize / 2,
      canvasSize * 0.7
    );
    grad.addColorStop(0, '#28332a');
    grad.addColorStop(0.5, '#202923');
    grad.addColorStop(1, '#151b17');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    for (let i = 0; i < 800; i++) {
      const px = Math.random() * canvasSize;
      const py = Math.random() * canvasSize;
      const pw = 6 + Math.random() * 32;
      const ph = 6 + Math.random() * 32;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(42, 58, 46, 0.45)' : 'rgba(30, 40, 34, 0.45)';
      ctx.fillRect(px, py, pw, ph);
    }
  }

  texture.needsUpdate = true;
  return texture;
}

const satelliteCache = new Map<string, THREE.CanvasTexture>();
const CANVAS_VERSION = 'v5-quality'; // bump when canvas size / sampling changes

function latLonToTile(lat: number, lon: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function tileToLatLon(x: number, y: number, zoom: number) {
  const n = 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lon };
}

function tileCenterLatLon(tx: number, ty: number, zoom: number): GeoPoint {
  const nw = tileToLatLon(tx, ty, zoom);
  const se = tileToLatLon(tx + 1, ty + 1, zoom);
  return { lat: (nw.lat + se.lat) / 2, lon: (nw.lon + se.lon) / 2 };
}

function tileCenterDistanceM(
  tile: { tx: number; ty: number; zoom: number },
  center: GeoPoint,
  avgLatRad: number): number {
  const c = tileCenterLatLon(tile.tx, tile.ty, tile.zoom);
  const dLat = (c.lat - center.lat) * RAD * EARTH_RADIUS;
  const dLon = (c.lon - center.lon) * RAD * EARTH_RADIUS * Math.cos(avgLatRad);
  return Math.hypot(dLat, dLon);
}

// ---------------------------------------------------------------------------
// Camera-follow re-burn: the sharpest focal bands track the camera instead of
// staying fixed at the map centre. Tiles are cached on fetCh by tile key so
// panning back over an area reuses the images instead of refetching, and the
// re-burn draws them directly into the SAME canvas the initial plan streams
// into (smallest zoom drawn last so sharper tiles always win).
// ---------------------------------------------------------------------------

interface SatelliteContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  center: GeoPoint;
  terrainSizeMeters: number;
  currentQuality: SatelliteQuality;
}

let satelliteContext: SatelliteContext | null = null;
let lastCameraX = 0;
let lastCameraZ = 0;
let cameraBurnedAt = 0;
let cameraBusy = false;

/**
 * The initial plan-stream registers the live canvas here on first load so
 * updateSatelliteCamera can draw into the same texture while the camera pans.
 */
function registerSatelliteContext(state: SatelliteContext) {
  satelliteContext = state;
  lastCameraX = 0;
  lastCameraZ = 0;
  cameraBurnedAt = 0;
  cameraBusy = false;
}

/** Cache of fetched tile images shared by the plan stream and camera re-burn. */
const tileImageCache = new Map<string, HTMLImageElement>();
const TILE_CACHE_LIMIT = 12000; // ~256px tiles ≈ tens of MB; LRU-evicted

function tileKey(tx: number, ty: number, zoom: number) {
  return zoom + '/' + ty + '/' + tx;
}

/** Fetches a tile image, reusing the shared cache (LRU-capped). */
async function fetchTileImageCached(
  tx: number,
  ty: number,
  zoom: number
): Promise<HTMLImageElement | null> {
  const key = tileKey(tx, ty, zoom);
  const hit = tileImageCache.get(key);
  if (hit) {
    // refresh LRU ordering
    tileImageCache.delete(key);
    tileImageCache.set(key, hit);
    return hit;
  }
  const img = await fetchTileImageHttp(tx, ty, zoom);
  if (img) {
    tileImageCache.set(key, img);
    if (tileImageCache.size > TILE_CACHE_LIMIT) {
      const oldest = tileImageCache.keys().next().value;
      if (oldest !== undefined) tileImageCache.delete(oldest);
    }
  }
  return img;
}

function fetchTileImageHttp(
  tx: number,
  ty: number,
  zoom: number
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const endpoints = [
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`,
      `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`,
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`,
    ];
    let epIndex = 0;
    const tryNext = () => {
      if (epIndex >= endpoints.length) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => {
        epIndex++;
        tryNext();
      }, PER_TILE_TIMEOUT_MS);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        epIndex++;
        tryNext();
      };
      img.src = endpoints[epIndex];
    };
    tryNext();
  });
}

/** Draws a cached tile image into the live satellite canvas at geo position. */
function drawTileFromCache(
  img: HTMLImageElement,
  tx: number,
  ty: number,
  zoom: number
) {
  const state = satelliteContext;
  if (!state) return;
  const { ctx, center, terrainSizeMeters, canvas } = state;
  const avgLatRad = center.lat * RAD;
  const halfSize = terrainSizeMeters / 2;
  const canvasSize = canvas.width;

  const tileNW = tileToLatLon(tx, ty, zoom);
  const tileSE = tileToLatLon(tx + 1, ty + 1, zoom);
  const x0 = (tileNW.lon - center.lon) * RAD * EARTH_RADIUS * Math.cos(avgLatRad);
  const x1 = (tileSE.lon - center.lon) * RAD * EARTH_RADIUS * Math.cos(avgLatRad);
  const z0 = -(tileNW.lat - center.lat) * RAD * EARTH_RADIUS;
  const z1 = -(tileSE.lat - center.lat) * RAD * EARTH_RADIUS;
  const cX0 = ((x0 + halfSize) / terrainSizeMeters) * canvasSize;
  const cX1 = ((x1 + halfSize) / terrainSizeMeters) * canvasSize;
  const cY0 = ((z0 + halfSize) / terrainSizeMeters) * canvasSize;
  const cY1 = ((z1 + halfSize) / terrainSizeMeters) * canvasSize;

  ctx.drawImage(img, cX0, cY0, cX1 - cX0, cY1 - cY0);
}

/**
 * Re-burns the sharpest focal bands around a world-space camera position
 * (local Cartesian metres, X East / -Z North). Fetches whatever tiles are
 * missing near the camera and draws them; already-cached tiles are drawn
 * straight from cache, so fast pans don't hammer the network.
 *
 * Call this from the render loop after the camera settles beyond a movement
 * threshold — the gating (threshold + cooldown) lives in the caller.
 */
export function updateSatelliteCamera(x: number, z: number): void {
  const state = satelliteContext;
  if (!state) return;

  const profile = SATELLITE_PROFILES[state.currentQuality || 'balanced'] || SATELLITE_PROFILES.balanced;
  const avgLatRad = state.center.lat * RAD;
  const focusLat = state.center.lat + (-z) / (RAD * EARTH_RADIUS);
  const focusLon = state.center.lon + x / (RAD * EARTH_RADIUS * Math.cos(avgLatRad));

  // Focal bands centred on the camera: core + mid band footprints.
  const bands = [
    { zoom: profile.coreZoom, half: state.terrainSizeMeters * profile.coreBand },
    { zoom: profile.midZoom, half: state.terrainSizeMeters * profile.midBand },
  ];

  const tiles: Array<{ tx: number; ty: number; zoom: number }> = [];
  for (const band of bands) {
    if (band.half <= 0) continue;
    const latN = focusLat + band.half / (RAD * EARTH_RADIUS);
    const lonW = focusLon - band.half / (RAD * EARTH_RADIUS * Math.cos(avgLatRad));
    const latS = focusLat - band.half / (RAD * EARTH_RADIUS);
    const lonE = focusLon + band.half / (RAD * EARTH_RADIUS * Math.cos(avgLatRad));
    const nw = latLonToTile(latN, lonW, band.zoom);
    const se = latLonToTile(latS, lonE, band.zoom);
    const minX = Math.min(nw.x, se.x);
    const maxX = Math.max(nw.x, se.x);
    const minY = Math.min(nw.y, se.y);
    const maxY = Math.max(nw.y, se.y);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        tiles.push({ tx, ty, zoom: band.zoom });
      }
    }
  }

  // Draw smallest zoom first so overlapping sharper tiles win; draw cached
  // tiles immediately, queue the rest for a small concurrent fetch.
  tiles.sort((a, b) => a.zoom - b.zoom);
  let dirty = false;
  const missing: Array<{ tx: number; ty: number; zoom: number }> = [];

  const cacheHitDraw = async () => {
    // synchronous pass: draw everything already in cache
    for (const t of tiles) {
      const cached = tileImageCache.get(tileKey(t.tx, t.ty, t.zoom));
      if (cached) {
        drawTileFromCache(cached, t.tx, t.ty, t.zoom);
        dirty = true;
      } else {
        missing.push(t);
      }
    }
    if (dirty) {
      state.texture.needsUpdate = true;
    }
    if (missing.length === 0 || cameraBusy) return;
    cameraBusy = true;
    try {
      const pool = Array.from({ length: Math.min(6, missing.length) }, async () => {
        while (missing.length > 0) {
          const t = missing.shift();
          if (!t) break;
          const img = await fetchTileImageCached(t.tx, t.ty, t.zoom);
          if (img) {
            drawTileFromCache(img, t.tx, t.ty, t.zoom);
            state.texture.needsUpdate = true;
          }
        }
      });
      await Promise.all(pool);
    } finally {
      cameraBusy = false;
    }
  };

  // fire-and-forget fetch pass
  void cacheHitDraw();

  lastCameraX = x;
  lastCameraZ = z;
  cameraBurnedAt = performance.now();
}

/** Gate: has the camera moved enough, and long enough since the last re-burn? */
export function shouldReburnSatellite(x: number, z: number): boolean {
  if (!satelliteContext) return false;
  const dist = Math.hypot(x - lastCameraX, z - lastCameraZ);
  return dist > 220 && performance.now() - cameraBurnedAt > 2200;
}
