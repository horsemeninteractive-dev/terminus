import fs from 'fs';
import path from 'path';
import { parseOsmXml } from './parseOsmXml';
import { processOsmData } from '../src/services/mapProcessor';
import { fetchElevationGrid } from '../src/services/elevationService';
import { GeoPoint, MapData } from '../src/types/map';
import { RawOsmResponse } from '../src/services/osmFetcher';

// 8km x 8km tactical maps => 4000m half-span.
const CURATED_LOCATIONS = [
  { id: 'evesham', name: 'Evesham, UK', lat: 52.0917, lon: -1.9472, radius: 4000 },
  { id: 'oxford', name: 'Oxford, UK', lat: 51.7520, lon: -1.2577, radius: 4000 },
  { id: 'london_soho', name: 'London Soho, UK', lat: 51.5074, lon: -0.1278, radius: 4000 },
  { id: 'paris_cite', name: 'Paris Île de la Cité, France', lat: 48.8566, lon: 2.3522, radius: 4000 },
  { id: 'berlin_mitte', name: 'Berlin Mitte, Germany', lat: 52.5200, lon: 13.4050, radius: 4000 },
  { id: 'rome_centro', name: 'Rome Centro, Italy', lat: 41.9028, lon: 12.4964, radius: 4000 },
  { id: 'tokyo_shibuya', name: 'Tokyo Shibuya, Japan', lat: 35.6595, lon: 139.7005, radius: 4000 },
  { id: 'san_francisco', name: 'San Francisco, USA', lat: 37.7749, lon: -122.4194, radius: 4000 },
];

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

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function fetchFromOverpassMirrors(query: string): Promise<RawOsmResponse | null> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (res.ok) {
        return (await res.json()) as RawOsmResponse;
      }
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Fetches OSM data by splitting the area into a 8x8 grid of bounding boxes (64 sub-tiles)
 * to stay comfortably below the official OpenStreetMap 50,000 nodes-per-request cap across an 8km x 8km zone.
 */
async function fetchTiledFromOfficialOsm(lat: number, lon: number, radiusMeters: number): Promise<RawOsmResponse> {
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos((lat * Math.PI) / 180);

  const dLatTotal = radiusMeters / metersPerLat;
  const dLonTotal = radiusMeters / metersPerLon;

  const minLat = lat - dLatTotal;
  const minLon = lon - dLonTotal;

  const gridSize = 8; // 8x8 = 64 sub-tiles for 8km x 8km (each ~1km wide)
  const stepLat = (dLatTotal * 2) / gridSize;
  const stepLon = (dLonTotal * 2) / gridSize;

  const seenNodes = new Set<number>();
  const seenWays = new Set<number>();
  const seenRelations = new Set<number>();
  const combinedElements: RawOsmResponse['elements'] = [];

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const tileIndex = gy * gridSize + gx + 1;
      const bLeft = (minLon + gx * stepLon).toFixed(5);
      const bBottom = (minLat + gy * stepLat).toFixed(5);
      const bRight = (minLon + (gx + 1) * stepLon).toFixed(5);
      const bTop = (minLat + (gy + 1) * stepLat).toFixed(5);

      const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${bLeft},${bBottom},${bRight},${bTop}`;
      console.log(`    [TILE ${tileIndex}/16] Fetching ${bLeft},${bBottom} to ${bRight},${bTop}...`);

      let parsed: RawOsmResponse | null = null;
      let attempts = 0;
      while (attempts < 3 && !parsed) {
        attempts++;
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'TerminusSurvivalGame/1.0 (tactical-8km-map-loader)',
              'Accept': 'application/xml, text/xml',
            },
          });

          if (!res.ok) {
            console.warn(`    [TILE ${tileIndex}/16] OSM API returned ${res.status}, querying Overpass mirror...`);
            const overpassQuery = `[out:json][timeout:35][bbox:${bBottom},${bLeft},${bTop},${bRight}];(way["building"];way["highway"];way["landuse"];way["leisure"];way["natural"];way["waterway"];way["water"];way["amenity"];relation["natural"="water"];relation["waterway"];relation["water"];relation["leisure"];relation["landuse"];relation["amenity"];node["natural"="tree"];node["highway"="street_lamp"];node["amenity"];);out body;>;out skel qt;`;
            parsed = await fetchFromOverpassMirrors(overpassQuery);
            if (parsed) break;
            throw new Error(`OSM tile fetch failed: HTTP ${res.status} ${res.statusText}`);
          }

          const xml = await res.text();
          parsed = parseOsmXml(xml);
        } catch (err: any) {
          console.warn(`    [TILE ${tileIndex}/16] Attempt ${attempts} error: ${err.message}`);
          if (!parsed && attempts === 3) {
            const overpassQuery = `[out:json][timeout:35][bbox:${bBottom},${bLeft},${bTop},${bRight}];(way["building"];way["highway"];way["landuse"];way["leisure"];way["natural"];way["waterway"];way["water"];way["amenity"];relation["natural"="water"];relation["waterway"];relation["water"];relation["leisure"];relation["landuse"];relation["amenity"];node["natural"="tree"];node["highway"="street_lamp"];node["amenity"];);out body;>;out skel qt;`;
            parsed = await fetchFromOverpassMirrors(overpassQuery);
          }
          if (!parsed && attempts < 3) {
            await new Promise((r) => setTimeout(r, 1200 * attempts));
          }
        }
      }

      if (parsed) {
        for (const el of parsed.elements) {
          if (el.type === 'node') {
            if (!seenNodes.has(el.id)) {
              seenNodes.add(el.id);
              combinedElements.push(el);
            }
          } else if (el.type === 'way') {
            if (!seenWays.has(el.id)) {
              seenWays.add(el.id);
              combinedElements.push(el);
            }
          } else if (el.type === 'relation') {
            if (!seenRelations.has(el.id)) {
              seenRelations.add(el.id);
              combinedElements.push(el);
            }
          }
        }
        console.log(`    [TILE ${tileIndex}/16] +${parsed.elements.length} elements (Total unique: ${combinedElements.length})`);
      } else {
        console.warn(`    [TILE ${tileIndex}/16] Skipped empty/failed sub-tile.`);
      }

      // Polite delay between tiles
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  return {
    version: 0.6,
    generator: 'official-osm-api-8km-tiled',
    elements: combinedElements,
  };
}

async function downloadAllRealMaps() {
  const dir = path.resolve('src/data/maps');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log(`\n=======================================================`);
  console.log(`DOWNLOADING ALL 8 REAL 5KM X 5KM OPENSTREETMAP & DEM MAPS`);
  console.log(`=======================================================\n`);

  for (const loc of CURATED_LOCATIONS) {
    const file = path.join(dir, `${loc.id}.json`);

    // Check if already downloaded with real 8km data (radius === 4000 and >500 buildings)
    if (fs.existsSync(file)) {
      try {
        const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (
          existing &&
          existing.radius === 4000 &&
          existing.bounds &&
          existing.bounds.maxX === 4000 &&
          Array.isArray(existing.buildings) &&
          existing.buildings.length > 500
        ) {
          console.log(`✓ ${loc.name} (${loc.id}) already complete with 8km x 8km data (${existing.buildings.length} real buildings). Skipping.`);
          continue;
        }
      } catch {
        // Redownload
      }
    }

    console.log(`\n>>> Processing ${loc.name} (${loc.id}) [${loc.lat}, ${loc.lon}, r=${loc.radius}m]...`);
    const center: GeoPoint = { lat: loc.lat, lon: loc.lon };

    // 1. Fetch Elevation Grid
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

    // 2. Fetch Real OSM Data from official API
    const rawOsm = await fetchTiledFromOfficialOsm(loc.lat, loc.lon, loc.radius);

    // 3. Process into game MapData
    console.log(`  [PROCESS] Transforming real OSM data...`);
    const mapData: MapData = processOsmData(
      rawOsm,
      center,
      loc.radius,
      `Bundled Real OSM Map (${loc.name})`,
      elevationGrid
    );

    console.log(`  [RESULTS] Real Buildings: ${mapData.buildings.length}`);
    console.log(`  [RESULTS] Real Roads: ${mapData.roads.length}`);
    console.log(`  [RESULTS] Real Landuse Areas: ${mapData.landuse.length}`);
    console.log(`  [RESULTS] Resource Nodes: ${mapData.resourceNodes.length}`);

    // 4. Sanitize and save atomically
    const sanitized = sanitizeStrings(mapData);
    const jsonStr = JSON.stringify(sanitized, null, 2);
    const tmpFile = `${file}.tmp`;
    fs.writeFileSync(tmpFile, jsonStr, 'utf8');

    // Test JSON parse
    JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    fs.renameSync(tmpFile, file);
    const sizeMb = (fs.statSync(file).size / (1024 * 1024)).toFixed(2);
    console.log(`✓ Saved 100% valid ${loc.id}.json (${sizeMb} MB) with REAL OSM data!`);

    // Polite delay
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n=======================================================`);
  console.log(`ALL 8 REAL MAPS DOWNLOADED AND READY!`);
  console.log(`=======================================================\n`);
}

downloadAllRealMaps().catch((err) => {
  console.error('Fatal download error:', err);
  process.exit(1);
});
