import * as THREE from 'three';
import { GeoPoint } from '../types/map';

const EARTH_RADIUS = 6378137; // meters (WGS84)
const RAD = Math.PI / 180;

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

const satelliteCache = new Map<string, THREE.CanvasTexture>();

/**
 * Generates or fetches a high-resolution satellite imagery texture covering the exact terrain mesh bounding box.
 * Matches local Cartesian meter coordinates (X: East, -Z: North) with sub-pixel precision.
 */
export async function loadSatelliteTexture(
  center: GeoPoint,
  terrainSizeMeters: number
): Promise<THREE.CanvasTexture> {
  const cacheKey = `${center.lat.toFixed(5)}_${center.lon.toFixed(5)}_${Math.round(terrainSizeMeters)}`;
  const cached = satelliteCache.get(cacheKey);
  if (cached) return cached;

  // Scale canvas resolution with the terrain extent so 8km maps stay sharp:
  // 2048px for small maps up to 4096px for 8km maps (~2.1m per pixel instead
  // of ~4m). Capped at 4096 to keep the GPU texture at ~64MB.
  const canvasSize = Math.min(4096, Math.max(2048, Math.round(terrainSizeMeters * 0.5)));
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });

  if (!ctx) {
    const fallbackTex = new THREE.CanvasTexture(canvas);
    return fallbackTex;
  }

  // Paint dark tactical foundation background
  ctx.fillStyle = '#1c221e';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  const halfSize = terrainSizeMeters / 2;
  const avgLatRad = center.lat * RAD;

  // Exact geographic corners of the 3D terrain mesh:
  // North is -Z in 3D world, South is +Z
  // West is -X in 3D world, East is +X
  const latNW = center.lat + halfSize / (RAD * EARTH_RADIUS);
  const lonNW = center.lon - halfSize / (RAD * EARTH_RADIUS * Math.cos(avgLatRad));
  const latSE = center.lat - halfSize / (RAD * EARTH_RADIUS);
  const lonSE = center.lon + halfSize / (RAD * EARTH_RADIUS * Math.cos(avgLatRad));

  // Determine optimal zoom level for high definition without excessive tile load:
  // Zoom 17 delivers ~0.6m per pixel; Zoom 16 delivers ~1.2m per pixel
  const zoom = terrainSizeMeters <= 2000 ? 17 : 16;

  const nwTile = latLonToTile(latNW, lonNW, zoom);
  const seTile = latLonToTile(latSE, lonSE, zoom);

  const minTileX = Math.min(nwTile.x, seTile.x);
  const maxTileX = Math.max(nwTile.x, seTile.x);
  const minTileY = Math.min(nwTile.y, seTile.y);
  const maxTileY = Math.max(nwTile.y, seTile.y);

  let successCount = 0;
  const tilePromises: Promise<void>[] = [];

  const fetchTileImage = (tx: number, ty: number): Promise<HTMLImageElement | null> => {
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
        }, 4000);

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
  };

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const p = (async () => {
        const img = await fetchTileImage(tx, ty);
        if (!img) return;

        try {
          const tileNW = tileToLatLon(tx, ty, zoom);
          const tileSE = tileToLatLon(tx + 1, ty + 1, zoom);

          // Convert geographic tile boundary to Cartesian meters relative to map center
          const x0 = (tileNW.lon - center.lon) * RAD * EARTH_RADIUS * Math.cos(avgLatRad);
          const x1 = (tileSE.lon - center.lon) * RAD * EARTH_RADIUS * Math.cos(avgLatRad);
          const z0 = -(tileNW.lat - center.lat) * RAD * EARTH_RADIUS;
          const z1 = -(tileSE.lat - center.lat) * RAD * EARTH_RADIUS;

          // Convert meter coordinates to pixel coordinates on the terrain canvas
          const cX0 = ((x0 + halfSize) / terrainSizeMeters) * canvasSize;
          const cX1 = ((x1 + halfSize) / terrainSizeMeters) * canvasSize;
          const cY0 = ((z0 + halfSize) / terrainSizeMeters) * canvasSize;
          const cY1 = ((z1 + halfSize) / terrainSizeMeters) * canvasSize;

          const destW = cX1 - cX0;
          const destH = cY1 - cY0;

          // Draw tile precisely stretched to its projected footprint
          ctx.drawImage(img, cX0, cY0, destW, destH);
          successCount++;
        } catch {
          // Ignore canvas draw error
        }
      })();

      tilePromises.push(p);
    }
  }

  // Await tile loading with global timeout
  await Promise.race([
    Promise.all(tilePromises),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);

  // Fallback synthetic satellite earth if completely offline
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

    // High-contrast tactical field satellite noise texture
    for (let i = 0; i < 800; i++) {
      const px = Math.random() * canvasSize;
      const py = Math.random() * canvasSize;
      const pw = 6 + Math.random() * 32;
      const ph = 6 + Math.random() * 32;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(42, 58, 46, 0.45)' : 'rgba(30, 40, 34, 0.45)';
      ctx.fillRect(px, py, pw, ph);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  satelliteCache.set(cacheKey, texture);
  return texture;
}
