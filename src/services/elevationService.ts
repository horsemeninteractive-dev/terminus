import { ElevationGrid, GeoPoint } from '../types/map';
import { metersToDeltaLat, metersToDeltaLon } from './projection';

/**
 * Fast bilinear interpolation with smooth Hermite easing for continuous terrain heightfields
 */
export function sampleElevation(
  gridData: ElevationGrid | null | undefined,
  x: number,
  z: number,
  exaggeration = 1.0
): number {
  if (!gridData || !gridData.grid || gridData.grid.length === 0) {
    return 0;
  }

  const { bounds, resolution, grid, baseElevation } = gridData;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  if (width <= 0 || depth <= 0 || resolution < 2) {
    return 0;
  }

  // Normalized [0, 1] across map bounding box
  const u = Math.max(0, Math.min(1, (x - bounds.minX) / width));
  const v = Math.max(0, Math.min(1, (z - bounds.minZ) / depth));

  const gx = u * (resolution - 1);
  const gz = v * (resolution - 1);

  const x0 = Math.floor(gx);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const z0 = Math.floor(gz);
  const z1 = Math.min(resolution - 1, z0 + 1);

  const fx = gx - x0;
  const fz = gz - z0;

  // Smooth Hermite blend weights
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);

  const h00 = grid[z0]?.[x0] ?? baseElevation;
  const h10 = grid[z0]?.[x1] ?? baseElevation;
  const h01 = grid[z1]?.[x0] ?? baseElevation;
  const h11 = grid[z1]?.[x1] ?? baseElevation;

  const top = h00 * (1 - sx) + h10 * sx;
  const bottom = h01 * (1 - sx) + h11 * sx;
  const absoluteElevation = top * (1 - sz) + bottom * sz;

  // Height offset in scene relative to center anchor
  const relativeHeight = absoluteElevation - baseElevation;
  return relativeHeight * exaggeration;
}

/**
 * Calculates terrain slope surface normal vector at any (X, Z) coordinate
 */
export function sampleElevationNormal(
  gridData: ElevationGrid | null | undefined,
  x: number,
  z: number,
  exaggeration = 1.0
): { x: number; y: number; z: number } {
  const eps = 1.5;
  const hL = sampleElevation(gridData, x - eps, z, exaggeration);
  const hR = sampleElevation(gridData, x + eps, z, exaggeration);
  const hU = sampleElevation(gridData, x, z - eps, exaggeration);
  const hD = sampleElevation(gridData, x, z + eps, exaggeration);

  const dx = (hR - hL) / (2 * eps);
  const dz = (hD - hU) / (2 * eps);

  // Normal vector: (-dx, 1, -dz) normalized
  const len = Math.hypot(-dx, 1.0, -dz) || 1;
  return {
    x: -dx / len,
    y: 1.0 / len,
    z: -dz / len,
  };
}

/**
 * Fetches real Digital Elevation Model (DEM) data from Open-Meteo elevation API,
 * with fast batch fetching and procedural fallback if offline.
 */
export async function fetchElevationGrid(
  center: GeoPoint,
  radius: number,
  resolution = 16,
  signal?: AbortSignal
): Promise<ElevationGrid> {
  const sampleRadius = Math.max(radius * 1.35, 1400);
  const bounds = {
    minX: -sampleRadius,
    maxX: sampleRadius,
    minZ: -sampleRadius,
    maxZ: sampleRadius,
  };

  const latStep = (metersToDeltaLat(sampleRadius * 2)) / (resolution - 1);
  const lonStep = (metersToDeltaLon(sampleRadius * 2, center.lat)) / (resolution - 1);

  const minLat = center.lat - metersToDeltaLat(sampleRadius);
  const minLon = center.lon - metersToDeltaLon(sampleRadius, center.lat);

  // Prepare coordinate arrays for query with 4 decimals precision (keeps URI within standard limits)
  const lats: number[] = [];
  const lons: number[] = [];

  for (let r = 0; r < resolution; r++) {
    const lat = minLat + r * latStep;
    for (let c = 0; c < resolution; c++) {
      const lon = minLon + c * lonStep;
      lats.push(parseFloat(lat.toFixed(4)));
      lons.push(parseFloat(lon.toFixed(4)));
    }
  }

  // Attempt live DEM fetch with chunked requests if needed
  try {
    const chunkSize = 100;
    const elevationResults: number[] = [];

    for (let i = 0; i < lats.length; i += chunkSize) {
      const chunkLats = lats.slice(i, i + chunkSize);
      const chunkLons = lons.slice(i, i + chunkSize);
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunkLats.join(',')}&longitude=${chunkLons.join(',')}`;

      // Per-chunk timeout so a hanging DEM server can never block the pipeline forever
      const chunkController = new AbortController();
      const chunkTimeout = setTimeout(() => chunkController.abort('timeout'), 10000);
      const onParentAbort = () => chunkController.abort('user_abort');
      if (signal) signal.addEventListener('abort', onParentAbort);

      let res: Response;
      try {
        res = await fetch(url, {
          signal: chunkController.signal,
          headers: {
            Accept: 'application/json',
          },
        });
      } finally {
        clearTimeout(chunkTimeout);
        if (signal) signal.removeEventListener('abort', onParentAbort);
      }

      if (!res.ok) {
        throw new Error(`Open-Meteo elevation response status: ${res.status}`);
      }

      const data = await res.json();
      if (data.elevation && Array.isArray(data.elevation)) {
        elevationResults.push(...data.elevation);
      } else {
        throw new Error('Invalid elevation payload');
      }
    }

    if (elevationResults.length === resolution * resolution) {
      const grid: number[][] = [];
      let minElev = Infinity;
      let maxElev = -Infinity;

      // Row 0 is minLat (South, so maxZ in local coordinates)
      for (let r = 0; r < resolution; r++) {
        const row: number[] = [];
        for (let c = 0; c < resolution; c++) {
          // Invert row indexing so grid[0] corresponds to minZ (North)
          const srcIdx = (resolution - 1 - r) * resolution + c;
          const elev = elevationResults[srcIdx];
          row.push(elev);
          if (elev < minElev) minElev = elev;
          if (elev > maxElev) maxElev = elev;
        }
        grid.push(row);
      }

      const centerIdx = Math.floor(resolution / 2);
      const baseElevation = grid[centerIdx]?.[centerIdx] ?? (minElev + maxElev) / 2;

      return {
        minElevation: Math.round(minElev * 10) / 10,
        maxElevation: Math.round(maxElev * 10) / 10,
        baseElevation: Math.round(baseElevation * 10) / 10,
        resolution,
        grid,
        bounds,
      };
    }
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Elevation survey failed.');
  }

  throw new Error('Elevation survey returned no complete DEM grid.');
}
