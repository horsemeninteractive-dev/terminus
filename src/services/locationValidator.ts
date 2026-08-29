import { GeoPoint } from '../types/map';

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
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'TerminusSurvivalGame/1.0',
        },
      });
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
