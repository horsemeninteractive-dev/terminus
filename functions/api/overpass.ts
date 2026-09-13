// Cloudflare Pages Function: POST /api/overpass
//
// The browser can no longer reliably query the volunteer-run Overpass mirrors
// during European daytime (429/504s, long queues) — see the osmFetcher client
// fallback that this function supersedes in production. Running the fetch on
// the edge fixes the two biggest failure modes:
//
//   1. Caching — OSM data for an area barely changes week to week, so the
//      response for a given query is served from Cloudflare's edge cache for
//      CACHE_TTL. One successful fetch makes an area instant for every player
//      afterwards, with zero Overpass load.
//   2. Mirror resilience — requests race ALL mirrors in parallel from
//      Cloudflare's network instead of the player's (often mobile) connection;
//      a single hung mirror no longer delays the result because the others
//      finish first.
//
// Request: POST with form-encoded `data=<QL query>` (the same form the mirrors
// take) or JSON { query }. Response: the raw Overpass JSON, with the header
// `x-overpass-source` telling the client whether it came from the cache or a
// live mirror. No secrets or bindings are involved — nothing to configure on
// the Pages project; wrangler compiles this directory automatically on deploy.
//
// Truncated mirror runs (server timed out / ran out of memory mid-stream) are
// still returned when they carry enough elements — same heuristic as the
// client — but are never written to the cache, so a bad payload can't poison
// it for the TTL period.

interface OverpassPayload {
  elements?: unknown[];
  remark?: string;
}

const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days
const MIRROR_TIMEOUT_MS = 25_000;
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const onRequestPost = async ({ request }: { request: Request }): Promise<Response> => {
  // Cache key: a POST body isn't cacheable, so the cache entry is keyed by a
  // SHA-256 of the query on a synthetic GET URL for this function's path.
  const query = await readQuery(request);
  if (!query) {
    return json({ error: 'Missing Overpass QL query (data=<query> or {"query": ...}).' }, 400);
  }

  const cache = caches.default;
  const keyedUrl = new URL(request.url);
  keyedUrl.search = `q=${await sha256Hex(query)}`;
  const keyedCacheKey = new Request(keyedUrl.toString(), { method: 'GET' });

  const cached = await cache.match(keyedCacheKey);
  if (cached) {
    return withSourceHeader(cached, 'cache');
  }

  const body = await fetchFromMirrors(query);
  if (!body) {
    return json({ error: 'All Overpass mirrors failed or timed out.' }, 502);
  }

  const truncated = isTruncated(body);
  const response = withSourceHeader(json(body, 200), truncated ? 'mirror-truncated' : 'mirror');
  if (!truncated) {
    response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
    // cache.put consumes its argument — clone first so the client gets a body.
    await cache.put(keyedCacheKey, response.clone());
  }
  return response;
};

async function readQuery(request: Request): Promise<string> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = (await request.json().catch(() => ({}))) as { query?: string };
    return data.query || '';
  }
  const params = new URLSearchParams(await request.text());
  return params.get('data') || '';
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Races every mirror concurrently and resolves with the first payload that
 * looks valid. Sequential fallback was too slow in practice: a single hung
 * mirror (connection accepted, response never sent) burned its full 25 s
 * timeout before the next mirror was even tried, and mirrors fail in packs
 * under European daytime load. Parallel racing means the total wait is the
 * *fastest healthy mirror's* response time, not the sum of dead ones.
 */
async function fetchFromMirrors(query: string): Promise<OverpassPayload | null> {
  const attempts = MIRRORS.map((mirror) => fetchOneMirror(mirror, query));
  try {
    // AggregateError.errors carries each rejection; any fulfilled mirror wins.
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

async function fetchOneMirror(mirror: string, query: string): Promise<OverpassPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), MIRROR_TIMEOUT_MS);
  try {
    const upstream = await fetch(mirror, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json',
        // Polite user agent so mirror operators can identify the traffic.
        'User-Agent': 'terminus-game (+https://github.com/horsemeninteractive-dev/terminus)',
      },
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`${mirror}: HTTP ${upstream.status}`);
    const data = (await upstream.json().catch(() => null)) as OverpassPayload | null;
    if (!data || !Array.isArray(data.elements)) {
      throw new Error(`${mirror}: malformed payload`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function isTruncated(data: OverpassPayload): boolean {
  return (
    !!data.remark &&
    (data.remark.includes('timed out') ||
      data.remark.includes('out of memory') ||
      data.remark.includes('runtime error')) &&
    (data.elements?.length ?? 0) < 500
  );
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function withSourceHeader(response: Response, source: string): Response {
  response.headers.set('x-overpass-source', source);
  response.headers.set('Access-Control-Expose-Headers', 'x-overpass-source');
  return response;
}
