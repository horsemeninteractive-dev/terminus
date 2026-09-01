import { GeoPoint } from '../types/map';

// ---- Nominatim throttling (respect ~1 request/second usage policy) ----
// A tiny global rate-limiter: reserves a time slot before each request starts so
// the app never fires geocoding/validation fetches faster than the policy allows,
// even while a player rapidly edits the search box.
const NOMINATIM_MIN_INTERVAL_MS = 1000;
let nextRequestAt = 0;

function waitUntil(nowMs: number, signal?: AbortSignal): Promise<void> {
  const delay = nowMs - Date.now();
  if (delay <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    const onAbort = () => {
      cleanup();
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    if (signal) {
      if (signal.aborted) {
        cleanup();
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
        return;
      }
      signal.addEventListener('abort', onAbort);
    }
  });
}

async function rateLimited<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const start = Math.max(Date.now(), nextRequestAt);
  // Reserve this request's slot up front, so concurrent/rapid calls stay spaced out.
  nextRequestAt = start + NOMINATIM_MIN_INTERVAL_MS;
  await waitUntil(start, signal);
  return run();
}

export interface LocationValidationResult {
  isValid: boolean;
  name: string;
  country: string;
  category: 'urban' | 'suburban' | 'rural' | 'wilderness' | 'water';
  buildingDensity: 'High' | 'Moderate' | 'Low' | 'Sparse' | 'Zero';
  infrastructureScore: number; // 0 - 100
  message: string;
  lat: number;
  lon: number;
  nearestCity?: string;
}

// Memory cache for validation results
const validationCache = new Map<string, LocationValidationResult>();

/** A single live-geocoded search result (from Nominatim /search). */
export interface GeoSearchResult {
  placeId: number;
  /** Short human label, e.g. "Worcester" */
  name: string;
  /** Full address string from the geocoder */
  displayName: string;
  country: string;
  /** ISO-3166 alpha-2 country code (lowercase) for flag rendering, when known */
  countryCode?: string;
  city: string;
  lat: number;
  lon: number;
}

// Map a country name to its ISO-3166 alpha-2 code so curated/downloaded presets
// (which only store a human-readable country) can show the same country-code chip
// the live geocoder provides. Falls back to undefined when unknown.
const COUNTRY_CODE_BY_NAME: Record<string, string> = {
  'united kingdom': 'gb', 'england': 'gb', 'scotland': 'gb', 'wales': 'gb', 'northern ireland': 'gb',
  'united states': 'us', 'usa': 'us', 'canada': 'ca', 'mexico': 'mx',
  'france': 'fr', 'germany': 'de', 'italy': 'it', 'spain': 'es', 'portugal': 'pt',
  'netherlands': 'nl', 'belgium': 'be', 'luxembourg': 'lu', 'switzerland': 'ch', 'austria': 'at',
  'poland': 'pl', 'czech republic': 'cz', 'czechia': 'cz', 'slovakia': 'sk', 'hungary': 'hu',
  'russia': 'ru', 'ukraine': 'ua', 'romania': 'ro', 'bulgaria': 'bg', 'greece': 'gr', 'croatia': 'hr',
  'serbia': 'rs', 'slovenia': 'si', 'ireland': 'ie', 'denmark': 'dk', 'sweden': 'se', 'norway': 'no',
  'finland': 'fi', 'iceland': 'is', 'turkey': 'tr', 'japan': 'jp', 'china': 'cn', 'south korea': 'kr',
  'north korea': 'kp', 'india': 'in', 'indonesia': 'id', 'vietnam': 'vn', 'thailand': 'th',
  'malaysia': 'my', 'singapore': 'sg', 'philippines': 'ph', 'australia': 'au', 'new zealand': 'nz',
  'brazil': 'br', 'argentina': 'ar', 'chile': 'cl', 'colombia': 'co', 'peru': 'pe',
  'egypt': 'eg', 'south africa': 'za', 'nigeria': 'ng', 'morocco': 'ma', 'algeria': 'dz', 'kenya': 'ke',
  'israel': 'il', 'saudi arabia': 'sa', 'united arab emirates': 'ae', 'qatar': 'qa',
  'georgia': 'ge', 'armenia': 'am', 'azerbaijan': 'az',
};

export function countryCodeForName(country: string): string | undefined {
  if (!country) return undefined;
  return COUNTRY_CODE_BY_NAME[country.trim().toLowerCase()];
}

// Memory cache for geocoding queries (keyed by lowercased query)
const geocodeCache = new Map<string, GeoSearchResult[]>();

/**
 * Forward-geocode a free-text query ("worcester", "New York", "Berlin") using
 * Nominatim and return a small list of ranked matches. Returns [] on network
 * failure or rate-limiting so the caller can fall back to preset matching.
 */
export async function searchLocations(query: string, signal?: AbortSignal): Promise<GeoSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = q.toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&addressdetails=1&q=${encodeURIComponent(q)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort('timeout'), 8000);
      const onParentAbort = () => controller.abort('user_abort');
      if (signal) signal.addEventListener('abort', onParentAbort);

      let res: Response;
      try {
        res = await rateLimited(
          () =>
            fetch(url, {
              signal: controller.signal,
              headers: {
                Accept: 'application/json',
                'User-Agent': 'TerminusSurvivalGame/1.0',
              },
            }),
          controller.signal
        );
      } finally {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', onParentAbort);
      }

  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  const results: GeoSearchResult[] = data
    .map((r: any) => {
      const addr = r.address || {};
      const city =
        addr.city || addr.town || addr.village || addr.municipality || addr.suburb || r.name || '';
      const country = addr.country || '';
      return {
        placeId: r.place_id,
        name: city || r.name || '',
        displayName: r.display_name || r.name || city || '',
        country,
        countryCode: addr.country_code || undefined,
        city,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      };
    })
    .filter((r) => !isNaN(r.lat) && !isNaN(r.lon));

  geocodeCache.set(key, results);
  return results;
}

/**
 * Basic geometric check for ocean vs major landmasses to provide instant feedback
 */
function isMajorOcean(lat: number, lon: number): boolean {
  // Extreme poles
  if (lat > 82 || lat < -70) return true;

  // Pacific Ocean center
  if (lat > -40 && lat < 45 && ((lon > 160 && lon <= 180) || (lon >= -180 && lon < -125))) {
    // Exclude Hawaii approx
    if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) return false;
    // Exclude Japan approx
    if (lat >= 30 && lat <= 46 && lon >= 128 && lon <= 146) return false;
    // Exclude NZ approx
    if (lat >= -48 && lat <= -34 && lon >= 165 && lon <= 179) return false;
    return true;
  }

  // South Atlantic Ocean center
  if (lat > -55 && lat < -5 && lon > -35 && lon < 5) return true;

  // Indian Ocean center
  if (lat > -50 && lat < -5 && lon > 55 && lon < 95) return true;

  // Mid North Atlantic Ocean
  if (lat > 15 && lat < 50 && lon > -45 && lon < -20) return true;

  // Arctic Ocean
  if (lat > 75 && (lon < -30 || lon > 60)) return true;

  return false;
}

/**
 * Validates a coordinate on Earth for settlement viability using Nominatim & OSM heuristics
 */
export async function validateLocation(
  point: GeoPoint,
  signal?: AbortSignal
): Promise<LocationValidationResult> {
  const cacheKey = `${point.lat.toFixed(3)},${point.lon.toFixed(3)}`;
  if (validationCache.has(cacheKey)) {
    return validationCache.get(cacheKey)!;
  }

  // 1. Fast ocean check
  if (isMajorOcean(point.lat, point.lon)) {
    const oceanResult: LocationValidationResult = {
      isValid: false,
      name: 'Open Oceanic Water',
      country: 'International Waters',
      category: 'water',
      buildingDensity: 'Zero',
      infrastructureScore: 0,
      message: 'SECTOR UNVIABLE: Target coordinates are situated in open ocean. No salvageable structures or landmass detected.',
      lat: point.lat,
      lon: point.lon,
    };
    validationCache.set(cacheKey, oceanResult);
    return oceanResult;
  }

  // 2. Query Nominatim Reverse Geocoding for live real-world metadata
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${point.lat}&lon=${point.lon}&zoom=14&addressdetails=1`;
    // Bound the request so a hanging geocoder falls back to heuristics instead of blocking validation forever
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), 8000);
    const onParentAbort = () => controller.abort('user_abort');
    if (signal) signal.addEventListener('abort', onParentAbort);
    let res: Response;
    try {
      res = await rateLimited(
        () =>
          fetch(url, {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'TerminusSurvivalGame/1.0',
            },
          }),
        controller.signal
      );
    } finally {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onParentAbort);
    }

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const placeType = data.type || data.category || 'unknown';

      // Check if it's ocean or water
      if (placeType === 'water' || placeType === 'ocean' || placeType === 'sea' || !data.display_name) {
        const waterResult: LocationValidationResult = {
          isValid: false,
          name: data.display_name || 'Water Body / Maritime Zone',
          country: addr.country || 'Maritime Territory',
          category: 'water',
          buildingDensity: 'Zero',
          infrastructureScore: 5,
          message: 'WARNING: Submerged or aquatic sector. Insufficient terra firma for defensive construction.',
          lat: point.lat,
          lon: point.lon,
        };
        validationCache.set(cacheKey, waterResult);
        return waterResult;
      }

      const city = addr.city || addr.town || addr.municipality || addr.village || addr.suburb || addr.neighbourhood || addr.county || 'Local Sector';
      const country = addr.country || 'Uncharted Territory';
      const state = addr.state || addr.region || '';
      
      const isUrban = !!(addr.city || addr.suburb || addr.neighbourhood || addr.commercial || addr.industrial);
      const isTown = !!(addr.town || addr.village);

      let category: LocationValidationResult['category'] = 'wilderness';
      let buildingDensity: LocationValidationResult['buildingDensity'] = 'Low';
      let infrastructureScore = 40;

      if (isUrban) {
        category = 'urban';
        buildingDensity = 'High';
        infrastructureScore = 92;
      } else if (isTown) {
        category = 'suburban';
        buildingDensity = 'Moderate';
        infrastructureScore = 75;
      } else if (addr.road || addr.county) {
        category = 'rural';
        buildingDensity = 'Moderate';
        infrastructureScore = 55;
      } else {
        category = 'wilderness';
        buildingDensity = 'Sparse';
        infrastructureScore = 30;
      }

      const displayName = [city, state, country].filter(Boolean).join(', ');

      const result: LocationValidationResult = {
        isValid: true,
        name: displayName,
        country: country,
        category,
        buildingDensity,
        infrastructureScore,
        message: isUrban 
          ? 'EXCELLENT SECTOR: High-density urban layout detected with abundant salvageable masonry, commercial hubs, and road infrastructure.'
          : 'VIABLE SECTOR: Settlements and road networks identified. Suitable for defensive expansion.',
        lat: point.lat,
        lon: point.lon,
        nearestCity: city,
      };

      validationCache.set(cacheKey, result);
      return result;
    }
  } catch (err: any) {
    // Only a genuine parent abort (user moved the selector) should propagate;
    // timeouts and network errors fall through to the offline heuristic.
    if (signal?.aborted) throw err;
    // Fall back to coordinate analysis if network times out
  }

  // 3. Fallback Heuristic when offline / rate-limited
  const isLikelyLand = !isMajorOcean(point.lat, point.lon);
  const fallbackResult: LocationValidationResult = {
    isValid: isLikelyLand,
    name: `Sector Lat: ${point.lat.toFixed(3)}°, Lon: ${point.lon.toFixed(3)}°`,
    country: 'Global Land Sector',
    category: 'suburban',
    buildingDensity: 'Moderate',
    infrastructureScore: 68,
    message: isLikelyLand 
      ? 'SECTOR CONFIRMED: Geographic landmass validated. Ready for Overpass 3D terrain extraction.'
      : 'WARNING: Target coordinate outside inhabited landmass.',
    lat: point.lat,
    lon: point.lon,
  };

  validationCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}
