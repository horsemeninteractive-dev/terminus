/**
 * Per-city bundle builder for the Overpass Turbo workflow.
 *
 * Run ON A MACHINE WITH INTERNET:
 *   npx tsx scripts/build-city.ts <presetId>
 *
 * 1. First download the OSM geometry for the city from Overpass Turbo
 *    (https://overpass-turbo.eu) and save it as:
 *      src/data/maps-raw/<presetId>.osm.json
 *    (Query template at the bottom of this file.)
 *
 * 2. Then run this script. It:
 *      - reads src/data/maps-raw/<presetId>.osm.json  (Turbo export)
 *      - fetches the 16x16 DEM elevation grid from Open-Meteo (fast/reliable, NOT
 *        the rate-limited Overpass servers)
 *      - runs the app's processOsmData to combine them
 *      - writes the self-contained offline bundle to src/data/maps/<presetId>.json
 *
 * The final bundle contains BOTH real OSM geometry AND elevation, so the street
 * map and the 3D game both work fully offline from one file.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LOCATION_PRESETS } from '../src/data/sampleMapData';
import { fetchElevationGrid } from '../src/services/elevationService';
import { processOsmData } from '../src/services/mapProcessor';
import type { RawOsmResponse } from '../src/services/osmFetcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, '../src/data/maps-raw');
const OUT_DIR = path.resolve(__dirname, '../src/data/maps');

// 8km x 8km tactical maps => 4000m half-span.
const RADIUS = 4000;
const ELEVATION_RESOLUTION = 16;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const id = process.argv[2];
if (!id) {
  console.error('Usage: npx tsx scripts/build-city.ts <presetId>');
  process.exit(1);
}

const preset = LOCATION_PRESETS.find((p) => p.id === id);
if (!preset) {
  console.error(`Unknown preset id "${id}". Valid ids: ${LOCATION_PRESETS.map((p) => p.id).join(', ')}`);
  process.exit(1);
}
const location = { lat: preset.lat, lon: preset.lon };
const presetName = preset.name;
const presetCountry = preset.country;

async function fetchElevationRobust() {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetchElevationGrid(location, RADIUS, ELEVATION_RESOLUTION);
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      await sleep(attempt * 4000);
    }
  }
  throw lastErr || new Error('Elevation fetch failed.');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rawPath = path.join(RAW_DIR, `${id}.osm.json`);
  if (!fs.existsSync(rawPath)) {
    console.error(
      `Missing ${rawPath}. Download the OSM geometry from Overpass Turbo first ` +
        `(see query template below) and save the raw JSON export there.`
    );
    process.exit(1);
  }

  console.log(`[${id}] ${presetName} (${presetCountry}) — processing geometry...`);
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8')) as RawOsmResponse;
  if (!raw || !Array.isArray(raw.elements) || raw.elements.length === 0) {
    console.error('The OSM file contains no elements. Re-download it from Overpass Turbo.');
    process.exit(1);
  }

  console.log(`   ${raw.elements.length} OSM elements — fetching elevation from Open-Meteo...`);
  const elevation = await fetchElevationRobust();

  const mapData = processOsmData(
    raw,
    location,
    RADIUS,
    'Bundled: Overpass Turbo + Open-Meteo DEM',
    elevation
  );

  const target = path.join(OUT_DIR, `${id}.json`);
  fs.writeFileSync(target, JSON.stringify(mapData));

  console.log(
    `   OK -> ${mapData.buildings.length} buildings, ${mapData.roads.length} roads, ` +
      `${mapData.landuse.length} landuse, DEM ${elevation.minElevation}..${elevation.maxElevation}m ` +
      `-> ${path.relative(process.cwd(), target)}\n`
  );
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

/**
 * OVERPASS TURBO QUERY — paste into https://overpass-turbo.eu, replace LAT/LON
 * with the city center, Run, then Export -> Download data as JSON, and save the
 * result as src/data/maps-raw/<presetId>.osm.json
 *
 * [out:json][timeout:180];
 * (
 *   way["building"](around:900,LAT,LON);
 *   way["highway"](around:900,LAT,LON);
 *   way["landuse"](around:900,LAT,LON);
 *   way["leisure"](around:900,LAT,LON);
 *   way["natural"](around:900,LAT,LON);
 *   way["amenity"](around:900,LAT,LON);
 *   node["natural"="tree"](around:900,LAT,LON);
 *   node["highway"="street_lamp"](around:900,LAT,LON);
 *   node["amenity"](around:900,LAT,LON);
 * );
 * out body;
 * >;
 * out skel qt;
 */
