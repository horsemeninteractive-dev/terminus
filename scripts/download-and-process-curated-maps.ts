import fs from 'fs';
import path from 'path';
import { RawOsmResponse } from '../src/services/osmFetcher';
import { processOsmData } from '../src/services/mapProcessor';
import { fetchElevationGrid } from '../src/services/elevationService';
import { GeoPoint, MapData } from '../src/types/map';

const CURATED_LOCATIONS = [
  // 8km x 8km tactical maps => 4000m half-span.
  { id: 'evesham', name: 'Evesham, UK', lat: 52.0917, lon: -1.9472, radius: 4000 },
  { id: 'oxford', name: 'Oxford, UK', lat: 51.7520, lon: -1.2577, radius: 4000 },
  { id: 'london_soho', name: 'London Soho, UK', lat: 51.5074, lon: -0.1278, radius: 4000 },
  { id: 'paris_cite', name: 'Paris Île de la Cité, France', lat: 48.8566, lon: 2.3522, radius: 4000 },
  { id: 'berlin_mitte', name: 'Berlin Mitte, Germany', lat: 52.5200, lon: 13.4050, radius: 4000 },
  { id: 'rome_centro', name: 'Rome Centro, Italy', lat: 41.9028, lon: 12.4964, radius: 4000 },
  { id: 'tokyo_shibuya', name: 'Tokyo Shibuya, Japan', lat: 35.6595, lon: 139.7005, radius: 4000 },
  { id: 'san_francisco', name: 'San Francisco, USA', lat: 37.7749, lon: -122.4194, radius: 4000 },
];

const OVERPASS_MIRRORS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

function buildFastOverpassQuery(lat: number, lon: number, halfSideMeters: number): string {
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const dLat = halfSideMeters / metersPerLat;
  const dLon = halfSideMeters / metersPerLon;

  const south = (lat - dLat).toFixed(6);
  const north = (lat + dLat).toFixed(6);
  const west = (lon - dLon).toFixed(6);
  const east = (lon + dLon).toFixed(6);

  return `[out:json][timeout:120][bbox:${south},${west},${north},${east}];
(
  way["building"];
  way["highway"];
  way["landuse"];
  way["leisure"];
  way["natural"];
  way["waterway"];
  way["water"];
  way["amenity"];
  relation["natural"="water"];
  relation["waterway"];
  relation["water"];
  relation["leisure"];
  relation["landuse"];
  relation["amenity"];
  node["amenity"];
);
out body;
>;
out skel qt;`;
}

async function fetchOsmWithRetries(lat: number, lon: number, radius: number): Promise<RawOsmResponse> {
  const query = buildFastOverpassQuery(lat, lon, radius);

  for (let attempt = 0; attempt < OVERPASS_MIRRORS.length * 2; attempt++) {
    const mirror = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    try {
      console.log(`  [OSM] Requesting from ${mirror}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const res = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn(`  [OSM] ${mirror} returned HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }

      const raw = (await res.json()) as RawOsmResponse;
      if (raw && Array.isArray(raw.elements) && raw.elements.length > 0) {
        console.log(`  [OSM] Successfully fetched ${raw.elements.length} real OSM elements!`);
        return raw;
      }
    } catch (err: any) {
      console.warn(`  [OSM] Error from ${mirror}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  throw new Error(`Failed to fetch OSM from all mirrors for (${lat}, ${lon})`);
}

function sanitizeStrings(val: any): any {
  if (typeof val === 'string') {
    return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeStrings);
  }
  if (val && typeof val === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      clean[sanitizeStrings(k)] = sanitizeStrings(v);
    }
    return clean;
  }
  return val;
}

async function downloadCuratedMaps() {
  const dir = path.resolve('src/data/maps');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log(`\n=======================================================`);
  console.log(`DOWNLOADING REAL OPENSTREETMAP & DEM ELEVATION DATA`);
  console.log(`=======================================================\n`);

  for (const loc of CURATED_LOCATIONS) {
    const file = path.join(dir, `${loc.id}.json`);

    // Check if already downloaded with real data (more than 500 buildings)
    if (fs.existsSync(file)) {
      try {
        const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (existing && Array.isArray(existing.buildings) && existing.buildings.length > 500) {
          console.log(`✓ ${loc.name} (${loc.id}) is already complete with ${existing.buildings.length} real buildings. Skipping.`);
          continue;
        }
      } catch {
        // Redownload
      }
    }

    console.log(`\n>>> Downloading ${loc.name} (${loc.id}) [${loc.lat}, ${loc.lon}, r=${loc.radius}m]...`);

    const center: GeoPoint = { lat: loc.lat, lon: loc.lon };

    // 1. Fetch Real DEM Elevation Grid
    console.log(`  [DEM] Fetching Open-Meteo elevation grid...`);
    let elevationGrid;
    try {
      elevationGrid = await fetchElevationGrid(center, loc.radius, 16);
      console.log(
        `  [DEM] Elevation: ${elevationGrid.minElevation.toFixed(1)}m to ${elevationGrid.maxElevation.toFixed(1)}m (base: ${elevationGrid.baseElevation.toFixed(1)}m)`
      );
    } catch (e: any) {
      console.warn(`  [DEM] Fallback elevation grid used:`, e.message);
      const span = 25;
      const base = 20;
      const res = 16;
      const grid: number[][] = [];
      for (let z = 0; z < res; z++) {
        const row: number[] = [];
        for (let x = 0; x < res; x++) {
          row.push(base + Math.sin(x * 0.45) * 6 + Math.cos(z * 0.45) * 6);
        }
        grid.push(row);
      }
      elevationGrid = {
        resolution: res,
        grid,
        minElevation: base - 8,
        maxElevation: base + span,
        baseElevation: base,
        bounds: { minX: -loc.radius, maxX: loc.radius, minZ: -loc.radius, maxZ: loc.radius },
      };
    }

    // 2. Fetch Real OSM Data
    const rawOsm = await fetchOsmWithRetries(loc.lat, loc.lon, loc.radius);

    // 3. Process into game MapData
    console.log(`  [PROCESS] Processing real geometry...`);
    const mapData: MapData = processOsmData(
      rawOsm,
      center,
      loc.radius,
      `Bundled Curated Map (${loc.name})`,
      elevationGrid
    );

    console.log(`  [RESULTS] Real Buildings: ${mapData.buildings.length}`);
    console.log(`  [RESULTS] Real Roads: ${mapData.roads.length}`);
    console.log(`  [RESULTS] Real Landuse Areas: ${mapData.landuse.length}`);
    console.log(`  [RESULTS] Resource Nodes: ${mapData.resourceNodes.length}`);

    // 4. Sanitize and save
    const sanitized = sanitizeStrings(mapData);
    const jsonStr = JSON.stringify(sanitized, null, 2);
    fs.writeFileSync(file, jsonStr, 'utf8');

    // Test JSON parse
    JSON.parse(fs.readFileSync(file, 'utf8'));
    const sizeMb = (fs.statSync(file).size / (1024 * 1024)).toFixed(2);
    console.log(`✓ Saved 100% valid ${loc.id}.json (${sizeMb} MB) with REAL OSM data!`);

    // Polite pause between cities
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n=======================================================`);
  console.log(`ALL 8 REAL MAPS DOWNLOADED AND VALIDATED SUCCESSFULLY!`);
  console.log(`=======================================================\n`);
}

downloadCuratedMaps().catch((err) => {
  console.error('Fatal download error:', err);
  process.exit(1);
});
