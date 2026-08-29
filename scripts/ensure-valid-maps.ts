import fs from 'fs';
import path from 'path';
import {
  MapData,
  GeoPoint,
  BuildingPolygon,
  RoadSegment,
  LanduseArea,
  ResourceNode,
  BuildingCategory,
  ElevationGrid,
} from '../src/types/map';

const CURATED_LOCATIONS = [
  // 8km x 8km tactical maps => 4000m half-span (fallback emergency data).
  { id: 'evesham', name: 'Evesham, UK', lat: 52.0917, lon: -1.9472, radius: 4000, minEl: 19, maxEl: 63 },
  { id: 'oxford', name: 'Oxford, UK', lat: 51.7520, lon: -1.2577, radius: 4000, minEl: 54, maxEl: 125 },
  { id: 'london_soho', name: 'London Soho, UK', lat: 51.5074, lon: -0.1278, radius: 4000, minEl: 8, maxEl: 32 },
  { id: 'paris_cite', name: 'Paris Île de la Cité, France', lat: 48.8566, lon: 2.3522, radius: 4000, minEl: 28, maxEl: 45 },
  { id: 'berlin_mitte', name: 'Berlin Mitte, Germany', lat: 52.5200, lon: 13.4050, radius: 4000, minEl: 34, maxEl: 52 },
  { id: 'rome_centro', name: 'Rome Centro, Italy', lat: 41.9028, lon: 12.4964, radius: 4000, minEl: 14, maxEl: 58 },
  { id: 'tokyo_shibuya', name: 'Tokyo Shibuya, Japan', lat: 35.6762, lon: 139.6503, radius: 4000, minEl: 12, maxEl: 48 },
  { id: 'san_francisco', name: 'San Francisco, USA', lat: 37.7749, lon: -122.4194, radius: 4000, minEl: 15, maxEl: 95 },
];

function generateFallbackMap(loc: (typeof CURATED_LOCATIONS)[0]): MapData {
  const center: GeoPoint = { lat: loc.lat, lon: loc.lon };
  const radius = loc.radius;
  const resolution = 16;
  const grid: number[][] = [];
  const span = loc.maxEl - loc.minEl;

  // Elevation grid
  for (let z = 0; z < resolution; z++) {
    const row: number[] = [];
    for (let x = 0; x < resolution; x++) {
      const nx = (x / (resolution - 1)) * 2 - 1;
      const nz = (z / (resolution - 1)) * 2 - 1;
      const h = Math.sin(nx * 2.8) * 0.35 + Math.cos(nz * 2.2) * 0.35 - (nx * nx + nz * nz) * 0.15;
      row.push(loc.minEl + ((h + 1) / 2) * span);
    }
    grid.push(row);
  }

  const elevationGrid: ElevationGrid = {
    resolution,
    grid,
    minElevation: loc.minEl,
    maxElevation: loc.maxEl,
    baseElevation: loc.minEl + span * 0.25,
    bounds: { minX: -radius, maxX: radius, minZ: -radius, maxZ: radius },
  };

  // Roads
  const roads: RoadSegment[] = [];
  const gridSize = 120;
  for (let x = -800; x <= 800; x += gridSize) {
    roads.push({
      id: `road_v_${x}`,
      name: `Avenue ${Math.abs(x)}`,
      highwayType: Math.abs(x) % 240 === 0 ? 'primary' : 'residential',
      width: Math.abs(x) % 240 === 0 ? 12 : 7,
      points: [
        { x, z: -850 },
        { x: x + Math.sin(x * 0.01) * 15, z: 0 },
        { x, z: 850 },
      ],
    });
  }
  for (let z = -800; z <= 800; z += gridSize) {
    roads.push({
      id: `road_h_${z}`,
      name: `Street ${Math.abs(z)}`,
      highwayType: Math.abs(z) % 240 === 0 ? 'secondary' : 'residential',
      width: Math.abs(z) % 240 === 0 ? 10 : 6,
      points: [
        { x: -850, z },
        { x: 0, z: z + Math.cos(z * 0.01) * 15 },
        { x: 850, z },
      ],
    });
  }

  // River & Parks (Landuse)
  const landuse: LanduseArea[] = [];
  // River
  const riverPts: { x: number; z: number }[] = [];
  for (let t = -900; t <= 900; t += 50) {
    const rx = Math.sin(t * 0.003) * 200 - 300;
    riverPts.push({ x: rx - 35, z: t });
  }
  for (let t = 900; t >= -900; t -= 50) {
    const rx = Math.sin(t * 0.003) * 200 - 300;
    riverPts.push({ x: rx + 35, z: t });
  }
  landuse.push({
    id: 'river_main',
    type: 'water',
    name: 'Main Waterway',
    polygon: riverPts,
  });

  // Central Park
  landuse.push({
    id: 'park_central',
    type: 'park',
    name: 'District Memorial Park',
    polygon: [
      { x: 50, z: 50 },
      { x: 280, z: 50 },
      { x: 280, z: 280 },
      { x: 50, z: 280 },
    ],
  });

  // Forest Grove
  landuse.push({
    id: 'forest_north',
    type: 'forest',
    name: 'North Woodland',
    polygon: [
      { x: -500, z: -500 },
      { x: -200, z: -520 },
      { x: -220, z: -250 },
      { x: -480, z: -280 },
    ],
  });

  // Buildings
  const buildings: BuildingPolygon[] = [];
  let bldgCount = 0;
  for (let bx = -750; bx <= 750; bx += gridSize) {
    for (let bz = -750; bz <= 750; bz += gridSize) {
      if (Math.abs(bx + 300) < 90) continue; // river
      if (bx >= 50 && bx <= 280 && bz >= 50 && bz <= 280) continue; // park

      const w = 35 + ((bx * bz) % 20);
      const d = 30 + ((bx + bz) % 20);
      const cx = bx + gridSize / 2;
      const cz = bz + gridSize / 2;

      const levels = 1 + (Math.abs(cx * cz) % 6);
      const height = levels * 3.5;
      const categories: BuildingCategory[] = ['residential', 'commercial', 'industrial', 'supermarket', 'civic'];
      const bType = categories[Math.abs(cx + cz) % categories.length];

      buildings.push({
        id: `bldg_${++bldgCount}`,
        type: bType,
        rawType: bType,
        name: `${bType.toUpperCase()} Facility #${bldgCount}`,
        levels,
        height,
        center: { x: cx, z: cz },
        polygon: [
          { x: cx - w / 2, z: cz - d / 2 },
          { x: cx + w / 2, z: cz - d / 2 },
          { x: cx + w / 2, z: cz + d / 2 },
          { x: cx - w / 2, z: cz + d / 2 },
        ],
        tags: { building: bType },
      });
    }
  }

  // Resource nodes
  const resourceNodes: ResourceNode[] = [];
  let nodeCount = 0;
  let woodCount = 0;
  let metalCount = 0;
  let bricksCount = 0;

  for (let i = 0; i < 200; i++) {
    const rx = Math.sin(i * 12.3) * 0.8 * 800;
    const rz = Math.cos(i * 7.9) * 0.8 * 800;
    const types: Array<{ type: 'wood' | 'metal' | 'bricks'; sub: ResourceNode['subType']; amount: number; max: number }> = [
      { type: 'wood', sub: 'tree', amount: 80, max: 80 },
      { type: 'metal', sub: 'car_sedan', amount: 120, max: 120 },
      { type: 'metal', sub: 'car_suv', amount: 150, max: 150 },
      { type: 'bricks', sub: 'rubble_brick', amount: 100, max: 100 },
    ];
    const pick = types[i % types.length];
    if (pick.type === 'wood') woodCount += pick.amount;
    else if (pick.type === 'metal') metalCount += pick.amount;
    else if (pick.type === 'bricks') bricksCount += pick.amount;

    resourceNodes.push({
      id: `res_${++nodeCount}`,
      type: pick.type,
      subType: pick.sub,
      position: { x: rx, z: rz },
      rotation: Math.random() * Math.PI * 2,
      scale: 0.9 + Math.random() * 0.2,
      source: 'road_side',
      amount: pick.amount,
      maxAmount: pick.max,
      isDepleted: false,
    });
  }

  return {
    center,
    radius,
    buildings,
    roads,
    landuse,
    resourceNodes,
    elevation: elevationGrid,
    bounds: {
      minX: -radius,
      maxX: radius,
      minZ: -radius,
      maxZ: radius,
    },
    stats: {
      buildingCount: buildings.length,
      roadCount: roads.length,
      resourceCount: {
        wood: woodCount,
        metal: metalCount,
        bricks: bricksCount,
        total: woodCount + metalCount + bricksCount,
      },
      elevationRangeMeters: loc.maxEl - loc.minEl,
      processedTimeMs: 120,
    },
    fetchedAt: Date.now(),
    source: `Bundled Curated Map (${loc.name})`,
  };
}

function ensureValidMaps() {
  const dir = path.resolve('src/data/maps');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  for (const loc of CURATED_LOCATIONS) {
    const file = path.join(dir, `${loc.id}.json`);
    let isValid = false;
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (
          parsed &&
          Array.isArray(parsed.buildings) &&
          parsed.buildings.length > 0 &&
          parsed.elevation &&
          parsed.stats
        ) {
          isValid = true;
          console.log(`✓ ${loc.id}.json is valid (${parsed.buildings.length} buildings, ${parsed.roads?.length ?? 0} roads)`);
        }
      } catch (e) {
        console.warn(`File ${loc.id}.json was corrupted, regenerating.`);
      }
    }

    if (!isValid) {
      console.log(`Generating valid map for ${loc.name}...`);
      const mapData = generateFallbackMap(loc);
      fs.writeFileSync(file, JSON.stringify(mapData, null, 2), 'utf8');
      console.log(`✓ Saved valid ${loc.id}.json`);
    }
  }
}

ensureValidMaps();
