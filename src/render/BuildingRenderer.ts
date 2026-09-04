import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { sampleElevation } from '../services/elevationService';
import { getFreestandingDimensions } from '../services/freestandingFootprint';
import { BuildingCategory, BuildingPolygon, ElevationGrid } from '../types/map';
import { AdaptedBuilding, FunctionalCategory } from '../types/settlement';
import { getPrimaryAdaptedEntry, isBuildingOperational } from '../services/buildingOperational';
import {
  getBuildingTextureSet,
  getFreestandingMaterialTexture,
  getFreestandingBumpTexture,
  buildingVariantForId,
  getFlatRoofSet,
  selectFlatRoof,
  flatRoofLabel,
  FlatRoofType,
} from './buildingTextures';

/** Yields to the browser so the loading overlay can animate between heavy chunks. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export const CATEGORY_COLORS: Record<BuildingCategory, { label: string; accent: number }> = {
  supermarket: { label: 'Supermarket / Grocery', accent: 0xd97706 },
  pharmacy: { label: 'Pharmacy / Chemist', accent: 0x10b981 },
  hospital: { label: 'Hospital / Medical', accent: 0x059669 },
  police: { label: 'Police Station / Security', accent: 0x3b82f6 },
  gas_station: { label: 'Gas Station / Fuel', accent: 0xef4444 },
  commercial: { label: 'Commercial / Retail', accent: 0xa855f7 },
  restaurant: { label: 'Restaurant / Bar', accent: 0xf59e0b },
  industrial: { label: 'Industrial / Manufacturing', accent: 0x64748b },
  warehouse: { label: 'Warehouse / Storage', accent: 0x71717a },
  civic: { label: 'Civic / Government', accent: 0x6366f1 },
  school: { label: 'School / University', accent: 0x8b5cf6 },
  residential: { label: 'Residential House / Apartment', accent: 0x94a3b8 },
  other: { label: 'Unclassified Structure', accent: 0x6b7280 },
};

const FUNCTIONAL_CATEGORY_COLORS: Record<FunctionalCategory, { wall: number; roof: number; emissive: number; beacon: number }> = {
  basic: { wall: 0x3b5278, roof: 0x273b5e, emissive: 0x101f38, beacon: 0x3b82f6 },
  food: { wall: 0x2e5c3e, roof: 0x1f452c, emissive: 0x0e2415, beacon: 0x10b981 },
  production: { wall: 0x6b5329, roof: 0x54401d, emissive: 0x291d09, beacon: 0xf59e0b },
  defense: { wall: 0x6b2e2e, roof: 0x522020, emissive: 0x290d0d, beacon: 0xef4444 },
  defense_walls: { wall: 0x543328, roof: 0x3d231b, emissive: 0x1f0f0a, beacon: 0xe11d48 },
  defense_towers: { wall: 0x7c2d12, roof: 0x5a1e0b, emissive: 0x2d0d04, beacon: 0xf97316 },
  civilian: { wall: 0x6e3152, roof: 0x54213d, emissive: 0x290b1c, beacon: 0xec4899 },
  utility: { wall: 0x1e3a5f, roof: 0x142842, emissive: 0x0a1421, beacon: 0x06b6d4 },
  decorative: { wall: 0x475569, roof: 0x334155, emissive: 0x1e293b, beacon: 0x94a3b8 },
  other: { wall: 0x4f3575, roof: 0x3c265c, emissive: 0x1c0f30, beacon: 0x8b5cf6 },
};

// ---------------------------------------------------------------------------
// Freestanding facility appearance (§7.1 visual identity). Every type reads a
// wall material kind + roof colour + silhouette so player-built structures are
// distinguishable at a glance — a battery bank is a flat concrete pad with
// cabinets, a cistern is a plinth carrying a water tank, a generator wears a
// steel box with an exhaust stack, an antenna is a radio mast — instead of
// identical green 8×8 boxes.
// ---------------------------------------------------------------------------

type FreestandingMaterialKindName = 'wood' | 'brick' | 'metal' | 'concrete';

type FacilitySilhouette = 'gable' | 'flat' | 'tank' | 'stack' | 'cells' | 'antenna' | 'pole';

interface FacilityLook {
  kind: FreestandingMaterialKindName;
  roof: number; // top slab / gabled roof colour
  silhouette: FacilitySilhouette;
}

// Category defaults — every facility in a role family shares its construction
// style, then per-type entries override the silhouette/roof where the building
// has a distinctive form.
const FACILITY_LOOK_DEFAULTS: Record<FunctionalCategory, FacilityLook> = {
  basic: { kind: 'brick', roof: 0x4a5058, silhouette: 'gable' }, // brick-built homes & quarters
  food: { kind: 'wood', roof: 0x51443a, silhouette: 'gable' }, // timber barns & huts
  production: { kind: 'metal', roof: 0x5d646b, silhouette: 'flat' }, // industrial sheds
  defense: { kind: 'metal', roof: 0x5d646b, silhouette: 'flat' },
  defense_walls: { kind: 'metal', roof: 0x5d646b, silhouette: 'flat' },
  defense_towers: { kind: 'metal', roof: 0x5d646b, silhouette: 'flat' },
  utility: { kind: 'concrete', roof: 0x868d94, silhouette: 'flat' }, // civil/technical
  civilian: { kind: 'brick', roof: 0x555c66, silhouette: 'gable' }, // brick public halls
  decorative: { kind: 'metal', roof: 0x5d646b, silhouette: 'flat' },
  other: { kind: 'metal', roof: 0x5d646b, silhouette: 'flat' },
};

const FACILITY_LOOKS: Partial<Record<string, FacilityLook>> = {
  // Big sheds are corrugated metal boxes, not brick cottages
  warehouse: { kind: 'metal', roof: 0x5f666d, silhouette: 'flat' },
  storage_depot: { kind: 'metal', roof: 0x5f666d, silhouette: 'flat' },
  scrapyard: { kind: 'metal', roof: 0x605047, silhouette: 'flat' },
  cannery: { kind: 'metal', roof: 0x5f666d, silhouette: 'flat' },
  sawmill: { kind: 'wood', roof: 0x5f666d, silhouette: 'flat' },
  timber_mill: { kind: 'wood', roof: 0x5f666d, silhouette: 'flat' },
  tool_factory: { kind: 'metal', roof: 0x5f666d, silhouette: 'flat' },
  arms_factory: { kind: 'metal', roof: 0x565f66, silhouette: 'flat' },
  chemical_plant: { kind: 'metal', roof: 0x6a6f72, silhouette: 'flat' },
  protective_gear_factory: { kind: 'metal', roof: 0x5f666d, silhouette: 'flat' },
  vehicle_workshop: { kind: 'metal', roof: 0x5f666d, silhouette: 'flat' },
  scrap_smelter: { kind: 'metal', roof: 0x6b584b, silhouette: 'flat' },
  workshop_forge: { kind: 'metal', roof: 0x5f666d, silhouette: 'flat' },
  // Small dwellings / quarters read as brick houses
  house: { kind: 'brick', roof: 0x6f5139, silhouette: 'gable' },
  shelter: { kind: 'brick', roof: 0x4a5058, silhouette: 'gable' },
  shelter_bunkhouse: { kind: 'brick', roof: 0x4a5058, silhouette: 'gable' },
  squad_quarters: { kind: 'brick', roof: 0x4a5058, silhouette: 'gable' },
  headquarters: { kind: 'concrete', roof: 0x4f555d, silhouette: 'flat' },
  // Clay pit doubles as its own kiln shed
  clay_pit: { kind: 'brick', roof: 0x7a4f37, silhouette: 'flat' },
  // Utility infrastructure keeps its own strong silhouettes
  water_cistern: { kind: 'concrete', roof: 0x868d94, silhouette: 'tank' },
  generator_station: { kind: 'metal', roof: 0x5b6269, silhouette: 'stack' },
  battery_bank: { kind: 'concrete', roof: 0x6a7178, silhouette: 'cells' },
  antenna: { kind: 'metal', roof: 0x555c63, silhouette: 'antenna' },
  mast: { kind: 'metal', roof: 0x555c63, silhouette: 'pole' },
};

function facilityLookFor(typeId: string, category: FunctionalCategory): FacilityLook {
  const def = FACILITY_LOOK_DEFAULTS[category] ?? FACILITY_LOOK_DEFAULTS.other;
  return FACILITY_LOOKS[typeId] ?? def;
}

/**
 * Extracts one material group (an index sub-range) of an indexed geometry into a
 * new, compactly re-indexed geometry. Used so the merged LOD can keep the
 * wall/roof material split of each building's ExtrudeGeometry.
 */
function extractGroupGeometry(geom: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const srcIndex = geom.index;
  if (!srcIndex) {
    // Non-indexed fallback: the group is a contiguous vertex range
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) {
      const attr = geom.attributes[name];
      if (!attr) continue;
      const itemSize = attr.itemSize;
      out.setAttribute(
        name,
        new THREE.BufferAttribute((attr.array as Float32Array).slice(start * itemSize, (start + count) * itemSize), itemSize)
      );
    }
    return out;
  }

  const srcArray = srcIndex.array as ArrayLike<number>;
  const sub = new Uint32Array(count);
  const remap = new Map<number, number>();
  let newVerts = 0;
  for (let i = 0; i < count; i++) {
    const oi = srcArray[start + i];
    let ni = remap.get(oi);
    if (ni === undefined) {
      ni = newVerts++;
      remap.set(oi, ni);
    }
    sub[i] = ni;
  }

  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attr = geom.attributes[name];
    if (!attr) continue;
    const itemSize = attr.itemSize;
    const arr = new Float32Array(newVerts * itemSize);
    for (const [oi, ni] of remap) {
      const srcOff = oi * itemSize;
      const dstOff = ni * itemSize;
      for (let k = 0; k < itemSize; k++) arr[dstOff + k] = attr.array[srcOff + k];
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  out.setIndex(new THREE.BufferAttribute(sub, 1));
  return out;
}

/** Three vertex triples → one triangle face (helper for flatShadedMesh). */
function tri(a: number[], b: number[], c: number[]): number[][] {
  return [[a[0], a[1], a[2]], [b[0], b[1], b[2]], [c[0], c[1], c[2]]];
}

/** Timber shades used for stockade logs (vertex-coloured per log). */
const LOG_TONES = [0x7d4e28, 0x8a5a30, 0x6f4522, 0x8f6134, 0x7a4a24];
/** Charred/rotting timber tones for damaged logs (vertex-coloured). */
const CHARRED_TONES = [0x2b1a11, 0x3a2517, 0x1f130c, 0x33200f];
/** The defensive wall type ids that get damage/weather visuals. */
const BARRIER_TYPE_IDS = new Set(['wooden_palisade', 'brick_wall', 'fortified_wall', 'metal_fence', 'barbed_wire']);

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Linear blend between two 0xRRGGBB colours. */
function mixColor(a: number, b: number, t: number): number {
  const tt = clamp01(t);
  const r = Math.round((a >> 16 & 255) + ((b >> 16 & 255) - (a >> 16 & 255)) * tt);
  const g = Math.round((a >> 8 & 255) + ((b >> 8 & 255) - (a >> 8 & 255)) * tt);
  const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * tt);
  return (r << 16) | (g << 8) | bl;
}

/** Deterministic 0..1 fraction from an integer seed (stable per rebuild). */
function seededFrac(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Rough 0..1 to 0xRRGGBB hex conversion (multiply helper). */
function colorMult(hex: number, f: number): number {
  const r = Math.round((hex >> 16 & 255) * f);
  const g = Math.round((hex >> 8 & 255) * f);
  const b = Math.round((hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}

/** Shoelace polygon area (signed; magnitude used). */
function polygonArea(pts: { x: number; z: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}

/**
 * Andrew's monotone chain convex hull — lets every building (even concave or
 * L-shaped OSM footprints) get a pitched roof over its overall silhouette.
 */
function convexHull(pts: { x: number; z: number }[]): { x: number; z: number }[] {
  const sorted = pts
    .map((p) => ({ x: p.x, z: p.z }))
    .sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length <= 3) return sorted;
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: { x: number; z: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; z: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * Dominant (longest) axis of a footprint via PCA — the ridge direction a
 * pitched roof should run along. Returns { ax, az, nx, nz } unit vectors
 * (axis + perpendicular cross-section direction) and the centroid.
 */
function dominantFootprintAxis(pts: { x: number; z: number }[]) {
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p.x; cz += p.z; }
  cx /= n; cz /= n;
  let xx = 0, xz = 0, zz = 0;
  for (const p of pts) {
    const dx = p.x - cx, dz = p.z - cz;
    xx += dx * dx; xz += dx * dz; zz += dz * dz;
  }
  const trace = xx + zz;
  const det = xx * zz - xz * xz;
  const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
  const l1 = trace / 2 + disc; // largest eigenvalue
  let ax = l1 - zz, az = xz;
  const alen = Math.hypot(ax, az);
  if (alen < 1e-6) { ax = 1; az = 0; }
  else { ax /= alen; az /= alen; }
  const nx = -az, nz = ax;
  return { cx, cz, ax, az, nx, nz };
}

/**
 * Builds a TRUE gable roof (like a classic house: full-length ridge, two long
 * slopes, and VERTICAL triangular gable ends) over a convex footprint — ANY
 * convex polygon, since complex OSM footprints arrive via their hull).
 *
 * The roof is the 3D convex hull of the eave ring (basic polygon at wall-top
 * height) plus the two ridge endpoints above the footprint's dominant axis.
 * For a rectangle that yields exactly the reference look: two long sloped
 * faces + two vertical gable-end triangles. The hull handles every other
 * shape (tapered / L / multi-vertex hulls) as a tidy tent.
 *
 * Geometry is in local metres (y above the building base, matching the
 * ExtrudeGeometry); callers translate by baseY. Emits NON-indexed triangles:
 * this three version's ExtrudeGeometry caps are non-indexed, and
 * mergeGeometries rejects mixed index/non-index inputs, so the pitched roof
 * must match the caps it merges with in the LOD build. Also returns the ridge
 * + hip lines used for the crisp illustrated silhouette.
 */
export function buildPitchedRoof(
  pts: { x: number; z: number }[],
  wallTopLocalY: number,
  height: number,
  ridgeScale = 1
): { geom: THREE.BufferGeometry; ridgeGeom: THREE.BufferGeometry } | null {
  const n = pts.length;
  if (n < 4) return null;
  const { cx, cz, ax, az, nx, nz } = dominantFootprintAxis(pts);

  let tMin = Infinity, tMax = -Infinity, maxD = 0;
  for (const p of pts) {
    const dx = p.x - cx, dz = p.z - cz;
    const t = dx * ax + dz * az;
    const d = dx * nx + dz * nz;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
    maxD = Math.max(maxD, Math.abs(d));
  }
  if (maxD < 1 || tMax - tMin < 2) return null; // sliver footprint

  // ~38° pitch (50° on narrow buildings), scaled per building (seeded by its
  // id) so roof heights vary across the city instead of one identical ridge.
  const ridgeH = Math.min(7.0, Math.max(1.2, maxD * 0.8 * ridgeScale));
  // Lift the roof clear of the flat cap underneath to avoid z-fighting.
  const y0 = wallTopLocalY + 0.06;
  const ridgeY = y0 + ridgeH;

  // 3D hull inputs: eave ring at wall-top height + both ridge endpoints.
  const hullPoints: THREE.Vector3[] = pts.map((p) => new THREE.Vector3(p.x, y0, p.z));
  hullPoints.push(
    new THREE.Vector3(cx + ax * tMin, ridgeY, cz + az * tMin),
    new THREE.Vector3(cx + ax * tMax, ridgeY, cz + az * tMax)
  );

  let convexGeom: THREE.BufferGeometry;
  try {
    // ConvexGeometry already emits non-indexed triangles, matching the
    // extrude caps that mergeGeometries expects in the LOD build.
    convexGeom = new ConvexGeometry(hullPoints);
  } catch {
    return null; // degenerate point set — keep the flat cap as a fallback
  }

  // Roof-texture UVs from the dominant-axis frame (t along the ridge, |d|
  // across it) — the same planar mapping the flat caps already use. BUT the
  // near-vertical gable-end triangles get their own face-plane mapping: the
  // planar (t, |d|) frame collapses t to a constant on those, smearing the
  // whole course pattern into a single vertical stripe ("rotated weirdly").
  // Instead, the roof splits into TWO material groups (kept as one geometry
  // for a single draw call):
  //  - group 0 = the sloped roof planes, textured with the roofing material
  //    (slate/tiles) via the dominant-axis frame;
  //  - group 1 = the VERTICAL gable-end triangles, textured with the facade's
  //    own base material (same masonry as the walls — no windows/doors). The
  //    facade tile spans 18m, so UVs use the wall convention
  //    (v = 1 − local height in metres) and the gable's brick courses line up
  //    with the courses of the wall beneath it.
  const pos = convexGeom.attributes.position as THREE.BufferAttribute;
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const fNrm = new THREE.Vector3();
  const slopePos: number[] = [];
  const slopeNrm: number[] = [];
  const slopeUv: number[] = [];
  const gablePos: number[] = [];
  const gableNrm: number[] = [];
  const gableUv: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const x0 = pos.getX(i), y0f = pos.getY(i), z0 = pos.getZ(i);
    e1.set(pos.getX(i + 1) - x0, pos.getY(i + 1) - y0f, pos.getZ(i + 1) - z0);
    e2.set(pos.getX(i + 2) - x0, pos.getY(i + 2) - y0f, pos.getZ(i + 2) - z0);
    fNrm.crossVectors(e1, e2);
    const fLen = fNrm.length() || 1;
    fNrm.divideScalar(fLen);
    const nyAbs = Math.abs(fNrm.y);
    // Vertical (|normal.y| small) faces are the triangular gable ends — they
    // wear the facade's own masonry. Everything else (slopes + the unseen
    // underside of the roof) wears the roofing material.
    const isVertical = nyAbs < 0.5;
    const outPos = isVertical ? gablePos : slopePos;
    const outNrm = isVertical ? gableNrm : slopeNrm;
    const outUv = isVertical ? gableUv : slopeUv;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
      const dx = x - cx, dz = z - cz;
      outPos.push(x, y, z);
      outNrm.push(fNrm.x, fNrm.y, fNrm.z);
      if (isVertical) {
        // Vertical gable end: u runs along the face's horizontal extent (the
        // cross-section direction, in metres), v follows the facade height
        // convention (v = 1 − local metres) so the masonry bond lines up with
        // the wall beneath the eave. The +900 offset keeps u positive for the
        // tile wrap; 18m repeats make its exact phase irrelevant.
        outUv.push(900 + (dx * nx + dz * nz), 1 - y);
      } else {
        // Sloped roof plane: (t along ridge, |d| across) mapped per 4m tile.
        outUv.push((dx * ax + dz * az) / 4, Math.abs(dx * nx + dz * nz) / 4);
      }
    }
  }

  // Compose one non-indexed geometry carrying both groups: group 0 = sloped
  // roof material, group 1 = facade-base gable material.
  const roofGeom = new THREE.BufferGeometry();
  roofGeom.setAttribute('position', new THREE.Float32BufferAttribute(slopePos.concat(gablePos), 3));
  roofGeom.setAttribute('normal', new THREE.Float32BufferAttribute(slopeNrm.concat(gableNrm), 3));
  roofGeom.setAttribute('uv', new THREE.Float32BufferAttribute(slopeUv.concat(gableUv), 2));
  const slopeCount = slopePos.length / 3;
  if (slopeCount > 0) roofGeom.addGroup(0, slopeCount, 0);
  if (gablePos.length > 0) roofGeom.addGroup(slopeCount, gablePos.length / 3, 1);

  // Ridge + gable/hip silhouette: the ridge line between both ridge endpoints,
  // plus rising corner lines for non-rectangular hulls.
  const linePts: number[] = [
    cx + ax * tMin, ridgeY, cz + az * tMin,
    cx + ax * tMax, ridgeY, cz + az * tMax,
  ];
  for (const p of pts) {
    const d = (p.x - cx) * nx + (p.z - cz) * nz;
    const py = y0 + ridgeH * (1 - Math.abs(d) / Math.max(1e-9, maxD));
    if (py - y0 > 0.05) linePts.push(p.x, y0, p.z, p.x, py, p.z);
  }
  const ridgeGeom = new THREE.BufferGeometry();
  ridgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
  return { geom: roofGeom, ridgeGeom };
}

/**
 * Remaps the cap (group 0) UVs of an extruded building from the world-aligned
 * default to the footprint's dominant-axis frame, so the roof texture's tile
 * rows run parallel to the walls instead of at arbitrary world angles.
 * (t, |d|) is a linear planar mapping, so flat caps never distort.
 */
function remapRoofUvs(geom: THREE.BufferGeometry, pts: { x: number; z: number }[]) {
  const g0 = geom.groups[0];
  if (!g0 || pts.length < 3) return;
  const { cx, cz, ax, az, nx, nz } = dominantFootprintAxis(pts);
  const pos = geom.attributes.position as THREE.BufferAttribute | undefined;
  const uv = geom.attributes.uv as THREE.BufferAttribute | undefined;
  const index = geom.index;
  if (!pos || !uv) return;
  for (let i = g0.start; i < g0.start + g0.count; i++) {
    const vi = index ? index.getX(i) : i;
    const x = pos.getX(vi), z = pos.getZ(vi); // local x/z == world x/z after the -90° rotate
    const dx = x - cx, dz = z - cz;
    const t = dx * ax + dz * az;
    const d = dx * nx + dz * nz;
    uv.setXY(vi, t / 4, Math.abs(d) / 4);
  }
  uv.needsUpdate = true;
}

/**
 * Continuous planar UV map for FLAT roofs (group 0 cap). Unlike the pitched /
 * gable map — which folds the cross-axis distance with |d| so both slopes share
 * one pattern direction — a flat roof is ONE surface, so the cross-axis
 * distance must stay SIGNED. The |d| fold makes the left half of a flat roof
 * mirror the right half: seams, welds and paver rows bend toward the centre
 * line and read as "warped" instead of running straight across the whole roof.
 *
 * This map is the footprint's dominant-axis frame (u along the ridge axis, v
 * across, both metres ÷ 4m tile) with a per-building 90°-stepped ROTATION and
 * start-of-tile OFFSET from the building's id seed — so the seeded family/shade
 * pick plus this frame means no two flat roofs tile identically, and the baked
 * weathering (corner grime / puddle masks) lands on different parts of every
 * roof instead of repeating in lockstep. Seams stay parallel to the long axis
 * over the whole roof; nothing distorts on convex or concave footprints.
 */
export function remapFlatRoofUvs(geom: THREE.BufferGeometry, pts: { x: number; z: number }[], seed: number) {
  const g0 = geom.groups[0];
  if (!g0 || pts.length < 3) return;
  const { cx, cz, ax, az, nx, nz } = dominantFootprintAxis(pts);
  const pos = geom.attributes.position as THREE.BufferAttribute | undefined;
  const uv = geom.attributes.uv as THREE.BufferAttribute | undefined;
  const index = geom.index;
  if (!pos || !uv) return;
  const rot = (seed >>> 3) & 3; // 0..3 → 0° / 90° / 180° / 270°
  const offU = seededFrac(seed ^ 0x9e3779b9);
  const offV = seededFrac(seed ^ 0x85ebca6b);
  for (let i = g0.start; i < g0.start + g0.count; i++) {
    const vi = index ? index.getX(i) : i;
    const x = pos.getX(vi), z = pos.getZ(vi); // local x/z == world x/z after the -90° rotate
    const dx = x - cx, dz = z - cz;
    let t = dx * ax + dz * az;
    let d = dx * nx + dz * nz;
    if (rot === 1) { const tmp = t; t = d; d = -tmp; }
    else if (rot === 2) { t = -t; d = -d; }
    else if (rot === 3) { const tmp = t; t = -d; d = tmp; }
    uv.setXY(vi, t / 4 + offU, d / 4 + offV);
  }
  uv.needsUpdate = true;
}

/**
 * Confines the ground-floor door/shopfront band to the building's real ground
 * floor. The facade tile spans 18m and RepeatWrapping would otherwise re-show
 * the door band on every 18m storey block of a tall building; above 18m we
 * tile only the upper-storey window region (v' ∈ 0–0.78) so doors can never
 * appear to open out of upper floors.
 */
function remapWallUvs(geom: THREE.BufferGeometry) {
  const g1 = geom.groups[1]; // side walls (group 0 = caps / roof)
  if (!g1) return;
  const uv = geom.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return;
  const index = geom.index;
  for (let i = g1.start; i < g1.start + g1.count; i++) {
    const vi = index ? index.getX(i) : i;
    const v = uv.getY(vi);
    const yM = 1 - v; // metres above the building base (facade convention)
    let target: number;
    if (yM <= 18) {
      target = yM / 18; // full tile: door band anchored at street level
    } else {
      // Above one tile: loop the upper-storey window band only.
      const t = ((yM - 18) % 18) / 18;
      target = 0.78 - t * 0.78;
    }
    // Undo the material's v→v' transform (v' = (1 - v)/18).
    uv.setY(vi, 1 - 18 * target);
  }
  uv.needsUpdate = true;
}

export class BuildingRenderer {
  public group = new THREE.Group();
  public edgeGroup = new THREE.Group();
  /** Per-building edge silhouettes (detailed mode) so updateAdaptedStates can
   *  recolor an outline when a structure completes — the amber under-construction
   *  edge must turn green the moment the crew finishes, not on the next map rebuild. */
  private buildingEdgeObjs = new Map<string | number, THREE.LineSegments>();
  public overlayGroup = new THREE.Group();
  /** §7.1 flat polygons drawn on top of each building showing the PHYSICALLY
   *  selected adapted region (IFZ-style drag adaptation). Rebuilt whenever the
   *  settlement's adapted entries change. */
  public regionOverlayGroup = new THREE.Group();

  /**
   * Zoomed-out LOD: every building wall and edge merged into a handful of draw
   * calls (grouped by shared material). Toggled by setLodMode() based on camera
   * altitude — the single biggest render cost at overview zoom is the ~8.4k
   * individual building meshes, so this collapses them to ~12 merged meshes.
   */
  public lodGroup = new THREE.Group();

  public buildingMeshes = new Map<string | number, THREE.Mesh>();
  private buildingData = new Map<string | number, BuildingPolygon>();
  public freestandingMeshes = new Map<string | number, THREE.Mesh>();
  // Edge <LineSegments> owned by each freestanding structure (tower wireframes),
  // so a rebuilt structure's old edges can be removed instead of ghosting.
  private freestandingEdges = new Map<string | number, THREE.Object3D[]>();

  // Barrier weathering + damage state. Damage tiers are derived from the
  // structure's live currentDurability / maxDurability; weather (rain puddle
  // grime, snow caps) is pushed from WorldScene.setWeather. When either flips,
  // the barrier body is re-built so a battered palisade visibly degrades and
  // structures weather with the sky instead of staying pristine forever.
  private barrierRain = 0; // 0..1 wetness (puddle grime, mud splash)
  private barrierSnow = 0; // 0..1 snow accumulation (caps along the top)
  private lastBarrierElevation?: ElevationGrid | null = null;
  private lastBarrierExaggeration = 1.0;
  /** Latest visual key of each barrier (damage tier + weather), so rebuilds
   *  happen only when the look actually changes. */
  private barrierVisualSig = new Map<string | number, string>();
  /** Throttle accumulator for the per-frame barrier repair/damage check. */
  private barrierCheckAccum = 0;

  // Completed defence structures (walls/towers/gates) hide their overhead icon
  // until they take damage; these track the damage-ring markers the renderer
  // owns itself (state pushes mutate durability in place, so a throttled poll
  // adds/refreshes/removes them without waiting for a React re-render).
  private defenseMarkerObjs = new Map<
    string,
    { sprite: THREE.Sprite; line: THREE.Line }
  >();
  /** Latest damage bucket ('' when no marker is wanted) per building id. */
  private defenseMarkerSig = new Map<string, string>();

  // Completed gates render as a frame + two hinged door panels; this map holds
  // the swinging door groups plus the gate's fixed pose so a per-frame update()
  // can ease them open when friendly units approach and closed once they pass.
  private static readonly GATE_OPEN_ANGLE = 1.85; // ~106° — doors swing well clear
  private gateAnimations = new Map<
    string | number,
    {
      left: THREE.Group;
      right: THREE.Group;
      open: number;
      rotDeg: number;
      pos: { x: number; z: number };
    }
  >();

  private lodSources: {
    geom: THREE.BufferGeometry;
    baseY: number;
    wallMatKey: string;
    wallMats: THREE.Material[];
    edgeGeom?: THREE.BufferGeometry;
    edgeBaseY: number;
    edgeMatKey?: string;
    edgeMat?: THREE.Material;
    roofGeom?: THREE.BufferGeometry; // pitched roof surface (local coords, group 0 = slopes, group 1 = gables)
    cellKey: string;
    buildingId: string | number;
    flatRoofKey?: string | null; // A–E flat roof family key, or null when pitched
  }[] = [];
  /** Per-cell merged-LOD state: signature of each cell's contributing buildings
   *  and the meshes created for it, so adaptation/demolition only rebuilds the
   *  cell(s) that actually changed instead of re-merging the whole city. */
  private lodCellSignatures = new Map<string, string>();
  private lodCellMeshes = new Map<string, THREE.Object3D[]>();
  private lodBuilt = false;
  private lodMode: 'detailed' | 'distant' = 'detailed';

  /**
   * Spatial LOD cell size (metres). The distant-view merge groups buildings by
   * a ~300m grid cell + shared material instead of one city-wide merge, so each
   * cell mesh has real bounds and frustum-culls properly, and a state change in
   * one neighbourhood only re-merges that cell.
   */
  private static readonly LOD_CELL_SIZE = 300;

  /** Shared edge materials per state, so repeated cell rebuilds re-merge cleanly. */
  private edgeMaterialCache = new Map<string, THREE.LineBasicMaterial>();

  private nightGlowFactor = 0;
  private hoveredBuildingId: string | number | null = null;
  private selectedBuildingId: string | number | null = null;
  private demolishCandidateIds: Set<string | number> = new Set();

  /**
   * Radius (metres) around a completed Generator Station that powers nearby
   * colony buildings — only powered, operational buildings show lit windows at
   * night. The world ended; abandoned buildings stay dark.
   */
  private static readonly GENERATOR_POWER_RADIUS = 60;

  private currentHqId: string | number | null = null;
  private adaptedMap = new Map<string | number, AdaptedBuilding>();
  private freestandingBuildings: AdaptedBuilding[] = [];

  // Shared Materials
  private materialsCache = new Map<string, THREE.Material[]>();
  private sharedEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0x111317,
    linewidth: 1,
    transparent: true,
    opacity: 0.65,
  });

  /**
   * Positions of completed generator stations (adapted or freestanding). These
   * define the power grid for night-time window lighting.
   */
  private generatorPositions(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const [, a] of this.adaptedMap) {
      if (a.typeId === 'generator_station' && isBuildingOperational(a)) {
        out.push(a.position);
      }
    }
    for (const f of this.freestandingBuildings) {
      if (f.typeId === 'generator_station' && isBuildingOperational(f)) {
        out.push(f.position);
      }
    }
    return out;
  }

  /**
   * True when a building is an operational colony building (HQ or completed
   * adaptation) within range of a completed generator station. Plain abandoned
   * OSM buildings are never powered, so their windows never light up.
   */
  private isBuildingPowered(bldg: BuildingPolygon): boolean {
    const adapted = this.adaptedMap.get(bldg.id);
    if (!adapted) return false;
    const st = adapted.constructionStatus;
    if (st === 'in_progress' || st === 'planned') return false;
    for (const g of this.generatorPositions()) {
      if (Math.hypot(bldg.center.x - g.x, bldg.center.z - g.z) <= BuildingRenderer.GENERATOR_POWER_RADIUS) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clone a building's textured material pair with a colour tint that
   * multiplies the facade instead of replacing it (hover / select / demolish).
   */
  private cloneWithTint(base: THREE.Material[], wallTint: number, roofTint: number): THREE.Material[] {
    const wall = (base[1] as THREE.MeshLambertMaterial).clone();
    wall.color.setHex(wallTint);
    const roof = (base[0] as THREE.MeshLambertMaterial | THREE.MeshStandardMaterial).clone();
    roof.color.setHex(roofTint);
    return [roof, wall];
  }


  constructor() {
    this.group.name = 'BuildingsGroup';
    this.edgeGroup.name = 'BuildingEdgesGroup';
    this.overlayGroup.name = 'BuildingOverlayGroup';
    this.regionOverlayGroup.name = 'AdaptedRegionOverlayGroup';
    this.group.add(this.edgeGroup);
    this.group.add(this.overlayGroup);
    this.group.add(this.regionOverlayGroup);
  }

  /**
   * Rebuilds the flat adapted-region overlays (§7.1): one translucent polygon
   * per adapted entry that carries an `adaptedPolygon` (a partial conversion or
   * a split section). The shape sits just above the source building's roof so
   * the player sees exactly which physical part of the structure is converted.
   */
  public updateAdaptedRegions(
    adaptedBuildings: Map<string | number, AdaptedBuilding> = new Map()
  ) {
    while (this.regionOverlayGroup.children.length > 0) {
      const c = this.regionOverlayGroup.children[0] as THREE.Mesh;
      if (c.geometry) c.geometry.dispose();
      this.regionOverlayGroup.remove(c);
    }

    for (const [key, adapted] of adaptedBuildings) {
      const poly = adapted.adaptedPolygon;
      if (!poly || poly.length < 3) continue;
      const sourceId = adapted.sourceBuildingId ?? key;
      const mesh = this.buildingMeshes.get(sourceId);
      const bldg = this.buildingData.get(sourceId);
      if (!mesh || !bldg) continue;

      const shape = new THREE.Shape();
      shape.moveTo(poly[0].x, -poly[0].z);
      for (let i = 1; i < poly.length; i++) {
        shape.lineTo(poly[i].x, -poly[i].z);
      }
      shape.closePath();
      const geom = new THREE.ShapeGeometry(shape);
      const color = FUNCTIONAL_CATEGORY_COLORS[adapted.category]?.beacon ?? 0x38bdf8;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: adapted.adaptationPercentage >= 100 ? 0.5 : 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const region = new THREE.Mesh(geom, mat);
      region.rotation.x = -Math.PI / 2;
      // Sit just above the building's roof.
      region.position.y = mesh.position.y + (bldg.height || 6) + 0.35;
      region.renderOrder = 5;
      this.regionOverlayGroup.add(region);

      // Crisp outline so the selected area reads clearly against the roof.
      const edgeGeom = new THREE.EdgesGeometry(geom);
      const edgeMat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
      });
      const edge = new THREE.LineSegments(edgeGeom, edgeMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = region.position.y + 0.02;
      this.regionOverlayGroup.add(edge);
    }
  }

  private getBuildingMaterials(
    type: BuildingCategory,
    isOccupied = false,
    adaptedCategory?: FunctionalCategory,
    isHQ = false,
    constructionStatus?: 'planned' | 'in_progress' | 'completed' | 'paused' | 'deconstructing',
    variant = 0,
    powered = false,
    adaptationPct = 100,
    flatRoofKey: string | null = null
  ): THREE.Material[] {
    const key = `${type}_${isOccupied}_${adaptedCategory || 'none'}_${isHQ}_${constructionStatus || 'none'}_v${variant}_p${powered ? 1 : 0}_a${Math.round(adaptationPct)}_fr${flatRoofKey ?? 'p'}`;
    if (this.materialsCache.has(key)) {
      return this.materialsCache.get(key)!;
    }

    // Every building wears its procedural facade + roof texture; gameplay
    // states (HQ, adapted, under construction, occupied) are communicated by a
    // colour tint that MULTIPLIES the texture instead of replacing it, so the
    // windows/brick/shopfront detail stays visible. UVs come from
    // WorldUVGenerator (world meters), so the shared textures tile at the same
    // real-world scale on every building — no per-building materials, keeping
    // the LOD merge intact. Window glow is emissive-map driven and only appears
    // at night on powered buildings (userData.powered).
    const tex = getBuildingTextureSet(type, variant);

    // Gameplay states tint the WALLS only — roofs always keep their natural
    // roofing material colour so the city reads as roofs, not coloured blocks.
    let wallTint = 0xffffff; // default city building: un-tinted facade
    if (isHQ || (adaptedCategory && constructionStatus !== 'in_progress' && constructionStatus !== 'planned' && constructionStatus !== 'paused')) {
      // Operational colony building (HQ or completed adaptation): green tint
      wallTint = 0x9fd8b0;
    } else if (adaptedCategory) {
      // Under construction / blueprint: blue tint
      wallTint = 0x9db9ff;
    } else if (isOccupied) {
      // Zombie-occupied ruins: darker, sicklier green
      wallTint = 0x7fae8d;
    }
    if (adaptedCategory && constructionStatus === 'completed') {
      // §7.1 Partial adaptation: a converted share of the roof/shell shows as
      // a blend between blueprint blue (unconverted) and colony green (fully
      // converted), so a 25% facility reads as one quarter green from the map.
      const t = Math.min(1, Math.max(0, (adaptationPct || 100) / 100));
      const r = Math.round(0x9d + (0x9f - 0x9d) * t);
      const g = Math.round(0xb9 + (0xd8 - 0xb9) * t);
      const b = Math.round(0xff + (0xb0 - 0xff) * t);
      wallTint = (r << 16) | (g << 8) | b;
    }
    const roofTint = 0xffffff;

    // Powered operational buildings light their windows at night; everything
    // else stays dark even when the emissive map is present.
    const glowIntensity = (powered ? this.nightGlowFactor : 0) * 0.95;
    // Height maps give the painted surfaces real relief: the sun rakes across
    // mortar joints, tile overlaps and sheet-metal ribs instead of a flat
    // print. Scales are texture-space, tuned so the effect stays subtle on
    // walls (brick/render) and reads clearly on roofs.
    const wallMat = new THREE.MeshLambertMaterial({
      map: tex.wall,
      bumpMap: tex.wallBump,
      bumpScale: 0.6,
      color: wallTint,
      emissive: 0x000000,
      emissiveMap: tex.glow,
      emissiveIntensity: glowIntensity,
    });
    wallMat.userData.powered = powered;
    // FLAT ROOFS wear the dedicated A–E membrane family (gravel / EPDM / felt /
    // TPO / paved) instead of the pitched tile texture shared with gabled
    // roofs. Painted on a 4m tile that matches the caps' UV remap; the
    // roughness map carries the baked puddle masks (smooth = wet).
    let roofMat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
    if (flatRoofKey) {
      const flat = getFlatRoofSet(flatRoofKey.split('_')[0] as FlatRoofType, Number(flatRoofKey.split('_')[1] ?? 0));
      roofMat = new THREE.MeshStandardMaterial({
        map: flat.albedo,
        bumpMap: flat.bump,
        bumpScale: 0.85,
        roughnessMap: flat.roughness,
        roughness: flat.params.roughness,
        metalness: 0,
        color: roofTint,
      });
      roofMat.userData.flatRoofType = flat.type;
      roofMat.userData.flatRoofLabel = flatRoofLabel(flat.type);
    } else {
      roofMat = new THREE.MeshLambertMaterial({
        map: tex.roof,
        bumpMap: tex.roofBump,
        bumpScale: 0.75,
        color: roofTint,
      });
    }
    roofMat.userData.powered = powered;
    // Gable ends wear the facade's own masonry (no windows/doors) and inherit
    // the wall tint, so a converted/blueprinted building's gables read as part
    // of its shell rather than as untouched roofing.
    const gableMat = new THREE.MeshLambertMaterial({
      map: tex.gable,
      bumpMap: tex.gableBump,
      bumpScale: 0.6,
      color: wallTint,
      emissive: 0x000000,
    });

    // ExtrudeGeometry group 0 = caps (roof), group 1 = side walls; pitched
    // roof geometry adds group 2 references via its own material pair. Index 2
    // (gable) is only consumed by pitched roofs and the LOD gable merge.
    const mats = [roofMat, wallMat, gableMat];
    this.materialsCache.set(key, mats);
    return mats;
  }

  public rebuildBuildings(
    buildings: BuildingPolygon[],
    showEdges = true,
    elevation?: ElevationGrid | null,
    exaggeration = 1.0,
    hqBuildingId: string | number | null = null,
    adaptedBuildings: Map<string | number, AdaptedBuilding> = new Map(),
    freestandingBuildings: AdaptedBuilding[] = [],
    demolishedBuildingIds: Map<string | number, true> = new Map()
  ) {
    this.clear();
    this.currentHqId = hqBuildingId;
    this.adaptedMap = adaptedBuildings;
    this.freestandingBuildings = freestandingBuildings;

    for (const bldg of buildings) {
      this.buildOneBuilding(bldg, showEdges, elevation, exaggeration, hqBuildingId, adaptedBuildings, demolishedBuildingIds);
    }

    // Render Freestanding Structures (§7.1)
    for (const free of freestandingBuildings) {
      this.renderFreestandingBuilding(free, elevation, exaggeration);
    }
  }

  /**
   * Progressive variant used during the initial load: extrudes buildings in
   * chunks and yields to the event loop between chunks so the loading screen
   * stays animated and reports real progress instead of freezing the main
   * thread for the whole city at once.
   */
  public async rebuildBuildingsProgressive(
    buildings: BuildingPolygon[],
    showEdges = true,
    elevation?: ElevationGrid | null,
    exaggeration = 1.0,
    hqBuildingId: string | number | null = null,
    adaptedBuildings: Map<string | number, AdaptedBuilding> = new Map(),
    freestandingBuildings: AdaptedBuilding[] = [],
    demolishedBuildingIds: Map<string | number, true> = new Map(),
    onProgress?: (done: number, total: number) => void,
    isStale?: () => boolean
  ) {
    this.clear();
    this.currentHqId = hqBuildingId;
    this.adaptedMap = adaptedBuildings;
    this.freestandingBuildings = freestandingBuildings;

    const CHUNK = 1200;
    const total = buildings.length;
    for (let i = 0; i < total; i += CHUNK) {
      if (isStale && isStale()) return;
      const end = Math.min(i + CHUNK, total);
      for (let j = i; j < end; j++) {
        this.buildOneBuilding(buildings[j], showEdges, elevation, exaggeration, hqBuildingId, adaptedBuildings, demolishedBuildingIds);
      }
      onProgress?.(end, total);
      if (end < total) await nextFrame();
    }

    // Render Freestanding Structures (§7.1)
    for (const free of freestandingBuildings) {
      this.renderFreestandingBuilding(free, elevation, exaggeration);
    }
  }

  private cellKeyFor(x: number, z: number): string {
    const s = BuildingRenderer.LOD_CELL_SIZE;
    return `${Math.floor(x / s)}_${Math.floor(z / s)}`;
  }

  private getEdgeMaterial(kind: 'hq' | 'adapted' | 'adapting'): THREE.LineBasicMaterial {
    const cached = this.edgeMaterialCache.get(kind);
    if (cached) return cached;
    const mat = new THREE.LineBasicMaterial({
      color: kind === 'adapting' ? 0xf59e0b : 0x22c55e,
      linewidth: 2,
    });
    this.edgeMaterialCache.set(kind, mat);
    return mat;
  }

  private edgeMatFor(isHQ: boolean, adapted?: AdaptedBuilding): THREE.LineBasicMaterial {
    if (isHQ) return this.getEdgeMaterial('hq');
    if (adapted) {
      const st = adapted.constructionStatus;
      return this.getEdgeMaterial(st === 'in_progress' || st === 'planned' ? 'adapting' : 'adapted');
    }
    return this.sharedEdgeMaterial;
  }

  /** Groups the LOD sources by their ~300m grid cell. */
  private sourcesByCell(): Map<string, (typeof this.lodSources)[number][]> {
    const byCell = new Map<string, (typeof this.lodSources)[number][]>();
    for (const src of this.lodSources) {
      const list = byCell.get(src.cellKey) || [];
      list.push(src);
      byCell.set(src.cellKey, list);
    }
    return byCell;
  }

  /**
   * Re-derives a source's current wall + edge materials from live settlement
   * state (HQ / adapted / demolished / powered), so a cell rebuild reflects
   * the latest colours instead of the build-time snapshot.
   */
  private refreshSourceState(src: (typeof this.lodSources)[number], demolished: Set<string | number>) {
    if (demolished.has(src.buildingId)) return;
    const bldg = this.buildingData.get(src.buildingId);
    if (!bldg) return;
    const isHQ = this.currentHqId !== null && String(bldg.id) === String(this.currentHqId);
    const adapted = getPrimaryAdaptedEntry(this.adaptedMap, bldg.id);
    const mats = this.getBuildingMaterials(
      bldg.type,
      bldg.isOccupied,
      adapted?.category,
      isHQ,
      adapted?.constructionStatus,
      buildingVariantForId(bldg.id),
      this.isBuildingPowered(bldg),
      adapted?.adaptationPercentage ?? 100,
      src.flatRoofKey ?? null
    );
    src.wallMats = mats;
    src.wallMatKey = mats.map((m) => m.uuid).join('|');
    if (src.edgeGeom) {
      src.edgeMat = this.edgeMatFor(isHQ, adapted);
      src.edgeMatKey = src.edgeMat.uuid;
    }
  }

  /**
   * Deterministic per-cell signature of the CURRENT building/material state.
   * Refreshes each source from live settlement state first (a side effect that
   * keeps sources in sync), so an adaptation/demolition shows up in the string.
   */
  private cellSignature(cellKey: string, byCell: Map<string, (typeof this.lodSources)[number][]>, demolished: Set<string | number>): string {
    const sources = byCell.get(cellKey) || [];
    const parts: string[] = [];
    for (const src of sources) {
      if (demolished.has(src.buildingId)) continue;
      this.refreshSourceState(src, demolished);
      parts.push(`${src.buildingId}:${src.wallMatKey}:${src.edgeMatKey || '-'}`);
    }
    return parts.sort().join('|');
  }

  /** Removes + disposes every mesh previously created for one cell. */
  private clearCellMeshes(cellKey: string) {
    const old = this.lodCellMeshes.get(cellKey);
    if (!old) return;
    for (const m of old) {
      this.lodGroup.remove(m);
      const mesh = m as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    }
    this.lodCellMeshes.delete(cellKey);
  }

  /**
   * Merges one cell's buildings into meshes grouped by shared material (one
   * mesh for cap faces, one for side faces — preserving the two-group
   * ExtrudeGeometry layout) plus one LineSegments per shared edge material.
   * Each mesh spans only its ~300m cell, so frustum culling is effective.
   */
  private rebuildCell(cellKey: string, byCell: Map<string, (typeof this.lodSources)[number][]>, demolished: Set<string | number>) {
    this.clearCellMeshes(cellKey);
    const sources = (byCell.get(cellKey) || []).filter((s) => !demolished.has(s.buildingId));
    if (sources.length === 0) return;

    for (const src of sources) this.refreshSourceState(src, demolished);
    const created: THREE.Object3D[] = [];

    // 1. Walls grouped by cell + shared material set
    const wallGroups = new Map<string, (typeof this.lodSources)[number][]>();
    for (const src of sources) {
      const list = wallGroups.get(src.wallMatKey) || [];
      list.push(src);
      wallGroups.set(src.wallMatKey, list);
    }
    for (const [, group] of wallGroups) {
      const caps: THREE.BufferGeometry[] = [];
      const sides: THREE.BufferGeometry[] = [];
      const gables: THREE.BufferGeometry[] = [];
      for (const src of group) {
        const g0 = src.geom.groups[0];
        const g1 = src.geom.groups[1];
        if (g0) caps.push(extractGroupGeometry(src.geom, g0.start, g0.count).translate(0, src.baseY, 0));
        if (g1) sides.push(extractGroupGeometry(src.geom, g1.start, g1.count).translate(0, src.baseY, 0));
        // Pitched roofs: sloped planes ride the caps merge (same roofing
        // material); the vertical gable triangles merge separately into their
        // own facade-material mesh.
        if (src.roofGeom) {
          const rg0 = src.roofGeom.groups[0];
          const rg1 = src.roofGeom.groups[1];
          if (rg0) caps.push(extractGroupGeometry(src.roofGeom, rg0.start, rg0.count).translate(0, src.baseY, 0));
          if (rg1) gables.push(extractGroupGeometry(src.roofGeom, rg1.start, rg1.count).translate(0, src.baseY, 0));
        }
      }
      if (caps.length > 0) {
        const merged = mergeGeometries(caps, false);
        caps.forEach((g) => g.dispose());
        if (merged) {
          const mesh = new THREE.Mesh(merged, group[0].wallMats[0]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          mesh.name = `lod-cell-${cellKey}-caps`;
          this.lodGroup.add(mesh);
          created.push(mesh);
        }
      }
      if (sides.length > 0) {
        const merged = mergeGeometries(sides, false);
        sides.forEach((g) => g.dispose());
        if (merged) {
          const mesh = new THREE.Mesh(merged, group[0].wallMats[1]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          mesh.name = `lod-cell-${cellKey}-sides`;
          this.lodGroup.add(mesh);
          created.push(mesh);
        }
      }
      if (gables.length > 0 && group[0].wallMats.length > 2) {
        const merged = mergeGeometries(gables, false);
        gables.forEach((g) => g.dispose());
        if (merged) {
          const mesh = new THREE.Mesh(merged, group[0].wallMats[2]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          mesh.name = `lod-cell-${cellKey}-gables`;
          this.lodGroup.add(mesh);
          created.push(mesh);
        }
      }
    }

    // 2. Edges grouped by shared edge material within the cell
    const edgeGroups = new Map<string, (typeof this.lodSources)[number][]>();
    for (const src of sources) {
      if (!src.edgeGeom || !src.edgeMatKey) continue;
      const list = edgeGroups.get(src.edgeMatKey) || [];
      list.push(src);
      edgeGroups.set(src.edgeMatKey, list);
    }
    for (const [, group] of edgeGroups) {
      const geoms: THREE.BufferGeometry[] = [];
      for (const src of group) {
        if (!src.edgeGeom) continue;
        // EdgesGeometry is already non-indexed; only convert if it somehow has an index
        const base = src.edgeGeom.index ? src.edgeGeom.toNonIndexed() : src.edgeGeom;
        geoms.push(base.clone().translate(0, src.edgeBaseY, 0));
      }
      const merged = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
      if (!merged || !group[0].edgeMat) continue;
      const line = new THREE.LineSegments(merged, group[0].edgeMat);
      line.frustumCulled = true;
      line.name = `lod-cell-${cellKey}-edges`;
      this.lodGroup.add(line);
      created.push(line);
    }

    if (created.length > 0) this.lodCellMeshes.set(cellKey, created);
  }

  /**
   * Merges the full city LOD by ~300m cell + shared material. Runs once after
   * the progressive detailed build.
   */
  public buildLod() {
    for (const cellKey of Array.from(this.lodCellMeshes.keys())) this.clearCellMeshes(cellKey);
    this.lodCellSignatures.clear();

    const byCell = this.sourcesByCell();
    const demolished = new Set<string | number>();
    for (const cellKey of byCell.keys()) {
      this.rebuildCell(cellKey, byCell, demolished);
      this.lodCellSignatures.set(cellKey, this.cellSignature(cellKey, byCell, demolished));
    }
    this.lodBuilt = true;
  }

  /**
   * Switches between the detailed per-building meshes and the merged overview LOD.
   * 'detailed' shows the full city with edges/overlays; 'distant' renders the
   * merged LOD only (walls + edges, no per-building overlays).
   */
  public setLodMode(mode: 'detailed' | 'distant') {
    this.lodMode = mode;
    this.group.visible = mode === 'detailed';
    this.lodGroup.visible = mode === 'distant';
  }

  /**
   * Rebuilds only the LOD cells whose buildings changed (HQ / adapted /
   * demolished / powered-by-generator), leaving every other cell's meshes
   * untouched. Much cheaper than re-merging the whole city on each change.
   */
  public refreshLodIfNeeded(
    hqBuildingId: string | number | null,
    adaptedBuildings: Map<string | number, AdaptedBuilding>,
    freestandingBuildings: AdaptedBuilding[],
    demolishedBuildingIds: Map<string | number, true>
  ) {
    if (!this.lodBuilt || this.lodSources.length === 0) return;
    this.currentHqId = hqBuildingId;
    this.adaptedMap = adaptedBuildings;
    this.freestandingBuildings = freestandingBuildings;

    const byCell = this.sourcesByCell();
    const demolished = new Set<string | number>(demolishedBuildingIds.keys());
    const seen = new Set<string>();

    for (const [cellKey, sources] of byCell) {
      seen.add(cellKey);
      const sig = this.cellSignature(cellKey, byCell, demolished);
      if (sig !== (this.lodCellSignatures.get(cellKey) || '')) {
        this.rebuildCell(cellKey, byCell, demolished);
        this.lodCellSignatures.set(cellKey, sig);
      }
    }

    // Cells that no longer contain any buildings lose their meshes.
    for (const cellKey of Array.from(this.lodCellSignatures.keys())) {
      if (!seen.has(cellKey)) {
        this.clearCellMeshes(cellKey);
        this.lodCellSignatures.delete(cellKey);
      }
    }
  }

  private buildOneBuilding(
    bldg: BuildingPolygon,
    showEdges: boolean,
    elevation: ElevationGrid | null | undefined,
    exaggeration: number,
    hqBuildingId: string | number | null,
    adaptedBuildings: Map<string | number, AdaptedBuilding>,
    demolishedBuildingIds: Map<string | number, true>
  ) {
    if (!bldg.polygon || bldg.polygon.length < 3) return;
    if (demolishedBuildingIds.has(bldg.id)) return; // torn down (§7.2)

    try {
        const pts = bldg.polygon;

        // Calculate comprehensive terrain elevations across building footprint:
        // 1. Perimeter vertices
        // 2. Midpoints of all perimeter edges
        // 3. Building center & centroid
        // 4. Internal bounding sample points
        let minTerrainY = Infinity;
        let maxTerrainY = -Infinity;
        let sumY = 0;
        let sampleCount = 0;

        const checkSample = (x: number, z: number) => {
          const elev = sampleElevation(elevation, x, z, exaggeration);
          if (elev < minTerrainY) minTerrainY = elev;
          if (elev > maxTerrainY) maxTerrainY = elev;
          sumY += elev;
          sampleCount++;
        };

        // Perimeter corners
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          checkSample(p.x, p.z);

          // Edge midpoints
          const nextP = pts[(i + 1) % pts.length];
          checkSample((p.x + nextP.x) / 2, (p.z + nextP.z) / 2);
        }

        // Center / centroid
        if (bldg.center) {
          checkSample(bldg.center.x, bldg.center.z);
        }

        // Internal quarter points for wide buildings
        if (pts.length >= 4) {
          let bMinX = Infinity, bMaxX = -Infinity, bMinZ = Infinity, bMaxZ = -Infinity;
          for (const p of pts) {
            if (p.x < bMinX) bMinX = p.x;
            if (p.x > bMaxX) bMaxX = p.x;
            if (p.z < bMinZ) bMinZ = p.z;
            if (p.z > bMaxZ) bMaxZ = p.z;
          }
          const w = bMaxX - bMinX;
          const d = bMaxZ - bMinZ;
          if (w > 12 || d > 12) {
            checkSample(bMinX + w * 0.25, bMinZ + d * 0.25);
            checkSample(bMinX + w * 0.75, bMinZ + d * 0.25);
            checkSample(bMinX + w * 0.25, bMinZ + d * 0.75);
            checkSample(bMinX + w * 0.75, bMinZ + d * 0.75);
          }
        }

        const avgTerrainY = sampleCount > 0 ? sumY / sampleCount : 0;
        const slopeDifference = Math.max(0, maxTerrainY - minTerrainY);

        // Deep foundation skirt extending 4.0m into the earth below the lowest corner
        // This guarantees zero floating foundations, and that the roof is at least
        // bldg.height above the HIGHEST terrain elevation under the building.
        const foundationDepth = slopeDifference + 4.0;
        const totalExtrudeHeight = bldg.height + foundationDepth;

        // Local 2D polygon shape centered on origin coordinates
        const shape = new THREE.Shape();
        shape.moveTo(pts[0].x, -pts[0].z);
        for (let i = 1; i < pts.length; i++) {
          shape.lineTo(pts[i].x, -pts[i].z);
        }
        shape.closePath();

        // Extrude parameters
        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
          depth: totalExtrudeHeight,
          bevelEnabled: true,
          bevelSegments: 1,
          steps: 1,
          bevelSize: 0.12,
          bevelThickness: 0.12,
        };

        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Rotate geometry so extrusion is along +Y (upwards)
        geom.rotateX(-Math.PI / 2);
        geom.computeVertexNormals();
        // Roof cap UVs are mapped AFTER the flat-vs-pitched decision below —
        // flat roofs need a continuous signed frame (no mirror fold), pitched
        // keep the dominant-axis frame. Side-wall UVs are always remapped so
        // the ground-floor door band never tiles onto upper storeys.
        remapWallUvs(geom);

        const isHQ = hqBuildingId !== null && String(bldg.id) === String(hqBuildingId);
        const adapted = getPrimaryAdaptedEntry(adaptedBuildings, bldg.id);
        const isOccupiedOrInUse = Boolean(
          bldg.isOccupied ||
          isHQ ||
          (adapted && ((adapted.assignedWorkers || 0) > 0 || Boolean(adapted.assignedHeadId)))
        );

        // Pitched roof ONLY on regular footprints: the gable is built from the
        // footprint's own convex hull, so the footprint must already be
        // near-convex (its area ≈ its hull's area). Irregular shapes —
        // L/U/courtyard blocks, notched or multi-wing footprints — keep the
        // flat cap instead of wearing a hull-sized gable that doesn't match
        // their outline. Tall blocks, oversized halls and tiny sheds stay flat
        // too; every roof's ridge height varies per building (seeded by its
        // id) for silhouette diversity. The flat-vs-pitched decision is made
        // BEFORE the materials: flat roofs wear the dedicated A–E membrane
        // family, gabled roofs keep the pitched tile texture — never the same
        // texture for both.
        const idSeed = String(bldg.id).split('').reduce((a: number, c: string) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        const ridgeScale = 0.65 + ((idSeed % 100) / 100) * 0.85; // 0.65–1.5
        const footprintArea = polygonArea(pts);
        const hullPts = convexHull(pts);
        const hullArea = polygonArea(hullPts);
        const prefersFlat = idSeed % 7 === 0 && footprintArea < 180; // a few low sheds stay flat for contrast
        const isRegularFootprint =
          hullPts.length >= 4 &&
          hullPts.length <= 8 &&
          footprintArea / Math.max(1e-9, hullArea) >= 0.93 &&
          hullArea <= 9000;
        const roofLocal =
          !prefersFlat &&
          (bldg.height || 4) < 24 &&
          isRegularFootprint &&
          footprintArea >= 25 &&
          footprintArea <= 6000
            ? buildPitchedRoof(hullPts, totalExtrudeHeight, bldg.height || 4, ridgeScale)
            : null;

        // Flat roofs: pick the roof-membrane family + shade from the id seed
        // (commercial/industrial bias EPDM·TPO·gravel, residential bias
        // felt·gravel, player-access rooftops — HQ & completed adaptations —
        // bias paved terrace), then bake a per-building UV rotation + tile
        // offset into the cap so two flat roofs of the same material never
        // tile identically — the baked weathering lands on different parts of
        // every roof.
        const accessibleRoof = Boolean(isHQ || (adapted && adapted.constructionStatus === 'completed'));
        const flatRoof = roofLocal ? null : selectFlatRoof(idSeed, bldg.type, accessibleRoof);
        const flatRoofKey = flatRoof ? `${flatRoof.type}_${flatRoof.shade}` : null;
        // Roof cap UVs: pitched keeps the dominant-axis (|d| mirrored) map so
        // both slopes share one pattern direction; FLAT roofs get the
        // continuous signed map with per-building rotation + tile offset, so
        // seams/welds/paver rows run straight across the whole roof.
        if (roofLocal) {
          remapRoofUvs(geom, pts);
        } else {
          remapFlatRoofUvs(geom, pts, idSeed ^ (flatRoof.shade * 1013));
        }

        const materials = this.getBuildingMaterials(
          bldg.type,
          isOccupiedOrInUse,
          adapted?.category,
          isHQ,
          adapted?.constructionStatus,
          buildingVariantForId(bldg.id),
          this.isBuildingPowered(bldg),
          adapted?.adaptationPercentage ?? 100,
          flatRoofKey
        );

        const mesh = new THREE.Mesh(geom, materials);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Position mesh base at lowest terrain vertex minus 4.0m skirt
        const baseY = minTerrainY - 4.0;
        mesh.position.y = baseY;
        mesh.userData = { buildingId: bldg.id, type: 'building', baseElevation: avgTerrainY, isHQ, isAdapted: !!adapted, flatRoofKey };

        this.group.add(mesh);
        this.buildingMeshes.set(bldg.id, mesh);
        this.buildingData.set(bldg.id, bldg);

        if (roofLocal) {
          // Pitched roof: sloped planes (group 0) in the roofing material, the
          // vertical gable triangles (group 1) in the facade-base material.
          const roofMesh = new THREE.Mesh(roofLocal.geom, [materials[0], materials[2]]);
          roofMesh.castShadow = true;
          roofMesh.receiveShadow = true;
          roofMesh.position.y = baseY;
          roofMesh.userData = { buildingId: bldg.id, type: 'roof', baseElevation: avgTerrainY, isHQ, isAdapted: !!adapted };
          this.group.add(roofMesh);
        }

        const wallMatKey = materials.map((m) => m.uuid).join('|');
        const lodSource: (typeof this.lodSources)[number] = {
          geom,
          baseY,
          wallMatKey,
          wallMats: materials,
          edgeBaseY: baseY,
          roofGeom: roofLocal?.geom,
          cellKey: this.cellKeyFor(bldg.center.x, bldg.center.z),
          buildingId: bldg.id,
          flatRoofKey,
        };
        this.lodSources.push(lodSource);

        const roofY = baseY + totalExtrudeHeight;

        // Render HQ beacon / banner
        if (isHQ) {
          this.createHQBeacon(bldg.center.x, roofY, bldg.center.z);
        } else if (adapted) {
          this.createAdaptedMarker(
            bldg.center.x,
            roofY,
            bldg.center.z,
            adapted.category,
            adapted.constructionStatus === 'in_progress' || adapted.constructionStatus === 'planned' || (adapted.constructionStatus as string) === 'paused'
          );
        }

        // Edges for crisp illustrated / tactical silhouette
        if (showEdges && bldg.height < 45) {
          let edgeGeom: THREE.BufferGeometry = new THREE.EdgesGeometry(geom, 25);
          // Pitched roofs add ridge + hip lines to the silhouette.
          if (roofLocal) {
            const merged = mergeGeometries([edgeGeom, roofLocal.ridgeGeom], false);
            if (merged) edgeGeom = merged;
          }
          const isUnderConstruction = adapted && (adapted.constructionStatus === 'in_progress' || adapted.constructionStatus === 'planned' || (adapted.constructionStatus as string) === 'paused');
          const edgeMat = isHQ
            ? new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 2 })
            : adapted
            ? new THREE.LineBasicMaterial({
                color: isUnderConstruction ? 0xf59e0b : 0x22c55e,
                linewidth: 2,
              })
            : this.sharedEdgeMaterial;

          const edgeLine = new THREE.LineSegments(edgeGeom, edgeMat);
          edgeLine.position.y = baseY;
          this.edgeGroup.add(edgeLine);
          this.buildingEdgeObjs.set(bldg.id, edgeLine);

          const source = this.lodSources[this.lodSources.length - 1];
          if (source) {
            source.edgeGeom = edgeGeom;
            source.edgeBaseY = baseY;
            source.edgeMatKey = edgeMat.uuid;
            source.edgeMat = edgeMat;
          }
        }
    } catch (err) {
      console.warn(`Failed extruding building ${bldg.id}:`, err);
    }
  }

  private renderFreestandingBody(
    free: AdaptedBuilding,
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    try {
      // Remember the terrain snapshot so the per-frame barrier check can
      // re-ground rebuilt bodies even between state pushes.
      this.lastBarrierElevation = elevation;
      this.lastBarrierExaggeration = exaggeration;
      const typeId = free.typeId;
      const isWall =
        typeId === 'wooden_palisade' ||
        typeId === 'brick_wall' ||
        typeId === 'fortified_wall' ||
        typeId === 'metal_fence' ||
        typeId === 'barbed_wire';
      const isGate = typeId === 'wooden_gate' || typeId === 'metal_gate' || typeId === 'fortified_gate';
      const isTower = typeId === 'wooden_tower' || typeId === 'metal_tower' || typeId === 'fortified_tower' || typeId === 'floodlight_tower';
      const isField =
        typeId === 'field' ||
        typeId === 'vast_field' ||
        typeId === 'greenhouse' ||
        typeId === 'greenhouse_hydro';
      const isFacility = !isWall && !isGate && !isTower && !isField;
      // Player-built facilities carry a real PREDEFINED module footprint + a
      // type silhouette (used to mount roofs/tanks/masts below).
      const look = isFacility ? facilityLookFor(typeId, free.category) : null;

      let width = 8;
      let length = 8;
      let height = free.height || 4.5;

      if (isWall) {
        // Wall segments run along local Z (length) with a thin cross-section, so
        // once rotated toward the placement drag they tile end-to-end into one
        // continuous wall. The stored width/length (set at placement) carry the
        // exact per-segment run length so consecutive segments butt with no gaps;
        // fall back to canonical defaults for legacy saves.
        const storedW = (free as any).width;
        const storedL = (free as any).length;
        width = (typeof storedW === 'number' ? storedW : 1.2);
        length = (typeof storedL === 'number' ? storedL : 10);
        height = typeId === 'fortified_wall' ? 4.2 : typeId === 'brick_wall' ? 3.6 : 3.2;
      } else if (isGate) {
        width = 10;
        length = 3.2;
        height = 4.2;
      } else if (isTower) {
        width = 5.2;
        length = 5.2;
        height = typeId === 'fortified_tower' ? 9.5 : 8.0;
      } else if (isField) {
        // Flat rectangular plot (IFZ): the stored width/length carry the exact
        // placed footprint; fall back to the canonical plot sizes for legacy saves.
        const storedW = (free as any).width;
        const storedL = (free as any).length;
        const fDims = getFreestandingDimensions(typeId);
        width = typeof storedW === 'number' ? storedW : fDims.width;
        length = typeof storedL === 'number' ? storedL : fDims.length;
        height = typeId === 'greenhouse' || typeId === 'greenhouse_hydro' ? 2.8 : 0.7;
      } else if (isFacility) {
        // Facilities use their PREDEFINED module dimensions (or the exact size
        // stored at placement) — never the generic 8×8 fallback box.
        const storedW = (free as any).width;
        const storedL = (free as any).length;
        const fDims = getFreestandingDimensions(typeId);
        width = typeof storedW === 'number' ? storedW : fDims.width;
        length = typeof storedL === 'number' ? storedL : fDims.length;
        // Radio masts & decorative poles rise from a low plinth; the mast/body
        // is added as part of the silhouette.
        height = free.height || 4.5;
        if (typeId === 'antenna') height = Math.min(height, 2.2);
        else if (typeId === 'mast') height = Math.min(height, 1.4);
      }

      const halfW = width / 2;
      const halfL = length / 2;

      // Sample all 4 corners and center of freestanding structure footprint
      const centerElev = sampleElevation(elevation, free.position.x, free.position.z, exaggeration);
      const c1 = sampleElevation(elevation, free.position.x - halfW, free.position.z - halfL, exaggeration);
      const c2 = sampleElevation(elevation, free.position.x + halfW, free.position.z - halfL, exaggeration);
      const c3 = sampleElevation(elevation, free.position.x + halfW, free.position.z + halfL, exaggeration);
      const c4 = sampleElevation(elevation, free.position.x - halfW, free.position.z + halfL, exaggeration);

      const minElev = Math.min(centerElev, c1, c2, c3, c4);
      const maxElev = Math.max(centerElev, c1, c2, c3, c4);
      const slopeDiff = Math.max(0, maxElev - minElev);

      const foundationDepth = slopeDiff + 3.0;
      const totalH = height + foundationDepth;

      const isUnderConstruction =
        free.constructionStatus === 'in_progress' ||
        free.constructionStatus === 'planned' ||
        (free.constructionStatus as string) === 'paused';

      const boxGeom = new THREE.BoxGeometry(width, totalH, length);
      boxGeom.translate(0, totalH / 2, 0);

      let wallColor = 0x23683f;
      let roofColor = 0x2e7d47;
      let emissiveColor = 0x0d2816;
      let beaconColor = 0x22c55e;

      if (isUnderConstruction) {
        wallColor = 0xb45309;
        roofColor = 0xd97706;
        emissiveColor = 0x451a03;
        beaconColor = 0xf59e0b;
      } else if (isWall) {
        if (typeId === 'wooden_palisade') {
          wallColor = 0x854d0e;
          roofColor = 0x713f12;
          emissiveColor = 0x1c1005;
          beaconColor = 0xf59e0b;
        } else if (typeId === 'brick_wall') {
          wallColor = 0x9a3412;
          roofColor = 0x7c2d12;
          emissiveColor = 0x210c05;
          beaconColor = 0xea580c;
        } else if (typeId === 'fortified_wall') {
          wallColor = 0x475569;
          roofColor = 0x334155;
          emissiveColor = 0x0f172a;
          beaconColor = 0x94a3b8;
        } else {
          wallColor = 0x64748b;
          roofColor = 0x475569;
          emissiveColor = 0x1e293b;
          beaconColor = 0x94a3b8;
        }
      } else if (isGate) {
        wallColor = typeId === 'wooden_gate' ? 0x92400e : 0x334155;
        roofColor = 0x10b981;
        emissiveColor = 0x064e3b;
        beaconColor = 0x10b981;
      } else if (isField) {
        if (typeId === 'greenhouse' || typeId === 'greenhouse_hydro') {
          wallColor = 0x2a5f5f;
          roofColor = 0x7dd3fc;
          emissiveColor = 0x0f2a2a;
          beaconColor = 0x38bdf8;
        } else {
          wallColor = 0x3f6212;
          roofColor = 0x4d7c0f;
          emissiveColor = 0x14240a;
          beaconColor = 0x84cc16;
        }
      } else if (isTower) {
        wallColor = typeId === 'wooden_tower' ? 0x78350f : 0x1e293b;
        roofColor = 0xca8a04;
        emissiveColor = 0x422006;
        beaconColor = 0xfacc15;
      } else if (isFacility) {
        // Facility shell: the surface texture carries the material colour, and
        // the category accent colours the beacon/wireframe (blue HQ, red walls,
        // violet utility, ...) so colony infrastructure stays legible.
        wallColor = 0xffffff;
        roofColor = look ? look.roof : 0x2e7d47;
        emissiveColor = 0x101418;
        beaconColor = FUNCTIONAL_CATEGORY_COLORS[free.category]?.beacon ?? 0x22c55e;
      }

      // Procedural surface texture for walls / towers / gates / facilities so
      // they read as materials (wood planks, brick, corrugated metal, concrete)
      // rather than flat boxes. repeat is in 0..1 box-UV space — tile every
      // ~2m so 10m walls show 5 tiles.
      let matKind: FreestandingMaterialKindName | null = null;
      if (!isUnderConstruction && !isField) {
        if (isFacility) matKind = look?.kind ?? null;
        else if (typeId === 'wooden_palisade' || typeId === 'wooden_gate' || typeId === 'wooden_tower') matKind = 'wood';
        else if (typeId === 'brick_wall') matKind = 'brick';
        else if (typeId === 'fortified_wall' || typeId === 'fortified_gate' || typeId === 'fortified_tower') matKind = 'concrete';
        else matKind = 'metal';
      }
      const wallMatOpts: THREE.MeshLambertMaterialParameters = {
        color: wallColor,
        emissive: emissiveColor,
        transparent: isUnderConstruction,
        opacity: isUnderConstruction ? 0.75 : 1.0,
      };
      if (matKind) {
        // CLONE the shared tileable surface — its repeat is per-structure (one
        // tile per ~2m of real wall) so mutating the shared cached texture
        // would leave every earlier structure sampling the last one's repeat.
        const tex = getFreestandingMaterialTexture(matKind).clone();
        tex.repeat.set(Math.max(1, width / 2), Math.max(1, height / 2));
        wallMatOpts.map = tex;
        // Matching height map so freestanding shells also read with relief
        // (plank seams, brick courses, corrugated ribs, pour joints).
        const bumpSrc = getFreestandingBumpTexture(matKind);
        if (bumpSrc) {
          const bump = bumpSrc.clone();
          bump.repeat.set(tex.repeat.x, tex.repeat.y);
          wallMatOpts.bumpMap = bump;
          wallMatOpts.bumpScale = 0.85;
        }
      }
      const wallMat = new THREE.MeshLambertMaterial(wallMatOpts);
      const roofMat = new THREE.MeshLambertMaterial({
        color: roofColor,
        emissive: emissiveColor,
        transparent: isUnderConstruction,
        opacity: isUnderConstruction ? 0.75 : 1.0,
      });

      boxGeom.clearGroups();
      boxGeom.addGroup(0, 12, 0); // +X, -X sides (wall)
      boxGeom.addGroup(12, 6, 1); // +Y top (roof)
      boxGeom.addGroup(18, 6, 0); // -Y bottom (wall)
      boxGeom.addGroup(24, 12, 0); // +Z, -Z sides (wall)

      const mesh = new THREE.Mesh(boxGeom, [wallMat, roofMat]);
      const baseY = minElev - 3.0;

      // Timber stockades, chain-link fences and barbed wire are NOT solid
      // boxes: each barrier gets its own true geometry (vertical logs, mesh
      // fabric between posts, wire strands on posts). Brick & fortified walls
      // keep the masonry box shell. Under-construction sites stay as the
      // translucent amber box so the player sees the shape they are building.
      if (isWall && !isUnderConstruction && typeId !== 'brick_wall' && typeId !== 'fortified_wall') {
        // Ground-height function in the barrier's LOCAL frame (root sits at
        // baseY): pieces are planted individually so a stockade/fence follows
        // the terrain instead of standing 3m below it on flat ground.
        const rad0 = ((free.rotationDeg || 0) * Math.PI) / 180;
        const sinR = Math.sin(rad0);
        const cosR = Math.cos(rad0);
        const groundYAt = (localZ: number): number => {
          const wx = free.position.x + sinR * localZ;
          const wz = free.position.z + cosR * localZ;
          const elev = sampleElevation(elevation, wx, wz, exaggeration);
          return Math.max(2.6, elev - baseY);
        };
        this.renderBarrierGeometry(free, typeId, length, height, baseY, centerElev, beaconColor, groundYAt);
        return;
      }

      // Completed masonry walls (brick/fortified keep their box shell) get the
      // same damage + weather dressing as the true-geometry barriers.
      if (isWall && !isUnderConstruction) {
        this.dressMasonryBarrier(mesh, free, width, length, totalH, wallMat, roofMat);
      }

      mesh.position.set(free.position.x, baseY, free.position.z);
      mesh.rotation.y = (free.rotationDeg || 0) * Math.PI / 180;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Gates always render as two door panels flanked by two towers (animated
      // per frame for friendly traffic). Under-construction gates use the same
      // silhouette with translucent amber materials so the player sees the shape
      // they're building rather than a plain box.
      if (isGate) {
        this.buildGateStructure(free, width, length, height, baseY, centerElev, wallMat, roofMat, isUnderConstruction);
        return;
      }

      this.registerFreestandingBuilding(free, width, length, height, centerElev, mesh);

      // Facilities: mount the type's own silhouette on the completed body — a
      // gabled roof on building-like modules, tanks / stacks / cabinets / masts
      // on infrastructure. Children of the root mesh so demolition removes them.
      if (isFacility && !isUnderConstruction && look) {
        this.attachFacilitySilhouette(mesh, width, length, totalH, look, wallMat, roofMat);
      }

      // Add edge wireframe (tracked so body rebuilds remove the old outline).
      const edgeGeom = new THREE.EdgesGeometry(boxGeom);
      const edgeMat = new THREE.LineBasicMaterial({
        color: isUnderConstruction ? 0x60a5fa : beaconColor,
        linewidth: 2,
      });
      const edgeLine = new THREE.LineSegments(edgeGeom, edgeMat);
      edgeLine.position.set(free.position.x, baseY, free.position.z);
      edgeLine.rotation.y = (free.rotationDeg || 0) * Math.PI / 180;
      this.edgeGroup.add(edgeLine);
      const prevEdges = this.freestandingEdges.get(free.buildingId) || [];
      prevEdges.push(edgeLine);
      this.freestandingEdges.set(free.buildingId, prevEdges);

    } catch (e) {
      console.warn('Failed rendering freestanding building:', e);
    }
  }

  /**
   * Player-built barriers get material-accurate geometry instead of a generic
   * textured box:
   *  - wooden_palisade: a stockade of vertical timber logs (vertex-toned so the
   *    wood doesn't read as one flat slab),
   *  - metal_fence: a see-through chain-link fabric panel strung between steel
   *    posts with a top + mid rail,
   *  - barbed_wire: low steel posts carrying four strands of wire (no solid
   *    face — consistent with it not blocking movement).
   * Brick & fortified walls keep the masonry shell (brick vs concrete) and are
   * dressed by dressMasonryBarrier.
   *
   * Every piece stands ON the terrain (each log/post samples its own ground
   * height instead of sinking with the foundation) and carries the live damage
   * tier + weather: palisade logs snap to stumps, fall out and char as
   * durability drops, chain-link tears into holes, wire strands sag or part —
   * while rain raises puddle grime up the base and snow caps the tops.
   */
  private renderBarrierGeometry(
    free: AdaptedBuilding,
    typeId: string,
    length: number,
    height: number,
    baseY: number,
    centerElev: number,
    beaconColor: number,
    groundYAt: (localZ: number) => number
  ) {
    const hl = length / 2;
    const root = new THREE.Group();
    root.position.set(free.position.x, baseY, free.position.z);
    root.rotation.y = ((free.rotationDeg || 0) * Math.PI) / 180;
    root.castShadow = true;
    root.receiveShadow = true;

    const dmg = this.barrierDamage(free); // continuous 0..1 (repair eases it down)
    const wet = this.barrierRain;
    const snow = this.barrierSnow;
    // Corrosion / weathering intensifies smoothly with damage.
    const rust = clamp01((dmg - 0.14) / 0.6);

    let thickness = 1.0; // x-extent (for click polygon + edge wireframe)
    let edgeTop = 3.0 + height; // local outline top (foundation starts at y=0, ground ~y=3)

    // Corrosion / charring tint, and shared grime/snow materials.
    const steelMat = new THREE.MeshLambertMaterial({
      color: mixColor(0x5f6c77, 0x242b30, rust),
    });
    const wireMat = new THREE.MeshLambertMaterial({
      color: mixColor(0x52585d, 0x3a2116, rust),
    });
    const mudMat = new THREE.MeshLambertMaterial({ color: wet > 0.4 ? 0x20170e : 0x3a2c1e });
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xe9eff6 });

    const sampleGroundMax = () => {
      let m = 3.0;
      for (let z = -hl; z <= hl + 0.001; z += 2.4) {
        m = Math.max(m, groundYAt(Math.min(Math.max(z, -hl), hl)));
      }
      return m;
    };

    if (typeId === 'wooden_palisade') {
      thickness = 0.55;
      const spacing = 0.52;
      const count = Math.max(2, Math.round(length / spacing));
      const geoms: THREE.BufferGeometry[] = [];
      const capGeoms: THREE.BufferGeometry[] = [];
      let top = 3.0;
      for (let i = 0; i < count; i++) {
        const z = -hl + spacing * (i + 0.5);
        const g = Math.max(2.6, groundYAt(z));
        const baseH = height * (1 + (((i * 37) % 9) - 4) / 60); // uneven tops
        // Every log carries its own deterministic break point on the 0..1
        // damage scale. As repair crews advance, dmg eases down and each log
        // whose threshold is crossed pops back in one at a time instead of the
        // whole wall snapping from battered back to pristine.
        const u1 = seededFrac(i * 7.13 + 0.4);
        const u2 = seededFrac(i * 3.71 + 2.1);
        const u3 = seededFrac(i * 5.9 + 5.7);
        const missing = dmg >= 0.64 + u2 * 0.3; // heaviest damage: knocked out
        if (missing) continue; // a gap right through the stockade
        const stump = dmg >= 0.42 + u1 * 0.5; // lighter damage: snapped to a stump
        const charred = dmg >= 0.12 + u3 * 0.5; // scorched / weather-blackened
        const frac = seededFrac(i * 1.7 + 13.1);
        const h = stump ? Math.max(0.45, baseH * (0.34 + frac * 0.25)) : baseH;
        const r = 0.23 + (i % 3) * 0.02;
        const tone = charred
          ? CHARRED_TONES[(i + Math.round(dmg * 3)) % CHARRED_TONES.length]
          : LOG_TONES[i % LOG_TONES.length];
        const cyl = new THREE.CylinderGeometry(r * 0.92, r, h, 7);
        const lean =
          !stump && i % 3 === 1 && dmg >= 0.6 + seededFrac(i * 8.9 + 3.3) * 0.3
            ? (0.05 + frac * 0.12) * (i % 2 ? 1 : -1)
            : 0;
        if (lean !== 0) {
          cyl.translate(0, h / 2, 0); // pivot at the log's base
          cyl.rotateX(lean); // staggered lean on a battered palisade
          cyl.translate(0, g, z);
        } else {
          cyl.translate(0, g + h / 2, z);
        }
        // Per-log vertex tones: slight per-log brightness variety, soot on
        // charred timber, and puddle grime darkening from the ground up (rain
        // soaks the base higher and darker).
        const n = cyl.attributes.position.count;
        const lit = (0.78 + 0.44 * frac) * (1 - dmg * 0.16); // soot deepens with damage
        const tr = (((tone >> 16) & 255) / 255) * lit;
        const tg = (((tone >> 8) & 255) / 255) * lit;
        const tb = ((tone & 255) / 255) * lit;
        const mudTop = 0.85 + wet * 0.55; // rain puddle line climbs the log
        const col = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          const y = cyl.attributes.position.getY(k);
          const mud = y >= g && y < g + mudTop ? 1 - (y - g) / mudTop : 0;
          const dark = 1 - mud * (0.3 + wet * 0.22);
          col[k * 3] = tr * dark;
          col[k * 3 + 1] = tg * dark;
          col[k * 3 + 2] = tb * dark;
        }
        cyl.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geoms.push(cyl);
        if (stump) continue; // snapped tops get no snow cap
        if (snow > 0.05) {
          // A dusting of snow piled on each standing log top.
          const cap = new THREE.ConeGeometry(r * 0.55, 0.18, 6);
          cap.translate((frac - 0.5) * r * 0.7, g + h + 0.07, z + (frac - 0.5) * 0.16);
          capGeoms.push(cap);
        }
        top = Math.max(top, g + h);
      }
      if (geoms.length > 0) {
        const mesh = new THREE.Mesh(
          this.mergeGeoms(geoms),
          new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
      }
      if (capGeoms.length > 0) {
        const snowMesh = new THREE.Mesh(this.mergeGeoms(capGeoms), snowMat);
        snowMesh.castShadow = true;
        root.add(snowMesh);
      }
      edgeTop = top;
    } else if (typeId === 'metal_fence') {
      thickness = 0.5;
      const step = 2.4;
      const postZs: number[] = [];
      for (let z = -hl; z <= hl + 0.001; z += step) {
        postZs.push(Math.min(Math.max(z, -hl), hl));
      }
      const gEnd = Math.max(groundYAt(-hl), groundYAt(0), groundYAt(hl));
      const railY = gEnd + height; // level top rail above the highest ground

      // Chain-link fabric, one panel per span so damage can open real gaps.
      const fabricTex = getFreestandingMaterialTexture('chainlink').clone();
      fabricTex.repeat.set(Math.max(1, step / 2), Math.max(1, height / 2));
      const cleanMat = new THREE.MeshLambertMaterial({
        color: mixColor(0xdde3e8, 0x99a2a8, clamp01((dmg - 0.1) / 0.6)),
        map: fabricTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const tornMat = new THREE.MeshLambertMaterial({
        color: 0x8d979d,
        map: fabricTex,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      for (let s = 0; s + 1 < postZs.length; s++) {
        const zA = postZs[s];
        const zB = postZs[s + 1];
        // Each panel has its own break thresholds, so repair restores them one
        // panel at a time rather than in tier-sized jumps.
        const hole = dmg >= 0.58 + seededFrac(s * 13.7 + length) * 0.34;
        if (hole) continue; // battered: panel torn clean out
        const span = zB - zA;
        const zM = (zA + zB) / 2;
        const gLow = Math.min(groundYAt(zA), groundYAt(zB));
        const torn = dmg >= 0.3 + seededFrac(s * 7.3 + 3.1) * 0.38;
        const pTop = railY - 0.06;
        const pBot = gLow + 0.04;
        if (torn) {
          // Shredded panel: only the lower ragged half remains.
          const hT = (pTop - pBot) * 0.45;
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, hT, span), tornMat);
          panel.position.set(0, pBot + hT / 2 + (seededFrac(s * 3.3) - 0.5) * 0.1, zM);
          panel.castShadow = true;
          root.add(panel);
        } else {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, pTop - pBot, span), cleanMat);
          panel.position.set(0, (pBot + pTop) / 2, zM);
          panel.castShadow = true;
          root.add(panel);
        }
      }

      // Steel frame: posts planted on their own ground, level top + mid rails.
      const pieces: THREE.BufferGeometry[] = [];
      const mudPieces: THREE.BufferGeometry[] = [];
      const snowPieces: THREE.BufferGeometry[] = [];
      postZs.forEach((z, idx) => {
        const g = Math.max(2.6, groundYAt(z));
        const snapped = idx % 4 === 1 && dmg >= 0.58 + seededFrac(idx * 5.1 + length) * 0.32;
        const postTop = snapped ? g + height * 0.55 : railY; // post sheared near the ground
        const post = new THREE.BoxGeometry(0.14, postTop - g, 0.14);
        post.translate(0, g + (postTop - g) / 2, z);
        pieces.push(post);
        if (wet > 0.05) {
          // Puddle grime: mud splash ringed around each post foot.
          const mud = new THREE.BoxGeometry(0.3, 0.28 + wet * 0.25, 0.3);
          mud.translate(0, g + 0.1, z);
          mudPieces.push(mud);
        }
        if (snow > 0.05 && !snapped) {
          const cap = new THREE.BoxGeometry(0.2, 0.12, 0.2);
          cap.translate(0, railY - 0.02, z);
          snowPieces.push(cap);
        }
      });
      const topRail = new THREE.BoxGeometry(length, 0.07, 0.08);
      topRail.translate(0, railY - 0.045, 0);
      pieces.push(topRail);
      const midRail = new THREE.BoxGeometry(length, 0.05, 0.06);
      midRail.translate(0, gEnd + height * 0.5, 0);
      pieces.push(midRail);
      if (pieces.length > 0) {
        const frame = new THREE.Mesh(this.mergeGeoms(pieces), steelMat);
        frame.castShadow = true;
        root.add(frame);
      }
      if (mudPieces.length > 0) {
        const mud = new THREE.Mesh(this.mergeGeoms(mudPieces), mudMat);
        root.add(mud);
      }
      if (snowPieces.length > 0) {
        // Snow lying along the top rail + post caps.
        const bar = new THREE.BoxGeometry(length + 0.06, 0.09, 0.14);
        bar.translate(0, railY + 0.02, 0);
        snowPieces.push(bar);
        const snowMesh = new THREE.Mesh(this.mergeGeoms(snowPieces), snowMat);
        snowMesh.castShadow = true;
        root.add(snowMesh);
      }
      edgeTop = railY + 0.2;
    } else if (typeId === 'barbed_wire') {
      thickness = 0.45;
      const wireH = 1.5;
      const postZs: number[] = [];
      for (let z = -hl; z <= hl + 0.001; z += 3.0) {
        postZs.push(Math.min(Math.max(z, -hl), hl));
      }
      const pieces: THREE.BufferGeometry[] = [];
      const mudPieces: THREE.BufferGeometry[] = [];
      const snowPieces: THREE.BufferGeometry[] = [];
      // Low uprights every ~3m, planted on their own ground.
      postZs.forEach((zz, idx) => {
        const g = Math.max(2.6, groundYAt(zz));
        const snapped = idx % 5 === 2 && dmg >= 0.58 + seededFrac(idx * 6.7 + 1.3) * 0.34;
        const postH = snapped ? wireH * 0.5 : wireH;
        const post = new THREE.BoxGeometry(0.09, postH, 0.09);
        post.translate(0, g + postH / 2, zz);
        pieces.push(post);
        // Crossed brace for a bit of structure at each end.
        if (Math.abs(Math.abs(zz) - hl) < 0.01) {
          const brace = new THREE.BoxGeometry(0.06, wireH * 0.7, 0.06);
          brace.translate(0, g + wireH * 0.35, zz);
          brace.rotateX(0.5);
          pieces.push(brace);
        }
        if (wet > 0.05) {
          const mud = new THREE.BoxGeometry(0.24, 0.24, 0.24);
          mud.translate(0, g + 0.08, zz);
          mudPieces.push(mud);
        }
        if (snow > 0.05 && !snapped) {
          const cap = new THREE.SphereGeometry(0.09, 6, 5);
          cap.translate(0, g + postH + 0.02, zz);
          snowPieces.push(cap);
        }
      });
      // Barb strands per span, sagging toward the middle; damaged walls drop
      // whole strands or let them droop nearly to the ground.
      const strandHs = [0.4, 0.7, 1.0, 1.3];
      for (let s = 0; s + 1 < postZs.length; s++) {
        const zA = postZs[s];
        const zB = postZs[s + 1];
        const gA = Math.max(2.6, groundYAt(zA));
        const gB = Math.max(2.6, groundYAt(zB));
        const zM = (zA + zB) / 2;
        const sagBase = 0.03 + dmg * 0.22; // wire sags deeper as the barrier is hit
        strandHs.forEach((sh, k) => {
          // Each strand parts at its own damage point, so repair re-strings them
          // one at a time instead of the whole wall restoring at once.
          const dropped = dmg >= 0.44 + k * 0.13;
          if (dropped) return; // snapped strand gone between these posts
          const yA = gA + sh;
          const yB = gB + sh;
          const yM = (gA + gB) / 2 + sh - sagBase;
          for (const [z0, y0, z1, y1] of [
            [zA, yA, zM, yM],
            [zM, yM, zB, yB],
          ] as const) {
            const len = Math.abs(z1 - z0);
            if (len < 0.05) continue;
            const strand = new THREE.CylinderGeometry(0.018, 0.018, len, 5);
            strand.rotateX(Math.PI / 2); // axis along local Z
            strand.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
            pieces.push(strand);
            if (snow > 0.05 && k === strandHs.length - 1) {
              // Snow clumping along the top strand.
              const clump = new THREE.CylinderGeometry(0.032, 0.032, len, 5);
              clump.rotateX(Math.PI / 2);
              clump.translate(0, (y0 + y1) / 2 + 0.03, (z0 + z1) / 2);
              snowPieces.push(clump);
            }
          }
        });
      }
      const wire = new THREE.Mesh(this.mergeGeoms(pieces), wireMat);
      wire.castShadow = true;
      root.add(wire);
      if (mudPieces.length > 0) {
        root.add(new THREE.Mesh(this.mergeGeoms(mudPieces), mudMat));
      }
      if (snowPieces.length > 0) {
        const snowMesh = new THREE.Mesh(this.mergeGeoms(snowPieces), snowMat);
        snowMesh.castShadow = true;
        root.add(snowMesh);
      }
      edgeTop = sampleGroundMax() + wireH + 0.2;
    }

    this.registerFreestandingBuilding(free, thickness, length, height, centerElev, root);
    const edgeGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(thickness, edgeTop, length));
    const edgeMat = new THREE.LineBasicMaterial({ color: beaconColor, linewidth: 2 });
    const edgeLine = new THREE.LineSegments(edgeGeom, edgeMat);
    edgeLine.position.set(free.position.x, baseY, free.position.z);
    edgeLine.rotation.y = ((free.rotationDeg || 0) * Math.PI) / 180;
    this.edgeGroup.add(edgeLine);
    // Track the outline so destroyFreestandingBody removes it on rebuilds.
    const prevEdges = this.freestandingEdges.get(free.buildingId) || [];
    prevEdges.push(edgeLine);
    this.freestandingEdges.set(free.buildingId, prevEdges);
  }

  /**
   * Damage + weather dressing for brick/fortified masonry walls (which keep
   * their textured box shell): soot tint and chipped/cracked patches as
   * durability drops, puddle grime wrapping the base when wet, and a snow cap
   * when it snows. Reads live durability + weather, so the look only appears
   * when the barrier actually needs it.
   */
  private dressMasonryBarrier(
    mesh: THREE.Mesh,
    free: AdaptedBuilding,
    width: number,
    length: number,
    totalH: number,
    wallMat: THREE.Material,
    _roofMat: THREE.Material
  ) {
    const dmg = this.barrierDamage(free); // 0..1, eased down by repair progress
    const wet = this.barrierRain;
    const snow = this.barrierSnow;
    if (dmg < 0.05 && wet <= 0.05 && snow <= 0.05) return; // pristine, dry, clear

    // Soot / weathering multiplies the textured shell instead of replacing it.
    const lam = wallMat as THREE.MeshLambertMaterial;
    lam.color.multiplyScalar(1 - Math.min(0.32, dmg * 0.34) - wet * 0.04);

    const hl = length / 2;
    const halfW = width / 2;
    const groundY = 3.0; // top of the buried foundation (~terrain at the low corner)
    const crackMat = new THREE.MeshLambertMaterial({ color: 0x2b2320 });
    const mudMat = new THREE.MeshLambertMaterial({
      color: wet > 0.4 ? 0x221a12 : 0x352a1d,
    });

    // Puddle grime: a mud band wrapping the base (rain soaks it higher + darker).
    if (wet > 0.05 || dmg >= 0.1) {
      const bandH = 0.5 + wet * 0.5 + Math.min(0.45, dmg * 0.55);
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.12, bandH, length + 0.12),
        mudMat
      );
      band.position.set(0, groundY + bandH / 2 - 0.12, 0);
      rootAdd(band);
    }

    // Damage: charred cracks / knocked-out patches climbing the faces. Their
    // count grows continuously with damage, so repair erases them one by one.
    if (dmg >= 0.15) {
      const nCracks = Math.max(1, Math.round((dmg - 0.1) * 12));
      for (let k = 0; k < nCracks; k++) {
        const frac = seededFrac(k * 3.1 + length);
        const side = k % 2 === 0 ? 1 : -1;
        const z = -hl + (k + 0.5) * (length / Math.max(1, nCracks)) + (frac - 0.5) * 1.4;
        const crackH = 0.8 + dmg * 1.8 + frac * 1.2;
        const y = groundY + 0.6 + frac * 1.8;
        if (y + crackH > totalH - 0.2) continue;
        const chip = new THREE.BoxGeometry(0.09, crackH, 0.13 + frac * 0.12);
        chip.translate(side * (halfW + 0.05), y, z);
        const c = new THREE.Mesh(chip, crackMat);
        c.castShadow = true;
        mesh.add(c);
      }
      if (dmg >= 0.6) {
        // Missing merlon along the top of battered masonry.
        const chipMat = crackMat;
        const nChips = Math.max(1, Math.round((dmg - 0.5) * 8));
        for (let k = 0; k < nChips; k++) {
          const frac = seededFrac(k * 7.7 + length * 2);
          const z = -hl + (k + 0.5) * (length / nChips);
          const chip = new THREE.BoxGeometry(width + 0.14, 0.3 + frac * 0.25, 0.5);
          chip.translate(0, totalH - 0.05, z);
          const c = new THREE.Mesh(chip, chipMat);
          c.castShadow = true;
          mesh.add(c);
        }
      }
    }

    // Snow cap lying along the top (thicker over the coping stone).
    if (snow > 0.05) {
      const cap = new THREE.BoxGeometry(width + 0.16, 0.15, length + 0.16);
      cap.translate(0, totalH + 0.06, 0);
      const capMesh = new THREE.Mesh(
        cap,
        new THREE.MeshLambertMaterial({ color: 0xe9eff6 })
      );
      capMesh.castShadow = true;
      mesh.add(capMesh);
    }

    // Keep all added dressing meshes inside the root so cleanup travels with it.
    function rootAdd(child: THREE.Object3D) {
      child.castShadow = true;
      mesh.add(child);
    }
  }

  /** Merges translated primitive geometries into one (disposing the inputs). */
  private mergeGeoms(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (merged) return merged;
    return new THREE.BufferGeometry();
  }

  /**
   * Builds a triangular prism (ridge roof) over a facility box and adds it as
   * a child of the body. Ridge runs along the module length (local +Z); the
   * sloped planes wear the roof material, the vertical gable triangles wear
   * the wall material with UVs phased to the box so the masonry continues.
   * Box geometry is pre-translated so local y = totalH is the roof plane.
   */
  private addFacilityRidgeRoof(
    root: THREE.Mesh,
    width: number,
    length: number,
    totalH: number,
    wallMat: THREE.Material,
    roofMat: THREE.Material
  ) {
    const rise = Math.min(3.6, Math.max(1.4, width * 0.3));
    const y0 = totalH + 0.05;
    const ry = y0 + rise;
    const hw = width / 2;
    const hl = length / 2;
    const P = (x: number, y: number, z: number) => [x, y, z];
    // One face = three vertex triples; winding chosen so each triangle's cross
    // product points outward (verified against the outward normal direction).
    const slopeFaces: number[][][] = [
      // +x slope (outward normal x > 0)
      tri(P(0, ry, -hl), P(hw, y0, hl), P(hw, y0, -hl)),
      tri(P(0, ry, -hl), P(0, ry, hl), P(hw, y0, hl)),
      // -x slope (outward normal x < 0)
      tri(P(0, ry, hl), P(-hw, y0, -hl), P(-hw, y0, hl)),
      tri(P(0, ry, hl), P(-hw, y0, -hl), P(0, ry, -hl)),
    ];
    const gableFaces: number[][][] = [
      // +z gable triangle
      tri(P(-hw, y0, hl), P(hw, y0, hl), P(0, ry, hl)),
      // -z gable triangle
      tri(P(hw, y0, -hl), P(-hw, y0, -hl), P(0, ry, -hl)),
    ];
    // Gable UVs: u across the width like the box end-face, v phased to y/totalH
    // so the wall texture's pattern continues seamlessly past the eave.
    const gableUv: number[] = [];
    for (const f of gableFaces) {
      for (const v of f) {
        gableUv.push((v[0] + hw) / width, v[1] / totalH);
      }
    }

    const slopes = this.flatShadedMesh(slopeFaces, []);
    const slopeMesh = new THREE.Mesh(slopes, roofMat);
    const gables = this.flatShadedMesh(gableFaces, gableUv);
    const gableMesh = new THREE.Mesh(gables, wallMat);
    for (const m of [slopeMesh, gableMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
  }

  /** Non-indexed, flat-shaded BufferGeometry from an array of triangle faces. */
  private flatShadedMesh(faces: number[][][], uvFlat: number[]): THREE.BufferGeometry {
    const posArr: number[] = [];
    const nrmArr: number[] = [];
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    for (const f of faces) {
      tmpA.set(f[1][0] - f[0][0], f[1][1] - f[0][1], f[1][2] - f[0][2]);
      tmpB.set(f[2][0] - f[0][0], f[2][1] - f[0][1], f[2][2] - f[0][2]);
      nrm.crossVectors(tmpA, tmpB).normalize();
      for (const v of f) {
        posArr.push(v[0], v[1], v[2]);
        nrmArr.push(nrm.x, nrm.y, nrm.z);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(nrmArr, 3));
    if (uvFlat.length > 0) geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvFlat, 2));
    return geom;
  }

  private attachFacilitySilhouette(
    root: THREE.Mesh,
    width: number,
    length: number,
    totalH: number,
    look: FacilityLook,
    wallMat: THREE.Material,
    roofMat: THREE.Material
  ) {
    const sil = look.silhouette;
    if (sil === 'gable') {
      this.addFacilityRidgeRoof(root, width, length, totalH, wallMat, roofMat);
    } else if (sil === 'tank') {
      // Cistern: a big galvanised tank lying along the plinth's length.
      const r = Math.min(3.8, Math.max(1.6, Math.min(width, length) * 0.34));
      const len = Math.max(width, length) * 0.62;
      const cyl = new THREE.CylinderGeometry(r, r, len, 20, 1, false);
      cyl.rotateX(Math.PI / 2); // axis now along local Z
      const tank = new THREE.Mesh(cyl, new THREE.MeshLambertMaterial({ color: 0x8aa3ad }));
      tank.position.set(0, totalH + r, 0);
      tank.castShadow = true;
      // Dark banding ring so it reads as riveted steel, not a plain tube.
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.18, 20),
        new THREE.MeshLambertMaterial({ color: 0x55676e })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, totalH + r, -len / 4);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.18, 20),
        new THREE.MeshLambertMaterial({ color: 0x55676e })
      );
      cap.rotation.x = Math.PI / 2;
      cap.position.set(0, totalH + r, len / 4);
      root.add(tank, ring, cap);
    } else if (sil === 'stack') {
      // Generator: a steel exhaust stack near one corner + a small fuel tank.
      const stackH = 3.2;
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.52, stackH, 12),
        new THREE.MeshLambertMaterial({ color: 0x3f474d })
      );
      stack.position.set(width * 0.3, totalH + stackH / 2, 0);
      stack.castShadow = true;
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.54, 0.54, 0.16, 12),
        new THREE.MeshLambertMaterial({ color: 0x9b7d2a }) // hazard yellow
      );
      band.position.set(width * 0.3, totalH + stackH - 0.3, 0);
      const fuel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, width * 0.44, 10),
        new THREE.MeshLambertMaterial({ color: 0x6e4a2e }) // fuel tank
      );
      fuel.rotation.x = Math.PI / 2;
      fuel.position.set(-width * 0.28, totalH + 0.34, length * 0.32);
      root.add(stack, band, fuel);
    } else if (sil === 'cells') {
      // Battery bank: a row of battery cabinets + a warning stripe.
      const cellW = Math.max(1.1, width * 0.2);
      const cellD = Math.max(1.0, length * 0.15);
      const cellH = 1.35;
      for (let i = -1; i <= 1; i++) {
        const cell = new THREE.Mesh(
          new THREE.BoxGeometry(cellW, cellH, cellD),
          new THREE.MeshLambertMaterial({ color: 0x37404a })
        );
        cell.position.set(0, totalH + cellH / 2, i * Math.max(2.2, length * 0.3));
        cell.castShadow = true;
        root.add(cell);
      }
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.7, 0.14, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x9b7d2a })
      );
      stripe.position.set(0, totalH + 0.1, length * 0.44);
      root.add(stripe);
    } else if (sil === 'antenna') {
      // Radio mast: a low plinth (the box) + a tapering lattice mast with arms.
      const mastH = 11;
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.3, 0.9, 8),
        new THREE.MeshLambertMaterial({ color: 0x2e353b })
      );
      base.position.set(0, totalH + 0.45, 0);
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.3, mastH - 0.9, 6),
        new THREE.MeshLambertMaterial({ color: 0x3b444b })
      );
      upper.position.set(0, totalH + 0.9 + (mastH - 0.9) / 2, 0);
      const whip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6),
        new THREE.MeshLambertMaterial({ color: 0x555e66 })
      );
      whip.position.set(0, totalH + mastH + 0.8, 0);
      const armMat = new THREE.MeshLambertMaterial({ color: 0x2e353b });
      const arms: THREE.Mesh[] = [];
      for (const h of [2.4, 5.2, 8.0]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), armMat);
        arm.position.set(0, totalH + h, 0);
        arms.push(arm);
      }
      for (const m of [base, upper, whip, ...arms]) m.castShadow = true;
      root.add(base, upper, whip, ...arms);
    } else if (sil === 'pole') {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.12, 6.4, 6),
        new THREE.MeshLambertMaterial({ color: 0x4a525a })
      );
      pole.position.set(0, totalH + 3.2, 0);
      pole.castShadow = true;
      root.add(pole);
    }
  }

  /**
   * Completed gates are drawn as a header beam, two side posts and two door
   * panels hinged at the posts. The door groups are stored in gateAnimations so
   * update() can swing them open/closed; the root group carries the buildingId
   * userData (propagated to every child mesh) so click inspection still works.
   */
  private buildGateStructure(
    free: AdaptedBuilding,
    width: number,
    length: number,
    height: number,
    baseY: number,
    centerElev: number,
    wallMat: THREE.Material,
    roofMat: THREE.Material,
    isUnderConstruction = false
  ) {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(free.position.x, baseY, free.position.z);
    gateGroup.rotation.y = ((free.rotationDeg || 0) * Math.PI) / 180;
    gateGroup.castShadow = true;
    gateGroup.receiveShadow = true;

    const setData = (obj: THREE.Object3D) => {
      obj.userData = {
        buildingId: free.buildingId,
        type: 'building',
        isFreestanding: true,
        baseElevation: centerElev,
      };
    };
    setData(gateGroup);

    // Two full-size guard towers flank the gate opening on each side, matching
    // the scale of player-built watchtowers. They sit OUTSIDE the opening (so the
    // road gap stays fully passable) and rise above it, bridging the fence line.
    const towerW = 4.4;
    const towerD = 4.4;
    const towerH = free.typeId === 'fortified_gate' ? 9.5 : 8.0;

    // Each gate wears the same material language as its wall type: a wooden
    // gate's towers/doors are a log stockade (vertical staves), a metal gate is
    // corrugated steel, a fortified gate is concrete — matching the palisade /
    // chain-link / masonry barriers they sit in.
    const gateKind: 'logs' | 'metal' | 'concrete' =
      free.typeId === 'wooden_gate' ? 'logs' : free.typeId === 'metal_gate' ? 'metal' : 'concrete';
    const roofHex: Record<string, number> = {
      wooden_gate: 0x7a4f2c,
      metal_gate: 0x5f666d,
      fortified_gate: 0x9aa0a5,
    };
    const faceMat = (repW: number, repH: number): THREE.MeshLambertMaterial => {
      const tex = getFreestandingMaterialTexture(gateKind).clone();
      tex.repeat.set(Math.max(1, repW / 2), Math.max(1, repH / 2));
      const opts: THREE.MeshLambertMaterialParameters = {
        color: 0xffffff,
        map: tex,
        transparent: isUnderConstruction,
        opacity: isUnderConstruction ? 0.75 : 1.0,
      };
      const bumpSrc = getFreestandingBumpTexture(gateKind);
      if (bumpSrc) {
        const bump = bumpSrc.clone();
        bump.repeat.set(tex.repeat.x, tex.repeat.y);
        opts.bumpMap = bump;
        opts.bumpScale = 0.85;
      }
      return new THREE.MeshLambertMaterial(opts);
    };
    const plainMat = (color: number, emissive = 0x000000): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({
        color,
        emissive,
        transparent: isUnderConstruction,
        opacity: isUnderConstruction ? 0.75 : 1.0,
      });
    // Under construction every part is the translucent amber placeholder; once
    // complete the shell is textured to its type.
    const towerMat = isUnderConstruction ? plainMat(0xb45309, 0x451a03) : faceMat(towerW, towerH);
    const towerRoofMat = isUnderConstruction
      ? plainMat(0xd97706, 0xd97706)
      : plainMat(roofHex[free.typeId] ?? 0x475569);
    const beamSpan = width + towerW * 2 + 0.2;
    const beamMat = isUnderConstruction ? plainMat(0xd97706) : faceMat(beamSpan, 0.8);

    for (const sx of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerD), [towerMat, towerRoofMat]);
      tower.geometry.clearGroups();
      tower.geometry.addGroup(0, 12, 0);
      tower.geometry.addGroup(12, 6, 1);
      tower.geometry.addGroup(18, 6, 0);
      tower.geometry.addGroup(24, 12, 0);
      // Centring just outside each side of the opening so the gate stays clear.
      tower.position.set(sx * (width / 2 + towerW / 2 - 0.2), towerH / 2, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      setData(tower);
      gateGroup.add(tower);
      // Battlement posts capping each tower.
      for (const pz of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(towerW * 0.5, 0.5, towerD * 0.5), towerMat);
        cap.position.set(sx * (width / 2 + towerW / 2 - 0.2), towerH + 0.25, pz * 0.35);
        cap.castShadow = true;
        setData(cap);
        gateGroup.add(cap);
      }
      // Edge wireframe around each tower so the shape is legible at a glance.
      const towerEdgeGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(towerW, towerH, towerD));
      const towerEdgeMat = new THREE.LineBasicMaterial({
        color: isUnderConstruction ? 0x60a5fa : 0x111317,
        linewidth: 2,
      });
      const towerEdge = new THREE.LineSegments(towerEdgeGeom, towerEdgeMat);
      towerEdge.position.set(sx * (width / 2 + towerW / 2 - 0.2), towerH / 2, 0);
      this.edgeGroup.add(towerEdge);
      const prev = this.freestandingEdges.get(free.buildingId) || [];
      prev.push(towerEdge);
      this.freestandingEdges.set(free.buildingId, prev);
    }

    // A top crossbar bridging the two flanking towers marks the gate's header
    // and reads as a proper gateway silhouette (instead of a stray strip low over
    // the opening).
    const beamH = 0.5;
    const beamD = towerD + 0.3;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(beamSpan, beamH, beamD), beamMat);
    beam.position.set(0, towerH - beamH / 2, 0);
    beam.castShadow = true;
    setData(beam);
    gateGroup.add(beam);
    // An overhanging parapet lip on the front of the beam.
    const lip = new THREE.Mesh(new THREE.BoxGeometry(beamSpan, 0.3, 0.35), beamMat);
    lip.position.set(0, towerH + 0.25, (towerD + 0.3) / 2 - 0.15);
    lip.castShadow = true;
    setData(lip);
    gateGroup.add(lip);

    // Two tall door panels filling the opening BETWEEN the flanking towers, each
    // hinged at the inner face of its tower and swinging open perpendicular to
    // the fence line. Door groups rotate around their origin (the hinge). Doors
    // rise most of the way to the crossbar so the gap reads as a walled gate.
    const doorW = width / 2 - 0.12;
    const doorH = towerH - 0.4;
    const doorT = 0.28;
    const hingeX = width / 2 - 0.08;
    const doorMat = isUnderConstruction ? wallMat : faceMat(doorW, doorH);
    const leftDoor = new THREE.Group();
    const rightDoor = new THREE.Group();
    leftDoor.position.set(-hingeX, 0, 0);
    rightDoor.position.set(hingeX, 0, 0);
    for (const [side, group] of [
      [-1, leftDoor],
      [1, rightDoor],
    ] as const) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, doorT), doorMat);
      door.position.set((side * doorW) / 2, doorH / 2, 0);
      door.castShadow = true;
      setData(door);
      group.add(door);
      gateGroup.add(group);
    }

    this.registerFreestandingBuilding(free, width, length, height, centerElev, gateGroup);
    this.gateAnimations.set(free.buildingId, {
      left: leftDoor,
      right: rightDoor,
      open: 0,
      rotDeg: free.rotationDeg || 0,
      pos: { x: free.position.x, z: free.position.z },
    });
  }

  /** Adds a freestanding structure's root object + clickable building data. */
  private registerFreestandingBuilding(
    free: AdaptedBuilding,
    width: number,
    length: number,
    height: number,
    centerElev: number,
    root: THREE.Object3D
  ) {
    root.userData = {
      buildingId: free.buildingId,
      type: 'building',
      isFreestanding: true,
      baseElevation: centerElev,
      constructionStatus: free.constructionStatus,
    };
    this.group.add(root);
    // buildingMeshes is typed as Mesh (material/geometry reads elsewhere); the
    // gate root is a Group, so cast — three.js treats both as Object3D at runtime.
    this.buildingMeshes.set(free.buildingId, root as unknown as THREE.Mesh);

    // Store dummy polygon so click inspection works
    const dummyBldg: BuildingPolygon = {
      id: free.buildingId,
      type: 'residential',
      rawType: 'freestanding',
      name: free.name,
      height: height,
      levels: free.levels || 1,
      center: free.position,
      polygon: free.polygon || [
        { x: free.position.x - width / 2, z: free.position.z - length / 2 },
        { x: free.position.x + width / 2, z: free.position.z - length / 2 },
        { x: free.position.x + width / 2, z: free.position.z + length / 2 },
        { x: free.position.x - width / 2, z: free.position.z + length / 2 },
      ],
      tags: { freestanding: 'true', functionalType: free.typeId },
    };
    this.buildingData.set(free.buildingId, dummyBldg);
  }

  /** Removes a freestanding structure's 3D body, edges and bookkeeping. */
  private destroyFreestandingBody(buildingId: string | number) {
    const root = this.buildingMeshes.get(buildingId);
    if (root) {
      this.group.remove(root);
      this.buildingMeshes.delete(buildingId);
      this.buildingData.delete(buildingId);
      this.freestandingMeshes.delete(buildingId);
    }
    const edges = this.freestandingEdges.get(buildingId);
    if (edges) {
      for (const e of edges) this.edgeGroup.remove(e);
      this.freestandingEdges.delete(buildingId);
    }
    this.gateAnimations.delete(buildingId);
  }

  /**
   * 0..1 barrier damage actually SHOWN (0 = pristine, 1 = about to fall).
   * While a structure is under repair its durability has not jumped yet — the
   * repair job only snaps durability to full on completion — but crews advance
   * repairProgress the whole time. The visual damage therefore eases toward 0
   * with the job, so restored logs appear progressively instead of the whole
   * barrier snapping from battered back to pristine in one frame.
   */
  private barrierDamage(free: AdaptedBuilding): number {
    const max = free.maxDurability;
    if (!max || max <= 0) return 0;
    const cur = Math.max(0, Math.min(max, free.currentDurability));
    const underRepair = !!free.isUnderRepair && free.constructionStatus === 'completed';
    const rep = underRepair ? clamp01((free.repairProgress ?? 0) / 100) : 0;
    const eff = cur + (max - cur) * rep; // share of missing HP the crews rebuilt
    return 1 - eff / max;
  }

  /**
   * Stable key describing a barrier's CURRENT look (damage + weather).
   * Damage is quantized into ~3.5% steps so the body only rebuilds when the
   * pattern actually changes: as repair crews progress, each key step pops
   * another set of logs/posts back in rather than snapping whole tiers.
   * Under-construction sites keep the amber placeholder box ('uc').
   */
  private barrierVisualKey(free: AdaptedBuilding): string | null {
    if (!BARRIER_TYPE_IDS.has(free.typeId)) return null;
    if (free.constructionStatus !== 'completed') return 'uc';
    const q = Math.min(28, Math.max(0, Math.round(this.barrierDamage(free) * 28)));
    return `q${q}s${this.barrierSnow > 0.05 ? 1 : 0}r${this.barrierRain > 0.05 ? 1 : 0}`;
  }

  /** Records a barrier's just-rendered visual key so refresh only rebuilds on change. */
  private markBarrierRendered(free: AdaptedBuilding) {
    const key = this.barrierVisualKey(free);
    if (key !== null) this.barrierVisualSig.set(free.buildingId, key);
  }

  /**
   * Feed the current weather into barriers: rain raises puddle grime / mud
   * splashes, snow lays caps along their tops. Completed barriers whose visual
   * key changed are re-grounded and re-built immediately.
   */
  public setBarrierWeather(snow: number, rain: number) {
    const s = clamp01(snow);
    const r = clamp01(rain);
    if (Math.abs(s - this.barrierSnow) < 0.001 && Math.abs(r - this.barrierRain) < 0.001) return;
    this.barrierSnow = s;
    this.barrierRain = r;
    this.refreshBarrierVisuals(this.lastBarrierElevation, this.lastBarrierExaggeration);
  }

  /**
   * Re-builds every completed barrier whose damage tier or weather look changed
   * (bodies are re-created from live durability + weather, so battered walls
   * visibly degrade and snow/grime appears without touching undamaged ones).
   */
  private refreshBarrierVisuals(elevation?: ElevationGrid | null, exaggeration = 1.0) {
    this.lastBarrierElevation = elevation;
    this.lastBarrierExaggeration = exaggeration;
    if (this.buildingMeshes.size === 0) return; // city not rendered yet
    // Defence damage-ring markers live in the same throttled poll: durability
    // mutates in place every sim tick, so appearance/refresh/clear of the
    // overhead icon is driven from here rather than waiting on React.
    this.refreshDefenseMarkers(elevation, exaggeration);
    for (const free of this.freestandingBuildings) {
      const key = this.barrierVisualKey(free);
      if (key === null) continue;
      if (this.barrierVisualSig.get(free.buildingId) === key) continue;
      // A body that does not exist yet (e.g. weather changed before its first
      // render) will be created fresh by the next state push; nothing to do.
      if (!this.buildingMeshes.has(free.buildingId)) continue;
      this.destroyFreestandingBody(free.buildingId);
      this.renderFreestandingBody(free, elevation, exaggeration);
      this.barrierVisualSig.set(free.buildingId, key);
    }
  }

  /**
   * Per-frame gate door animation. Friendly units (squads + vehicles) trigger
   * the doors open as they approach/traverse; doors ease closed once the area
   * is clear. Hostile units never open them (they cannot path through anyway).
   */
  public update(delta: number, friendlyPositions: { x: number; z: number }[] = []) {
    if (!this.group.visible) return;
    // Barriers animate repair/damage in-place (durability and repairProgress
    // mutate on every simulation tick, but the settlement array identity often
    // stays the same), so poll their visual key at a low rate and rebuild the
    // ones that changed — logs visibly return while crews work, even without a
    // React state push.
    this.barrierCheckAccum += delta;
    if (this.barrierCheckAccum >= 0.15) {
      this.barrierCheckAccum = 0;
      this.refreshBarrierVisuals(this.lastBarrierElevation, this.lastBarrierExaggeration);
    }
    if (this.gateAnimations.size === 0) return;
    for (const anim of this.gateAnimations.values()) {
      const rad = (anim.rotDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      let shouldOpen = false;
      for (const f of friendlyPositions) {
        const dx = f.x - anim.pos.x;
        const dz = f.z - anim.pos.z;
        // World -> gate-local frame (matches getFreestandingCollisionPolygon's
        // rotation convention: width along local X, length along local Z).
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        // Open while a friendly is on/near the opening, with a small margin.
        if (Math.abs(lx) <= 7 && Math.abs(lz) <= 3.6) {
          shouldOpen = true;
          break;
        }
      }
      const target = shouldOpen ? 1 : 0;
      const rate = shouldOpen ? 2.8 : 1.3; // swing open faster than it closes
      anim.open += (target - anim.open) * Math.min(1, delta * rate);
      if (anim.open < 0.002) anim.open = 0;
      const ang = BuildingRenderer.GATE_OPEN_ANGLE * anim.open;
      anim.left.rotation.y = ang;
      anim.right.rotation.y = -ang;
    }
  }

  /** Body + roof marker in one call, used during the initial full map build. */
  private renderFreestandingBuilding(
    free: AdaptedBuilding,
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    try {
      this.renderFreestandingBody(free, elevation, exaggeration);
      const isUnderConstruction =
        free.constructionStatus === 'in_progress' ||
        free.constructionStatus === 'planned' ||
        (free.constructionStatus as string) === 'paused';
      const marker = this.freestandingMarkerState(free);
      const id = String(free.buildingId);
      // Damage-ring markers are poll-owned; anything else stays owned by the
      // overlay rebuild, so record the poll signature accordingly.
      this.defenseMarkerSig.set(id, marker.damagePct == null ? '' : this.defenseDamageBucket(free));
      if (marker.show) {
        const centerElev = sampleElevation(elevation, free.position.x, free.position.z, exaggeration);
        const roofY = centerElev + (free.height || 4.5) + 3.0;
        this.createAdaptedMarker(
          free.position.x,
          roofY,
          free.position.z,
          free.category,
          isUnderConstruction,
          marker.damagePct,
          id
        );
      }
      this.markBarrierRendered(free);
    } catch (e) {
      console.warn('Failed rendering freestanding building:', e);
    }
  }

  private static buildingIconTextures = new Map<string, THREE.CanvasTexture>();

  private getBuildingIconTexture(category: FunctionalCategory | 'hq' | 'construction', label?: string, damagePct?: number | null): THREE.CanvasTexture {
    // Damage icons are cached per 5% durability bucket so a damaged wall's ring
    // meter doesn't mint a new texture for every point of HP lost.
    const dmgKey =
      damagePct == null ? '' : `_hp${Math.max(0, Math.min(20, Math.floor(damagePct * 20)))}`;
    const key = `${category}_${label || ''}${dmgKey}`;
    let tex = BuildingRenderer.buildingIconTextures.get(key);
    if (tex) return tex;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.clearRect(0, 0, 128, 128);

    const cx = 64;
    const cy = 54;
    const radius = 38;

    // Theme definitions by category
    const themes: Record<string, { bg: string; border: string; accent: string; glow: string; icon: string; name: string }> = {
      hq: {
        bg: '#1e1b4b',
        border: '#fbbf24',
        accent: '#fde047',
        glow: 'rgba(251, 191, 36, 0.4)',
        icon: '★',
        name: 'HQ',
      },
      command_center: {
        bg: '#1e1b4b',
        border: '#fbbf24',
        accent: '#fde047',
        glow: 'rgba(251, 191, 36, 0.4)',
        icon: '★',
        name: 'COMMAND',
      },
      food: {
        bg: '#052e16',
        border: '#22c55e',
        accent: '#86efac',
        glow: 'rgba(34, 197, 94, 0.4)',
        icon: '🌾',
        name: 'FOOD',
      },
      production: {
        bg: '#431407',
        border: '#f97316',
        accent: '#fdba74',
        glow: 'rgba(249, 115, 22, 0.4)',
        icon: '⚙',
        name: 'WORKSHOP',
      },
      defense: {
        bg: '#450a0a',
        border: '#ef4444',
        accent: '#fca5a5',
        glow: 'rgba(239, 68, 68, 0.4)',
        icon: '🛡',
        name: 'DEFENSE',
      },
      defense_walls: {
        bg: '#3f1515',
        border: '#dc2626',
        accent: '#f87171',
        glow: 'rgba(220, 38, 38, 0.4)',
        icon: '🧱',
        name: 'GATE/WALL',
      },
      civilian: {
        bg: '#082f49',
        border: '#38bdf8',
        accent: '#bae6fd',
        glow: 'rgba(56, 189, 248, 0.4)',
        icon: '🏠',
        name: 'HOUSING',
      },
      utility: {
        bg: '#3b0764',
        border: '#a855f7',
        accent: '#d8b4fe',
        glow: 'rgba(168, 85, 247, 0.4)',
        icon: '⚡',
        name: 'UTILITY',
      },
      medical: {
        bg: '#4c0519',
        border: '#f43f5e',
        accent: '#fda4af',
        glow: 'rgba(244, 63, 94, 0.4)',
        icon: '✚',
        name: 'MEDBAY',
      },
      storage: {
        bg: '#362103',
        border: '#eab308',
        accent: '#fef08a',
        glow: 'rgba(234, 179, 8, 0.4)',
        icon: '📦',
        name: 'STORAGE',
      },
      construction: {
        bg: '#291804',
        border: '#f59e0b',
        accent: '#fcd34d',
        glow: 'rgba(245, 158, 11, 0.4)',
        icon: '🚧',
        name: 'BUILDING',
      },
    };

    const t = themes[category] || themes.civilian;

    // Glowing anchor disk
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = t.glow;
    ctx.fill();

    // Main hexagon / circle badge body
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = t.border;
    ctx.stroke();

    // Inner subtle border ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 6, 0, Math.PI * 2);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.stroke();

    // Draw Icon
    ctx.fillStyle = t.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (t.icon === '★') {
      ctx.font = 'bold 36px "Segoe UI Symbol", sans-serif';
      ctx.fillText('★', cx, cy);
    } else if (t.icon === '✚') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(cx - 5, cy - 16, 10, 32);
      ctx.fillRect(cx - 16, cy - 5, 32, 10);
    } else if (t.icon === '⚡') {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy - 18);
      ctx.lineTo(cx - 12, cy + 2);
      ctx.lineTo(cx - 1, cy + 2);
      ctx.lineTo(cx - 4, cy + 18);
      ctx.lineTo(cx + 12, cy - 2);
      ctx.lineTo(cx + 1, cy - 2);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.font = 'bold 28px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.fillText(t.icon, cx, cy);
    }

    // Pointer pin at bottom
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + radius - 2);
    ctx.lineTo(cx, cy + radius + 14);
    ctx.lineTo(cx + 9, cy + radius - 2);
    ctx.closePath();
    ctx.fillStyle = t.border;
    ctx.fill();

    // Type name banner at bottom
    const bName = (label || t.name).toUpperCase();
    const tagW = Math.max(56, bName.length * 8 + 12);
    const tagH = 18;
    const tagX = cx - tagW / 2;
    const tagY = 104;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, tagW, tagH, 4);
    ctx.fill();
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = t.accent;
    ctx.font = '900 9px "Courier New", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bName, cx, tagY + tagH / 2);

    // Radial durability meter for damaged player-built defence structures: a
    // ring around the badge whose lit arc equals the fraction of durability
    // left (green > 66%, amber > 33%, red below). The ring keeps a gap around
    // the bottom pointer pin so the meter never collides with it.
    if (damagePct != null) {
      const R = 44; // ring radius (badge body is 38, glow disk 42)
      const gapDeg = 35; // half-gap carved out around the bottom pointer
      const sweepDeg = 360 - gapDeg * 2; // 290° of available ring
      const a0 = ((90 + gapDeg) * Math.PI) / 180; // start just past the pointer
      const track = (sweepDeg * Math.PI) / 180;

      // Dark track
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a0 + track);
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
      ctx.lineWidth = 5;
      ctx.stroke();

      // Lit arc = remaining durability
      const pct = Math.max(0, Math.min(1, damagePct));
      const arc = track * pct;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a0 + arc);
      ctx.strokeStyle = pct > 0.66 ? '#22c55e' : pct > 0.33 ? '#fbbf24' : '#ef4444';
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    BuildingRenderer.buildingIconTextures.set(key, tex);
    return tex;
  }

  private createHQBeacon(x: number, y: number, z: number) {
    // Golden Beacon Beam
    const pillarGeom = new THREE.CylinderGeometry(0.3, 0.8, 12, 8);
    pillarGeom.translate(0, 6, 0);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.45,
    });
    const pillar = new THREE.Mesh(pillarGeom, pillarMat);
    pillar.position.set(x, y, z);
    this.overlayGroup.add(pillar);

    // Floating HQ Badge
    const tex = this.getBuildingIconTexture('hq', 'HQ COMMAND');
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6.5, 6.5, 1);
    sprite.position.set(x, y + 13, z);
    sprite.renderOrder = 995;
    this.overlayGroup.add(sprite);
  }

  private createAdaptedMarker(
    x: number,
    y: number,
    z: number,
    category: FunctionalCategory,
    isInProgress = false,
    damagePct: number | null = null,
    recordKey?: string | number | null
  ) {
    const tex = this.getBuildingIconTexture(
      isInProgress ? 'construction' : category,
      undefined,
      damagePct
    );
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(5.5, 5.5, 1);
    sprite.position.set(x, y + 4.5, z);
    sprite.renderOrder = 994;
    this.overlayGroup.add(sprite);

    // Subtle leader line connecting badge to roof center
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x, y + 2.5, z),
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: isInProgress ? 0xf59e0b : 0x22c55e,
      transparent: true,
      opacity: 0.6,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    this.overlayGroup.add(line);

    // Damage-ring markers are owned by the throttled poll so they can appear
    // and refresh as durability drops in place — record this one so the poll
    // can find and replace it instead of stacking duplicates.
    if (damagePct != null && recordKey != null) {
      this.removeDefenseMarker(recordKey);
      this.defenseMarkerObjs.set(String(recordKey), { sprite, line });
    }
    return { sprite, line };
  }

  /** Detach + dispose a damage-ring marker previously recorded for a structure. */
  private removeDefenseMarker(id: string | number) {
    const rec = this.defenseMarkerObjs.get(String(id));
    if (!rec) return;
    this.defenseMarkerObjs.delete(String(id));
    for (const o of [rec.sprite, rec.line]) {
      if (o.parent === this.overlayGroup) this.overlayGroup.remove(o);
    }
    if (rec.line.geometry) rec.line.geometry.dispose();
  }

  /**
   * Overhead-icon policy for player-built defence structures (walls, towers,
   * gates). Under construction they keep the amber badge; once completed they
   * are icon-free — a wall silently guarding the perimeter needs no floating
   * label — but the first point of damage brings the icon back with a radial
   * durability ring so the player can spot what needs repair at a glance.
   */
  private freestandingMarkerState(free: AdaptedBuilding): { show: boolean; damagePct: number | null } {
    const uc =
      free.constructionStatus === 'in_progress' ||
      free.constructionStatus === 'planned' ||
      (free.constructionStatus as string) === 'paused';
    if (uc) return { show: true, damagePct: null };
    const isDefense = free.category === 'defense_walls' || free.category === 'defense_towers';
    if (!isDefense) return { show: true, damagePct: null };
    const max = free.maxDurability;
    if (!max || max <= 0) return { show: false, damagePct: null };
    const cur = Math.max(0, Math.min(max, free.currentDurability));
    // Blend with repair progress so the meter visibly refills while crews work
    // (durability itself only snaps to full when the job completes).
    const blend =
      typeof free.repairProgress === 'number' ? Math.max(0, Math.min(1, free.repairProgress)) : 0;
    const pct = (cur + (max - cur) * blend) / max;
    if (pct >= 1 - 1e-6) return { show: false, damagePct: null };
    return { show: true, damagePct: pct };
  }

  /**
   * Damage-ring bucket a structure currently wants ('' = none). Bucketed to
   * 5% steps so the throttled poll only rebuilds a marker when the ring
   * actually needs to change.
   */
  private defenseDamageBucket(free: AdaptedBuilding): string {
    const st = this.freestandingMarkerState(free);
    if (!st.show || st.damagePct === null) return '';
    return `dmg:${Math.max(0, Math.floor(st.damagePct * 20))}`;
  }

  /**
   * Throttled poll (runs inside the barrier check every ~0.15s): adds, refreshes
   * and removes defence damage-ring markers as durability/repairProgress mutate
   * in place, so a battered wall's icon appears the moment it is hit and clears
   * once crews finish repairing it — with no React state push required.
   */
  private refreshDefenseMarkers(elevation?: ElevationGrid | null, exaggeration = 1.0) {
    const seen = new Set<string>();
    for (const free of this.freestandingBuildings) {
      const id = String(free.buildingId);
      seen.add(id);
      const bucket = this.defenseDamageBucket(free);
      if (this.defenseMarkerSig.get(id) === bucket) continue;
      this.removeDefenseMarker(id);
      this.defenseMarkerSig.set(id, bucket);
      if (bucket === '') continue;
      const centerElev = sampleElevation(elevation, free.position.x, free.position.z, exaggeration);
      const roofY = centerElev + (free.height || 6) + 3.0;
      // Mid-bucket pct keeps the cached texture deterministic.
      const pct = (Number(bucket.slice(4)) + 0.5) / 20;
      this.createAdaptedMarker(free.position.x, roofY, free.position.z, free.category, false, pct, id);
    }
    // Prune markers whose structure is gone (demolished / removed).
    for (const key of Array.from(this.defenseMarkerObjs.keys())) {
      if (!seen.has(key)) this.removeDefenseMarker(key);
    }
    for (const key of Array.from(this.defenseMarkerSig.keys())) {
      if (!seen.has(key)) this.defenseMarkerSig.delete(key);
    }
  }

  /**
   * Fast targeted state updates (HQ selection, adaptation, demolition) without rebuilding full 3D geometry
   */
  public updateAdaptedStates(
    hqBuildingId: string | number | null,
    adaptedBuildings: Map<string | number, AdaptedBuilding> = new Map(),
    freestandingBuildings: AdaptedBuilding[] = [],
    demolishedBuildingIds: Map<string | number, true> = new Map(),
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    const oldHqId = this.currentHqId;
    this.currentHqId = hqBuildingId;
    this.adaptedMap = adaptedBuildings;
    this.freestandingBuildings = freestandingBuildings;
    this.updateAdaptedRegions(adaptedBuildings);

    // 1. Reset material for previous HQ if changed
    if (oldHqId !== null && String(oldHqId) !== String(hqBuildingId)) {
      const oldMesh = this.buildingMeshes.get(oldHqId);
      const oldBldg = this.buildingData.get(oldHqId);
      if (oldMesh && oldBldg) {
        const oldAdapted = getPrimaryAdaptedEntry(adaptedBuildings, oldHqId);
        oldMesh.material = this.getBuildingMaterials(
          oldBldg.type,
          oldBldg.isOccupied,
          oldAdapted?.category,
          false,
          oldAdapted?.constructionStatus,
          buildingVariantForId(oldBldg.id),
          this.isBuildingPowered(oldBldg),
          oldAdapted?.adaptationPercentage ?? 100,
          (oldMesh.userData?.flatRoofKey as string | null) ?? null
        );
      }
    }

    // 2. Set material for new HQ
    if (hqBuildingId !== null) {
      const newMesh = this.buildingMeshes.get(hqBuildingId);
      const newBldg = this.buildingData.get(hqBuildingId);
      if (newMesh && newBldg) {
        const newAdapted = getPrimaryAdaptedEntry(adaptedBuildings, hqBuildingId);
        newMesh.material = this.getBuildingMaterials(
          newBldg.type,
          newBldg.isOccupied,
          newAdapted?.category,
          true,
          newAdapted?.constructionStatus,
          buildingVariantForId(newBldg.id),
          this.isBuildingPowered(newBldg),
          newAdapted?.adaptationPercentage ?? 100,
          (newMesh.userData?.flatRoofKey as string | null) ?? null
        );
      }
    }

    // 3. Update adapted building materials (sections resolve through the source
    // building's primary entry so split buildings still tint correctly).
    const seen = new Set<string>();
    for (const adapted of adaptedBuildings.values()) {
      const sourceId = String(adapted.sourceBuildingId ?? adapted.buildingId);
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);
      if (hqBuildingId !== null && String(sourceId) === String(hqBuildingId)) continue;
      const mesh = this.buildingMeshes.get(sourceId);
      const bldg = this.buildingData.get(sourceId);
      if (mesh && bldg) {
        mesh.material = this.getBuildingMaterials(
          bldg.type,
          bldg.isOccupied,
          adapted.category,
          false,
          adapted.constructionStatus,
          buildingVariantForId(bldg.id),
          this.isBuildingPowered(bldg),
          adapted.adaptationPercentage ?? 100,
          (mesh.userData?.flatRoofKey as string | null) ?? null
        );
      }
    }

    // 4. Update demolished buildings visibility
    for (const [demolishedId] of demolishedBuildingIds) {
      const mesh = this.buildingMeshes.get(demolishedId);
      if (mesh) {
        mesh.visible = false;
      }
      this.gateAnimations.delete(demolishedId);
    }

    // 5. Rebuild only overlays (HQ beacon & badges)
    while (this.overlayGroup.children.length > 0) {
      const c = this.overlayGroup.children[0] as THREE.Mesh;
      if (c.geometry) c.geometry.dispose();
      this.overlayGroup.remove(c);
    }

    // HQ beacon overlay
    if (hqBuildingId !== null) {
      const bldg = this.buildingData.get(hqBuildingId);
      if (bldg) {
        const centerElev = sampleElevation(elevation, bldg.center.x, bldg.center.z, exaggeration);
        const topY = centerElev + (bldg.height || 12);
        this.createHQBeacon(bldg.center.x, topY, bldg.center.z);
      }
    }

    // Adapted building badges
    for (const [bldgId, adapted] of adaptedBuildings) {
      if (hqBuildingId !== null && String(bldgId) === String(hqBuildingId)) continue;
      const bldg = this.buildingData.get(bldgId);
      if (bldg) {
        const isUnderConstruction =
          adapted.constructionStatus === 'in_progress' ||
          adapted.constructionStatus === 'planned' ||
          (adapted.constructionStatus as string) === 'paused';
        const centerElev = sampleElevation(elevation, bldg.center.x, bldg.center.z, exaggeration);
        const topY = centerElev + (bldg.height || 10);
        this.createAdaptedMarker(
          bldg.center.x,
          topY,
          bldg.center.z,
          adapted.category,
          isUnderConstruction
        );
      }
    }

    // Recolor the detailed-mode edge silhouettes so a just-completed adaptation
    // loses its amber outline immediately (HQ green, completed adaptation green,
    // under-construction amber). LOD-swapped lines have been detached from the
    // edge group — skip them rather than styling stale objects.
    for (const [edgeId, line] of this.buildingEdgeObjs) {
      if (line.parent !== this.edgeGroup) continue;
      const isHq = hqBuildingId !== null && String(edgeId) === String(hqBuildingId);
      const adapted = getPrimaryAdaptedEntry(adaptedBuildings, edgeId);
      if (isHq) {
        line.material = this.getEdgeMaterial('hq');
      } else if (adapted) {
        const st = adapted.constructionStatus;
        line.material = this.getEdgeMaterial(
          st === 'in_progress' || st === 'planned' || (st as string) === 'paused'
            ? 'adapting'
            : 'adapted'
        );
      }
    }

    // Freestanding buildings: a structure placed after the initial full build has
    // no box body yet (only the full map render created meshes). Create the 3D
    // body — with its roof marker — on first sight so newly built towers, gates
    // and walls actually become visible; just refresh markers for existing ones.
    for (const free of freestandingBuildings) {
      const isUnderConstruction =
        free.constructionStatus === 'in_progress' ||
        free.constructionStatus === 'planned' ||
        (free.constructionStatus as string) === 'paused';
      if (!this.buildingMeshes.has(free.buildingId)) {
        this.renderFreestandingBuilding(free, elevation, exaggeration);
        continue;
      }
      // Rebuild the 3D body when its construction status changes (e.g. the
      // amber "under construction" gate flips to completed). The body carries
      // its status in userData so we only re-create it on an actual transition.
      const existingStatus = (this.buildingMeshes.get(free.buildingId) as any)?.userData?.constructionStatus;
      if (existingStatus !== free.constructionStatus) {
        this.destroyFreestandingBody(free.buildingId);
        this.renderFreestandingBuilding(free, elevation, exaggeration);
        continue;
      }
      const marker = this.freestandingMarkerState(free);
      const id = String(free.buildingId);
      this.defenseMarkerSig.set(id, marker.damagePct == null ? '' : this.defenseDamageBucket(free));
      if (marker.show) {
        const centerElev = sampleElevation(elevation, free.position.x, free.position.z, exaggeration);
        const topY = centerElev + (free.height || 6);
        this.createAdaptedMarker(
          free.position.x,
          topY,
          free.position.z,
          free.category,
          isUnderConstruction,
          marker.damagePct,
          id
        );
      }
    }

    // Keep the zoomed-out merged LOD in sync with HQ / adapted / demolished /
    // freestanding changes (cheap signature check; rebuild only when it changed).
    this.refreshLodIfNeeded(hqBuildingId, adaptedBuildings, freestandingBuildings, demolishedBuildingIds);

    // Barriers: re-build any whose damage tier or weather look changed since
    // the last render (durability loss from combat, rain/snow from the sky).
    this.refreshBarrierVisuals(elevation, exaggeration);
  }

  public setHovered(buildingId: string | number | null) {
    if (this.hoveredBuildingId === buildingId) return;

    // Reset previous
    if (this.hoveredBuildingId && this.hoveredBuildingId !== this.selectedBuildingId) {
      const prevMesh = this.buildingMeshes.get(this.hoveredBuildingId);
      const bldg = this.buildingData.get(this.hoveredBuildingId);
      if (prevMesh && bldg) {
        const isHQ = this.currentHqId !== null && String(bldg.id) === String(this.currentHqId);
        const adapted = this.adaptedMap.get(bldg.id);
        prevMesh.material = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg), adapted?.adaptationPercentage ?? 100, (prevMesh.userData?.flatRoofKey as string | null) ?? null);
      }
    }

    this.hoveredBuildingId = buildingId;

    // Apply hover highlight — warm tint multiplied over the facade texture
    if (buildingId && buildingId !== this.selectedBuildingId) {
      const mesh = this.buildingMeshes.get(buildingId);
      const bldg = this.buildingData.get(buildingId);
      if (mesh && bldg) {
        const isHQ = this.currentHqId !== null && String(bldg.id) === String(this.currentHqId);
        const adapted = this.adaptedMap.get(bldg.id);
        const base = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg), adapted?.adaptationPercentage ?? 100, (mesh.userData?.flatRoofKey as string | null) ?? null);
        mesh.material = this.cloneWithTint(base, 0xffeec9, 0xffeec9);
      }
    }
  }

  public setSelected(buildingId: string | number | null) {
    if (this.selectedBuildingId === buildingId) return;

    // Reset previous selected
    if (this.selectedBuildingId) {
      const prevMesh = this.buildingMeshes.get(this.selectedBuildingId);
      const bldg = this.buildingData.get(this.selectedBuildingId);
      if (prevMesh && bldg) {
        const isHQ = this.currentHqId !== null && String(bldg.id) === String(this.currentHqId);
        const adapted = this.adaptedMap.get(bldg.id);
        prevMesh.material = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg), adapted?.adaptationPercentage ?? 100, (prevMesh.userData?.flatRoofKey as string | null) ?? null);
      }
    }

    this.selectedBuildingId = buildingId;

    // Apply selected highlight — gold tint multiplied over the facade texture
    if (buildingId) {
      const mesh = this.buildingMeshes.get(buildingId);
      const bldg = this.buildingData.get(buildingId);
      if (mesh && bldg) {
        const isHQ = this.currentHqId !== null && String(bldg.id) === String(this.currentHqId);
        const adapted = this.adaptedMap.get(bldg.id);
        const base = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg), adapted?.adaptationPercentage ?? 100, (mesh.userData?.flatRoofKey as string | null) ?? null);
        mesh.material = this.cloneWithTint(base, 0xffd27a, 0xffd27a);
      }
    }
  }

  public setDemolishCandidates(buildingIds: Set<string | number> | null) {
    // Reset previous demolish candidates
    if (this.demolishCandidateIds.size > 0) {
      for (const id of this.demolishCandidateIds) {
        if (id === this.selectedBuildingId || id === this.hoveredBuildingId) continue;
        const mesh = this.buildingMeshes.get(id);
        const bldg = this.buildingData.get(id);
        if (mesh && bldg) {
          const isHQ = this.currentHqId !== null && String(bldg.id) === String(this.currentHqId);
          const adapted = this.adaptedMap.get(bldg.id);
          mesh.material = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg), adapted?.adaptationPercentage ?? 100, (mesh.userData?.flatRoofKey as string | null) ?? null);
        }
      }
      this.demolishCandidateIds.clear();
    }

    if (!buildingIds || buildingIds.size === 0) return;

    for (const id of buildingIds) {
      this.demolishCandidateIds.add(id);
      const mesh = this.buildingMeshes.get(id);
      const bldg = this.buildingData.get(id);
      if (mesh && bldg) {
        const isHQ = this.currentHqId !== null && String(bldg.id) === String(this.currentHqId);
        const adapted = this.adaptedMap.get(bldg.id);
        const base = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg), adapted?.adaptationPercentage ?? 100, (mesh.userData?.flatRoofKey as string | null) ?? null);
        mesh.material = this.cloneWithTint(base, 0xff9d92, 0xff9d92);
      }
    }
  }

  public getBuildingById(id: string | number): BuildingPolygon | undefined {
    return this.buildingData.get(id);
  }

  /**
   * Roof-top world Y for a built OSM building — the plane the §7.1 adapted-
   * region overlays (and the live drag-paint preview) float on. Same formula
   * as updateAdaptedRegions so committed regions and the in-progress paint
   * share one visual layer.
   */
  public getBuildingRoofY(id: string | number): number | null {
    const mesh = this.buildingMeshes.get(id);
    const bldg = this.buildingData.get(id);
    if (!mesh || !bldg) return null;
    return mesh.position.y + (bldg.height || 6) + 0.35;
  }

  /**
   * Drives the window-glow emissive on textured facades from the day/night
   * cycle. factor 0 = full daylight (no glow), 1 = deep night (windows lit).
   * Only materials carrying an emissiveMap (procedural facades) are touched.
   */
  public setNightGlow(factor: number) {
    if (Math.abs(factor - this.nightGlowFactor) < 0.005) return;
    this.nightGlowFactor = factor;
    for (const mats of this.materialsCache.values()) {
      for (const m of mats) {
        // Roof materials may be MeshStandardMaterial (flat roofs); only the
        // facades carry an emissive window map.
        const mm = m as THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
        if (mm.emissiveMap) {
          // Only powered colony buildings light their windows; abandoned
          // buildings stay dark at any hour.
          mm.emissiveIntensity = (mm.userData?.powered ? factor : 0) * 0.95;
        }
      }
    }
  }

  public setEdgesVisible(visible: boolean) {
    this.edgeGroup.visible = visible;
  }

  public setVisible(visible: boolean) {
    if (!visible) {
      this.group.visible = false;
      this.lodGroup.visible = false;
      return;
    }
    this.setLodMode(this.lodMode);
  }

  public clear() {
    this.hoveredBuildingId = null;
    this.selectedBuildingId = null;
    this.demolishCandidateIds.clear();
    this.buildingMeshes.clear();
    this.buildingData.clear();
    this.freestandingMeshes.clear();
    this.freestandingEdges.clear();
    this.gateAnimations.clear();
    this.barrierVisualSig.clear();

    // Clear LOD sources + merged LOD meshes
    this.lodSources = [];
    this.lodCellSignatures.clear();
    this.lodCellMeshes.clear();
    this.lodBuilt = false;
    while (this.lodGroup.children.length > 0) {
      const c = this.lodGroup.children[0] as THREE.Mesh;
      if (c.geometry) c.geometry.dispose();
      this.lodGroup.remove(c);
    }

    // Clear edge lines
    while (this.edgeGroup.children.length > 0) {
      const c = this.edgeGroup.children[0] as THREE.LineSegments;
      if (c.geometry) c.geometry.dispose();
      this.edgeGroup.remove(c);
    }
    this.buildingEdgeObjs.clear();

    // Clear overlays (HQ beacons, adapted markers)
    while (this.overlayGroup.children.length > 0) {
      const c = this.overlayGroup.children[0] as THREE.Mesh;
      if (c.geometry) c.geometry.dispose();
      this.overlayGroup.remove(c);
    }

    // Clear building meshes
    const meshesToRemove: THREE.Object3D[] = [];
    this.group.children.forEach((c) => {
      if (c !== this.edgeGroup && c !== this.overlayGroup) meshesToRemove.push(c);
    });
    meshesToRemove.forEach((c) => {
      if (c instanceof THREE.Mesh && c.geometry) c.geometry.dispose();
      this.group.remove(c);
    });
  }

  public dispose() {
    this.clear();
    this.sharedEdgeMaterial.dispose();
    this.materialsCache.forEach((mats) => {
      mats.forEach((m) => m.dispose());
    });
    this.materialsCache.clear();
  }
}
