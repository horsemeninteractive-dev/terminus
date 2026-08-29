/**
 * One-time offline-bundle generator.
 *
 * Run ON A MACHINE WITH INTERNET:
 *   npx tsx scripts/fetch-maps.ts
 *
 * For every curated city preset it downloads:
 *   1. Real street/landuse geometry from the Overpass API (OSM)
 *   2. A 16x16 Digital Elevation Model grid from the Open-Meteo elevation API
 * ...then runs the app's own processOsmData to produce ONE fully-processed
 * MapData JSON per city (geometry + elevation baked in), written to:
 *   src/data/maps/<id>.json
 *
 * Both the starting-area street map and the 3D game consume these files, so
 * the game works entirely offline once the bundles exist.
 *
 * The public Overpass mirrors are often busy and rate-limit aggressively, so
 * this script retries each query with longer timeouts + exponential backoff
 * instead of giving up after a single timeout. Expect it to take a while.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LOCATION_PRESETS } from '../src/data/sampleMapData';
import { fetchElevationGrid } from '../src/services/elevationService';
import { processOsmData } from '../src/services/mapProcessor';
import type { RawOsmResponse } from '../src/services/osmFetcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../src/data/maps');

// 8km x 8km tactical maps => 4000m half-span.
const RADIUS = 4000;
const ELEVATION_RESOLUTION = 16;

// Overpass response timeout as the mirrors are slow on big city queries.
const OVERPASS_QUERY_TIMEOUT = 300;
// How long to wait for a single mirror request before moving on.
const REQUEST_TIMEOUT_MS = 240_000;
// Retries (including the first attempt) per mirror before trying the next.
const MAX_ATTEMPTS = 4;
// Delay between cities to be polite to the mirrors.
const CITY_DELAY_MS = 15_000;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildQuery(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT}];
(
  way["building"](around:${radius},${lat},${lon});
  way["highway"](around:${radius},${lat},${lon});
  way["landuse"](around:${radius},${lat},${lon});
  way["leisure"](around:${radius},${lat},${lon});
  way["natural"](around:${radius},${lat},${lon});
  way["waterway"](around:${radius},${lat},${lon});
  way["water"](around:${radius},${lat},${lon});
  way["amenity"](around:${radius},${lat},${lon});
  relation["natural"="water"](around:${radius},${lat},${lon});
  relation["waterway"](around:${radius},${lat},${lon});
  relation["water"](around:${radius},${lat},${lon});
  relation["leisure"](around:${radius},${lat},${lon});
  relation["landuse"](around:${radius},${lat},${lon});
  relation["amenity"](around:${radius},${lat},${lon});
  node["natural"="tree"](around:${radius},${lat},${lon});
  node["highway"="street_lamp"](around:${radius},${lat},${lon});
  node["amenity"](around:${radius},${lat},${lon});
);
out body;
>;
out skel qt;`;
}

/**
 * Robust Overpass fetch: tries each mirror, retrying with exponential backoff,
 * so a busy/rate-limited mirror doesn't kill the whole download.
 */
async function fetchOverpassRobust(lat: number, lon: number, radius: number): Promise<RawOsmResponse> {
  const query = buildQuery(lat, lon, radius);
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: 'application/json',
            // Overpass mirrors reject requests without a descriptive User-Agent (HTTP 406).
            'User-Agent': 'TERMINUS-offline-map-bundler/1.0 (one-time city bundle generation)',
          },
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        const data = (await res.json()) as RawOsmResponse;
        if (!data || !Array.isArray(data.elements)) {
          throw new Error('Malformed response');
        }
        return data;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.log(
          `      attempt ${attempt}/${MAX_ATTEMPTS} on ${endpoint} failed (${detail}) — retrying in ${attempt * 5}s...`
        );
      } finally {
        clearTimeout(timeoutId);
      }
      // Exponential backoff between attempts.
      await sleep(attempt * 5000);
    }
  }

  throw lastError || new Error('All Overpass mirrors failed.');
}

async function fetchElevationRobust(lat: number, lon: number, radius: number) {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetchElevationGrid({ lat, lon }, radius, ELEVATION_RESOLUTION);
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      await sleep(attempt * 4000);
    }
  }
  throw lastErr || new Error('Elevation fetch failed.');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0;
  const failed: string[] = [];

  for (const preset of LOCATION_PRESETS) {
    const center = { lat: preset.lat, lon: preset.lon };
    const target = path.join(OUT_DIR, `${preset.id}.json`);

    console.log(`[${preset.id}] ${preset.name} (${preset.country}) ...`);
    try {
      const raw = await fetchOverpassRobust(preset.lat, preset.lon, RADIUS);
      const elevation = await fetchElevationRobust(preset.lat, preset.lon, RADIUS);
      const mapData = processOsmData(
        raw,
        center,
        RADIUS,
        'Bundled: Live Overpass + Open-Meteo DEM',
        elevation
      );

      if (mapData.buildings.length === 0 && mapData.roads.length === 0) {
        console.log('   WARN -> no buildings/roads returned; skipping.');
        failed.push(preset.id);
      } else {
        fs.writeFileSync(target, JSON.stringify(mapData));
        console.log(
          `   OK -> ${mapData.buildings.length} buildings, ${mapData.roads.length} roads, ` +
            `${mapData.landuse.length} landuse, DEM ${elevation.minElevation}..${elevation.maxElevation}m ` +
            `-> ${path.relative(process.cwd(), target)}`
        );
        ok++;
      }
    } catch (e: any) {
      console.error(`   FAILED -> ${e?.message ?? e}`);
      failed.push(preset.id);
    }

    await sleep(CITY_DELAY_MS);
  }

  console.log(
    `\nDone. ${ok} saved to ${OUT_DIR}, ${failed.length} failed` +
      (failed.length ? `: ${failed.join(', ')}` : '') +
      '.\nRe-run the script (or fetch failed cities individually) to retry.'
  );
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
