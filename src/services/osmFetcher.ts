import { GeoPoint } from '../types/map';

/**
 * Edge proxy deployed as a Cloudflare Pages Function (`functions/api/overpass.ts`).
 * It caches responses per query for 7 days and retries all mirrors from
 * Cloudflare's network, so daytime searches hit warm cache or a server-side
 * retry chain instead of racing busy mirrors from the browser. The direct
 * mirror chain below remains the fallback for dev/preview (where the function
 * doesn't exist) and if the proxy itself errors.
 */
const OVERPASS_PROXY = '/api/overpass';
/** Overall cap for the proxy attempt before falling back to direct mirrors. */
const PROXY_DEADLINE_MS = 45_000;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/**
 * Per-session cooldown for mirrors that just failed: European daytime load
 * makes the popular mirrors return 429/504 for minutes at a time, and the old
 * fixed order always retried the same two first — burning the survey window
 * on known-busy mirrors. A failed mirror sits out for COOLDOWN_MS before it
 * is tried again, so subsequent attempts start with the mirrors that work
 * right now. In-memory only; each fresh page load starts clean.
 */
const MIRROR_COOLDOWN_MS = 90_000;
const mirrorCooldowns = new Map<string, number>();

function availableEndpoints(): string[] {
  const now = Date.now();
  const available = OVERPASS_ENDPOINTS.filter((e) => (mirrorCooldowns.get(e) ?? 0) <= now);
  // All mirrors cooling down (rapid consecutive surveys): keep the fixed order
  // rather than returning nothing — a busy mirror sometimes still answers.
  return available.length > 0 ? available : OVERPASS_ENDPOINTS;
}

function markMirrorFailed(endpoint: string): void {
  mirrorCooldowns.set(endpoint, Date.now() + MIRROR_COOLDOWN_MS);
}

function markMirrorOk(endpoint: string): void {
  mirrorCooldowns.delete(endpoint);
}

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
  way["railway"];
  way["landuse"];
  way["leisure"];
  way["natural"];
  way["natural"="coastline"];
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
  relation["railway"];
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

  // 1. Edge proxy (production): cached + server-side mirror racing. Bounded
  // by an overall deadline so a wedged proxy can't stall the fallback.
  try {
    const proxySignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(PROXY_DEADLINE_MS)]) : AbortSignal.timeout(PROXY_DEADLINE_MS);
    const proxy = await fetch(OVERPASS_PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json',
      },
      body: 'data=' + encodeURIComponent(query),
      signal: proxySignal,
    });
    if (proxy.ok) {
      const data = (await proxy.json()) as RawOsmResponse;
      if (data && Array.isArray(data.elements)) {
        console.info(`Overpass via proxy (${proxy.headers.get('x-overpass-source') || 'unknown'})`);
        // Truncated proxy responses (server-side remark error with few
        // elements) are not worth accepting — fall through to direct mirrors.
        const truncated =
          data.remark &&
          (data.remark.includes('timed out') ||
            data.remark.includes('out of memory') ||
            data.remark.includes('runtime error'));
        if (!truncated || data.elements.length >= 500) {
          return data;
        }
        lastError = new Error(`Overpass data truncated via proxy: ${data.remark}`);
      }
    }
  } catch (err) {
  // The proxy can legitimately not exist (dev/preview) or be unreachable;
  // either way the direct mirror race below still applies.
  if (signal?.aborted) {
    const abortErr = new Error('Operation aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }
  lastError = err instanceof Error ? err : new Error(String(err));
  }

  // 2. Direct mirror race (fallback / dev) — mirrors are raced in parallel
  // with the same first-valid-wins semantics as the edge proxy, so a hung
  // mirror can never stall the chain for its full timeout.
  const endpoints = availableEndpoints();
  if (signal?.aborted) {
    const abortErr = new Error('Operation aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  try {
    const data = await Promise.any(
      endpoints.map((endpoint) => fetchOneMirror(endpoint, query, signal))
    );
    return data;
  } catch (err: unknown) {
    if (signal?.aborted) {
      const abortErr = new Error('Operation aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    // Collect per-mirror outcomes for cooldowns and the final error message.
    const aggregate = err as AggregateError;
    for (const e of aggregate.errors ?? [err]) {
      const endpoint = (e as Error & { endpoint?: string }).endpoint;
      if (endpoint) markMirrorFailed(endpoint);
    }
    lastError =
      (aggregate.errors ?? []).find((e): e is Error => e instanceof Error) ??
      (err instanceof Error ? err : new Error(String(err)));
  }

  throw lastError || new Error('All Overpass API mirrors were busy or timed out.');
}

async function fetchOneMirror(
  endpoint: string,
  query: string,
  signal?: AbortSignal
): Promise<RawOsmResponse> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;
  let onParentAbort: (() => void) | null = null;

  const attachParentAbort = () => {
    if (signal) {
      onParentAbort = () => controller.abort('user_abort');
      signal.addEventListener('abort', onParentAbort);
    }
  };

  try {
    attachParentAbort();
    timeoutId = setTimeout(() => {
      controller.abort('timeout');
    }, 25000); // 25s timeout per mirror for dense city queries

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json',
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
        data.remark.includes('runtime error')) &&
      data.elements.length < 500
    ) {
      console.warn(`Overpass mirror ${endpoint} reported remark error:`, data.remark);
      throw new Error(`Overpass data truncated: ${data.remark}`);
    }

    markMirrorOk(endpoint);
    return data;
  } catch (err: unknown) {
    // Tag the failure with its endpoint so the racing caller can cool it down.
    const tagged = err instanceof Error ? err : new Error(String(err));
    (tagged as Error & { endpoint?: string }).endpoint = endpoint;
    throw tagged;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal && onParentAbort) {
      signal.removeEventListener('abort', onParentAbort);
    }
  }
}
