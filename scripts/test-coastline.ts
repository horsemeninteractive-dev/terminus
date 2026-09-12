/**
 * Synthetic coastline → water conversion test: builds a fake Overpass response
 * with a diagonal coastline across the map and verifies processOsmData emits a
 * sea polygon covering the correct (water-on-the-right) side.
 * Run: bun scripts/test-coastline.ts
 */
import { processOsmData } from '../src/services/mapProcessor';
import type { MapData } from '../src/types/map';

const lat = 38.7; // Portugal coast-ish
const lon = -9.4;
const radius = 2000;

// Fake elevation grid (flat) so the metadata path runs.
const res = 4;
const fakeElevation = {
  minElevation: 0,
  maxElevation: 0,
  baseElevation: 0,
  resolution: res,
  grid: Array.from({ length: res + 1 }, () => Array(res + 1).fill(0)),
  bounds: { minX: -radius, maxX: radius, minZ: -radius, maxZ: radius },
};

// Simple WGS84 -> local meters matching src/services/projection.ts
const EARTH_RADIUS = 6371000;
const toXY = (la: number, lo: number) => {
  const rad = Math.PI / 180;
  const avgLatRad = (lat * Math.PI) / 180;
  return {
    x: (lo - lon) * rad * EARTH_RADIUS * Math.cos(avgLatRad),
    z: -(la - lat) * rad * EARTH_RADIUS,
  };
};

const elements: any[] = [];

// Diagonal coastline arc from the north edge to the south edge of the map.
// OSM convention: land on the LEFT of the direction of travel, water on the
// RIGHT. Direction of travel is (+x, +z) = south-east (x east, z south), so
// the walker's right hand points south-west: water = SW half, land = NE half.
// cross(ex,ez; dx,dz) = ex*dz - ez*dx; right side means cross > 0 → water.
const arcPoints: Array<[number, number]> = [
  [-1800, -1800],
  [0, 0],
  [1800, 1800],
];
let nodeId = 100000;
let prev: { x: number; z: number } | null = null;
for (const [x, z] of arcPoints) {
  // Convert local meters back to lat/lon (inverse of toXY) for the fake node.
  const rad = Math.PI / 180;
  const avgLatRad = (lat * Math.PI) / 180;
  const nLat = lat - (z / EARTH_RADIUS) / rad;
  const nLon = lon + (x / (EARTH_RADIUS * Math.cos(avgLatRad))) / rad;
  elements.push({ type: 'node', id: nodeId, lat: nLat, lon: nLon });
  prev = { x, z };
  nodeId++;
}
elements.push({
  type: 'way',
  id: 500000,
  nodes: [100000, 100001, 100002],
  tags: { natural: 'coastline' },
});

// Sanity: replicate the wayMap point conversion to check the arc's meters.
const chk = elements.filter(e => e.type === 'node').map(n => {
  const p = toXY(n.lat, n.lon);
  return [p.x, p.z];
});
console.log('arc points in meters (expected ~[-1800,-1800],[0,0],[1800,1800]):', JSON.stringify(chk));

// Debug: run classifyLanduse-equivalent inline
const way = elements.find(e => e.type === 'way');
console.log('way tags:', JSON.stringify(way.tags), 'nodes:', way.nodes);

const raw = { elements };
const processed = processOsmData(raw, { lat, lon }, radius, 'debug', fakeElevation as any) as MapData;

console.log('all landuse types:', processed.landuse.map(l => l.type).join(','));
const water = processed.landuse.filter((l) => l.type === 'water');
const coastlines = processed.landuse.filter((l) => l.type === 'coastline');
console.log(`water areas: ${water.length}, leftover coastline arcs: ${coastlines.length}`);

let totalArea = 0;
for (const w of water) {
  let a = 0;
  for (let i = 0; i < w.polygon.length; i++) {
    const p1 = w.polygon[i];
    const p2 = w.polygon[(i + 1) % w.polygon.length];
    a += p1.x * p2.z - p2.x * p1.z;
  }
  totalArea += Math.abs(a) / 2;
}
console.log(`total water area: ${Math.round(totalArea / 1e4) / 100} km²`);

// Expected: the sea side of the diagonal line z = x in (x, z) space is the
// south-west half (water on the right of the south-east heading arc).
const sampleSea = { x: -1500, z: 1500 }; // south-west corner (right of arc)
const sampleLand = { x: 1500, z: -1500 }; // north-east corner (left of arc)
const inPoly = (pt: { x: number; z: number }, poly: Array<{ x: number; z: number }>) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z;
    const xj = poly[j].x, zj = poly[j].z;
    if (zi > pt.z !== zj > pt.z && pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};
const seaHit = water.some((w) => inPoly(sampleSea, w.polygon));
const landHit = water.some((w) => inPoly(sampleLand, w.polygon));
console.log(`SW corner (should be sea): ${seaHit ? 'SEA ✓' : 'NOT SEA ✗'}`);
console.log(`NE corner (should be land): ${landHit ? 'WRONGLY SEA ✗' : 'LAND ✓'}`);

if (water.length > 0 && seaHit && !landHit && coastlines.length === 0) {
  console.log('\nPASS: coastline correctly converted to sea polygon on the right-hand side.');
} else {
  console.log('\nFAIL: coastline conversion incorrect.');
  process.exit(1);
}
