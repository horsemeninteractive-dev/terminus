import { GeoPoint } from '../types/map';

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

export interface RawOsmResponse {
  version: number;
  generator: string;
  remark?: string;
  elements: Array<{
    type: 'node' | 'way' | 'relation';
    id: number;
    lat?: number;
    lon?: number;
    nodes?: number[];
    members?: Array<{
      type: 'node' | 'way' | 'relation';
      ref: number;
      role: string;
    }>;
    tags?: Record<string, string>;
  }>;
}

/**
 * Builds an optimized Overpass QL query string for a square bounding box around a coordinate.
 */
export function buildOverpassBBoxQuery(lat: number, lon: number, halfSideMeters: number): string {
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const dLat = halfSideMeters / metersPerLat;
  const dLon = halfSideMeters / metersPerLon;

  const south = (lat - dLat).toFixed(6);
  const north = (lat + dLat).toFixed(6);
  const west = (lon - dLon).toFixed(6);
  const east = (lon + dLon).toFixed(6);

  // [timeout:60] and [maxsize:1073741824] (1GB) ensure large dense cities
  // do not run out of memory or abort mid-stream.
  // Using 'out body qt;' streams results ordered by quad-tile, which is significantly
  // faster on Overpass servers and avoids database-level ID sorting overhead.
  return `[out:json][timeout:60][maxsize:1073741824][bbox:${south},${west},${north},${east}];
(
  way["building"];
  way["highway"];
  way["landuse"];
  way["leisure"];
  way["natural"];
  way["waterway"];
  way["water"];
  way["amenity"];
  way["shop"];
  relation["building"];
  relation["natural"="water"];
  relation["waterway"];
  relation["water"];
  relation["leisure"];
  relation["landuse"];
  relation["amenity"];
  node["natural"="tree"];
  node["highway"="street_lamp"];
  node["amenity"];
  node["shop"];
  node["healthcare"];
);
out body qt;
>;
out skel qt;`;
}

/**
 * Builds an optimized Overpass QL query string for a bounding square grid around a coordinate.
 */
export function buildOverpassQuery(lat: number, lon: number, radiusOrHalfSide: number): string {
  // 8km x 8km maps => allow up to a 4000m half-span for live fetches.
  const halfSide = Math.min(Math.max(radiusOrHalfSide, 300), 4000);
  return buildOverpassBBoxQuery(lat, lon, halfSide);
}

/**
 * Fetches raw OSM elements from Overpass API with multi-endpoint fallback and graceful timeout handling.
 */
export async function fetchFromOverpass(
  center: GeoPoint,
  radius: number,
  signal?: AbortSignal
): Promise<RawOsmResponse> {
  if (signal?.aborted) {
    const abortErr = new Error('Operation aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  const query = buildOverpassQuery(center.lat, center.lon, radius);
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) {
      const abortErr = new Error('Operation aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;
    let onParentAbort: (() => void) | null = null;

    try {
      timeoutId = setTimeout(() => {
        controller.abort('timeout');
      }, 25000); // 25s timeout per mirror for dense city queries

      if (signal) {
        onParentAbort = () => controller.abort('user_abort');
        signal.addEventListener('abort', onParentAbort);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as RawOsmResponse;
      if (!data || !Array.isArray(data.elements)) {
        throw new Error(`Malformed response from ${endpoint}`);
      }

      // Detect if the mirror ran out of memory or timed out mid-stream
      if (
        data.remark &&
        (data.remark.includes('timed out') ||
          data.remark.includes('out of memory') ||
          data.remark.includes('runtime error'))
      ) {
        console.warn(`Overpass mirror ${endpoint} reported remark error:`, data.remark);
        if (data.elements.length < 500) {
          throw new Error(`Overpass data truncated: ${data.remark}`);
        }
      }

      return data;
    } catch (err: unknown) {
      // Only a genuine parent abort (user navigated away) stops the chain here.
      // Per-mirror timeouts, HTTP errors, and network failures must NOT be treated
      // as aborts — otherwise the first busy mirror kills the whole fetch instead
      // of falling through to the remaining mirrors.
      if (signal?.aborted) {
        const abortErr = new Error('Operation aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      // Quietly record error and proceed to next mirror
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (signal && onParentAbort) {
        signal.removeEventListener('abort', onParentAbort);
      }
    }
  }

  throw lastError || new Error('All Overpass API mirrors were busy or timed out.');
}
