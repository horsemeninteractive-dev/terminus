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
 * True when two convex polygons (in consistent winding) overlap, using the
 * separating-axis test on every edge normal. Exact for the rotated rectangles
 * freestanding footprints and gate/tower modules are, and a conservative
 * approximation for concave OSM footprints (their convex hull effectively —
 * close enough for collision, and never misses a real overlap).
 */
function convexPolysIntersect(
  a: Array<{ x: number; z: number }>,
  b: Array<{ x: number; z: number }>
): boolean {
  const axes: Array<{ x: number; z: number }> = [];
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const ex = p2.x - p1.x;
      const ez = p2.z - p1.z;
      const len = Math.hypot(ex, ez);
      if (len < 1e-9) continue;
      axes.push({ x: ez / len, z: -ex / len });
    }
  }
  for (const axis of axes) {
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const p of a) {
      const d = p.x * axis.x + p.z * axis.z;
      if (d < aMin) aMin = d;
      if (d > aMax) aMax = d;
    }
    for (const p of b) {
      const d = p.x * axis.x + p.z * axis.z;
      if (d < bMin) bMin = d;
      if (d > bMax) bMax = d;
    }
    if (aMax < bMin || bMax < aMin) return false;
  }
  return true;
}

/**
 * How far a freestanding facility footprint may graze an existing building's
 * mapped outline before it counts as "inside" it. OSM building polygons are
 * simplified outlines, so a sub-metre touch along an edge must not block
 * placement — but anything that meaningfully crosses into a building does.
 */
export const BUILDING_OVERLAP_TOLERANCE = 0.5;

/**
 * Extra allowance for the fence/wall/gate/tower family: fence runs SNAP to the
 * edges of existing freestanding structures by design (snapToFreestandingEdge),
 * so a snapped segment's centre sits ON a footprint edge and its half-width
 * (~1.2 m) legitimately overlaps the outline. A wall butted flush against a
 * tower or the perimeter of an adapted building is intended contact, not a
 * collision — only a wall passing meaningfully THROUGH a building is invalid.
 */
export const WALL_FLUSH_TOLERANCE = 1.6;

export function getBuildingOverlapTolerance(typeId: string): number {
  if (
    WALL_TYPES.includes(typeId) ||
    GATE_TYPES.includes(typeId) ||
    TOWER_TYPES.includes(typeId)
  ) {
    return WALL_FLUSH_TOLERANCE;
  }
  return BUILDING_OVERLAP_TOLERANCE;
}

/**
 * True when a freestanding structure placed at (x, z) with the given rotation
 * overlaps an existing building footprint — either an OSM building (its mapped
 * polygon) or another settlement structure (adapted or freestanding). This is
 * the shared rule for both the red placement ghost and the commit-time guard in
 * buildFreestanding, so what the player sees as invalid is exactly what the
 * service rejects.
 *
 * Tolerance is type-aware: facilities may graze an outline by 0.5 m; the
 * fence/wall/gate/tower family gets a 1.6 m flush-contact allowance because
 * fence runs snap to structure edges by design (see WALL_FLUSH_TOLERANCE).
 */
export function freestandingFootprintOverlapsBuildings(
  free: Pick<AdaptedBuilding, 'typeId' | 'position' | 'rotationDeg'> & { width?: number; length?: number },
  existingPolygons: Array<{ polygon: Point2D[] }>
): boolean {
  const tolerance = getBuildingOverlapTolerance(free.typeId);
  const footprint = getFreestandingCollisionPolygon(free);
  if (!footprint || footprint.length < 3) return false;

  for (const existing of existingPolygons) {
    const poly = existing.polygon;
    if (!poly || poly.length < 3) continue;

    // Quick reject: bounding-box overlap test before the exact SAT pass.
    let minAx = Infinity, maxAx = -Infinity, minAz = Infinity, maxAz = -Infinity;
    for (const p of footprint) {
      if (p.x < minAx) minAx = p.x;
      if (p.x > maxAx) maxAx = p.x;
      if (p.z < minAz) minAz = p.z;
      if (p.z > maxAz) maxAz = p.z;
    }
    let minBx = Infinity, maxBx = -Infinity, minBz = Infinity, maxBz = -Infinity;
    for (const p of poly) {
      if (p.x < minBx) minBx = p.x;
      if (p.x > maxBx) maxBx = p.x;
      if (p.z < minBz) minBz = p.z;
      if (p.z > maxBz) maxBz = p.z;
    }
    if (maxAx < minBx - tolerance || maxBx < minAx - tolerance) continue;
    if (maxAz < minBz - tolerance || maxBz < minAz - tolerance) continue;

    // Exact test: SAT on the (convexified) outlines, shrunk by the tolerance
    // so edge-grazing placements pass. Shrinking via an inward inset of each
    // polygon towards its centroid approximates the tolerance band cheaply.
    const inset = (pts: Array<{ x: number; z: number }>): Array<{ x: number; z: number }> => {
      let cx = 0, cz = 0;
      for (const p of pts) { cx += p.x; cz += p.z; }
      cx /= pts.length; cz /= pts.length;
      return pts.map((p) => {
        const dx = p.x - cx, dz = p.z - cz;
        const len = Math.hypot(dx, dz);
        if (len <= tolerance) return { x: p.x, z: p.z };
        const k = (len - tolerance) / len;
        return { x: cx + dx * k, z: cz + dz * k };
      });
    };
    const a = inset(footprint);
    const b = inset(poly);
    if (convexPolysIntersect(a, b)) return true;
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
