import { Point2D } from '../types/map';
import { AdaptedBuilding } from '../types/settlement';

const WALL_TYPES = ['wooden_palisade', 'brick_wall', 'fortified_wall', 'metal_fence', 'barbed_wire'];
const GATE_TYPES = ['wooden_gate', 'metal_gate', 'fortified_gate'];
const TOWER_TYPES = ['wooden_tower', 'metal_tower', 'fortified_tower', 'floodlight_tower'];
// IFZ fields/greenhouses: freestanding flat rectangular plots (vast = bigger).
const FIELD_TYPES = ['field', 'vast_field'];
const GREENHOUSE_TYPES = ['greenhouse', 'greenhouse_hydro'];

/**
 * §Terminus freestanding module footprints: freestanding facilities are NOT
 * generic 8×8 boxes. Each type has its own PREDEFINED module dimensions (the
 * IFZ model: adaptations take their size from the existing building, while
 * freestanding buildings come with a fixed footprint). These drive the
 * placement ghost, the collision polygon, the rendered shell and the
 * size-derived capacity/durability every freestanding build computes — so a
 * Cannery reads as a Cannery and a Hospital reads as a Hospital, not as
 * "an 8×8 box called X".
 */
const FACILITY_MODULES: Record<string, { width: number; length: number }> = {
  // ---- basic ----
  headquarters: { width: 12, length: 14 },
  squad_quarters: { width: 8, length: 10 },
  warehouse: { width: 16, length: 22 },
  shelter: { width: 10, length: 14 },
  house: { width: 10, length: 12 },
  shelter_bunkhouse: { width: 10, length: 14 },
  storage_depot: { width: 14, length: 20 },
  water_cistern: { width: 10, length: 14 },
  // ---- food ----
  field: { width: 16, length: 20 },
  vast_field: { width: 24, length: 30 },
  greenhouse: { width: 12, length: 16 },
  greenhouse_hydro: { width: 12, length: 16 },
  barn: { width: 14, length: 16 },
  cookhouse: { width: 8, length: 10 },
  cannery: { width: 14, length: 18 },
  food_pantry: { width: 8, length: 10 },
  // ---- production ----
  foresters_hut: { width: 6, length: 8 },
  sawmill: { width: 14, length: 18 },
  tool_factory: { width: 12, length: 16 },
  scrapyard: { width: 16, length: 22 },
  arms_factory: { width: 14, length: 18 },
  chemical_plant: { width: 14, length: 16 },
  protective_gear_factory: { width: 12, length: 16 },
  vehicle_workshop: { width: 14, length: 20 },
  clay_pit: { width: 12, length: 14 },
  workshop_forge: { width: 10, length: 12 },
  timber_mill: { width: 14, length: 18 },
  scrap_smelter: { width: 12, length: 16 },
  armory_cache: { width: 6, length: 8 },
  // ---- defense (alias structures keep their real shape) ----
  guard_watchtower: { width: 5.2, length: 5.2 },
  barricade_gatehouse: { width: 6, length: 8 },
  // ---- utility ----
  antenna: { width: 4, length: 4 },
  research_center: { width: 10, length: 14 },
  research_lab: { width: 10, length: 14 },
  weather_center: { width: 6, length: 8 },
  medbay: { width: 10, length: 14 },
  infirmary_clinic: { width: 8, length: 10 },
  hospital: { width: 14, length: 20 },
  repairmen_shop: { width: 10, length: 12 },
  shooting_range: { width: 12, length: 20 },
  expedition_center: { width: 12, length: 16 },
  generator_station: { width: 8, length: 10 },
  battery_bank: { width: 8, length: 10 },
  comms_relay: { width: 6, length: 8 },
  // ---- civilian ----
  kindergarten: { width: 10, length: 12 },
  bar: { width: 8, length: 12 },
  gathering_place: { width: 12, length: 14 },
  community_hall: { width: 12, length: 16 },
  // ---- decorative ----
  mast: { width: 2, length: 2 },
};

/**
 * Rendered footprint dimensions for a freestanding structure type. Must stay in
 * sync with BuildingRenderer.renderFreestandingBody so collision matches what
 * the player actually sees. Walls/gates/towers are drag-built lines with their
 * own rules; every static facility reads its PREDEFINED module dimensions from
 * FACILITY_MODULES. The old generic 8×8 fallback now only guards unknown ids.
 */
export function getFreestandingDimensions(typeId: string): { width: number; length: number } {
  if (WALL_TYPES.includes(typeId)) return { width: 2.4, length: 10 };
  if (GATE_TYPES.includes(typeId)) return { width: 10, length: 3.2 };
  if (TOWER_TYPES.includes(typeId)) return { width: 5.2, length: 5.2 };
  const module = FACILITY_MODULES[typeId];
  if (module) return { ...module };
  if (FIELD_TYPES.includes(typeId)) return { width: 16, length: 20 };
  if (GREENHOUSE_TYPES.includes(typeId)) return { width: 12, length: 16 };
  return { width: 8, length: 8 };
}

export function isFreestandingField(typeId: string): boolean {
  return FIELD_TYPES.includes(typeId) || GREENHOUSE_TYPES.includes(typeId);
}

export function isFreestandingWall(typeId: string): boolean {
  return WALL_TYPES.includes(typeId);
}

export function isFreestandingTower(typeId: string): boolean {
  return TOWER_TYPES.includes(typeId);
}

/** Gates are openings in a fence line — pathing and vehicles may pass through. */
export function isFreestandingGate(typeId: string): boolean {
  return GATE_TYPES.includes(typeId);
}

/**
 * How deep a structure's footprint may penetrate past the mapped waterline
 * before it counts as "in the water". OSM water polygons are simplified
 * (0.8m point tolerance) and rivers render as soft banks, so a corner that
 * barely pokes into the mapped polygon on visually dry ground must NOT block
 * placement — this is what lets a palisade be built right to the water's edge.
 */
export const WATER_EDGE_TOLERANCE = 1.4;

function pointInPolygon(pt: { x: number; z: number }, poly: Array<{ x: number; z: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if (zi > pt.z !== zj > pt.z && pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegmentSq(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const abx = b.x - a.x, abz = b.z - a.z;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / ab2)) : 0;
  const dx = p.x - (a.x + abx * t), dz = p.z - (a.z + abz * t);
  return dx * dx + dz * dz;
}

/** Distance from a point to a polygon's boundary (0 when on the boundary). */
function distToPolygonBoundary(p: { x: number; z: number }, poly: Array<{ x: number; z: number }>): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distToSegmentSq(p, poly[j], poly[i]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * True when a freestanding structure placed at (x, z) with the given rotation
 * GENUINELY collides with open water. A collision requires a footprint sample
 * (centre, edge midpoint or corner) to sit inside a water polygon deeper than
 * WATER_EDGE_TOLERANCE past the mapped waterline — corners or edges that
 * merely graze the bank on visually dry ground don't block, so walls can be
 * built right to the water's edge.
 */
export function freestandingFootprintOverlapsWater(
  free: Pick<AdaptedBuilding, 'typeId' | 'position' | 'rotationDeg'> & { width?: number; length?: number },
  waterPolygons: Point2D[][]
): boolean {
  if (!waterPolygons || waterPolygons.length === 0) return false;

  const footprint = getFreestandingCollisionPolygon(free);
  const centre = free.position;
  // Midpoints of each edge — catches a wall running along a bank whose corners
  // and centre are all on dry ground but whose long side dips into the water.
  const midpoints = footprint.map((a, i) => {
    const b = footprint[(i + 1) % footprint.length];
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  });
  const samples = [centre, ...midpoints, ...footprint];

  for (const water of waterPolygons) {
    if (!water || water.length < 3) continue;

    for (const sample of samples) {
      if (!pointInPolygon(sample, water)) continue;
      // Inside the mapped water — but a shallow penetration (within tolerance
      // of the mapped waterline) is a graze, not a collision.
      if (distToPolygonBoundary(sample, water) > WATER_EDGE_TOLERANCE) return true;
    }
  }
  return false;
}

/**
 * Collision footprint of a freestanding structure: a rectangle of the type's
 * width x length centred on `position`, rotated by `rotationDeg` using the same
 * rotation convention as the three.js renderer (local +Z is the length axis).
 */
export function getFreestandingCollisionPolygon(free: Pick<AdaptedBuilding, 'typeId' | 'position' | 'rotationDeg'>): Point2D[] {
  // Fence/wall segments store their exact per-segment run length (so consecutive
  // segments butt with no gaps); fall back to the type's canonical dimensions.
  const dims = getFreestandingDimensions(free.typeId);
  const withDims = free as Pick<AdaptedBuilding, 'typeId' | 'position' | 'rotationDeg'> & { width?: number; length?: number };
  const width = withDims.width ?? dims.width;
  const length = withDims.length ?? dims.length;
  const rot = ((free.rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const hw = width / 2;
  const hl = length / 2;
  const local: Array<{ x: number; z: number }> = [
    { x: -hw, z: -hl },
    { x: hw, z: -hl },
    { x: hw, z: hl },
    { x: -hw, z: hl },
  ];
  return local.map((p) => ({
    x: free.position.x + p.x * cos + p.z * sin,
    z: free.position.z - p.x * sin + p.z * cos,
  }));
}
