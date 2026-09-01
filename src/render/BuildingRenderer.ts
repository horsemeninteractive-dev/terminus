import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleElevation } from '../services/elevationService';
import { getFreestandingDimensions } from '../services/freestandingFootprint';
import { BuildingCategory, BuildingPolygon, ElevationGrid } from '../types/map';
import { AdaptedBuilding, FunctionalCategory } from '../types/settlement';
import { getBuildingTextureSet, getFreestandingMaterialTexture, buildingVariantForId } from './buildingTextures';

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

/** True when every interior angle of the ring is (near-)convex. */
function isConvexPolygon(pts: { x: number; z: number }[]): boolean {
  const n = pts.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const c = pts[(i + 2) % n];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) continue; // collinear
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
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
 * Builds an indexed hip roof over a convex footprint. Every wall edge gets a
 * sloped face rising to a ridge that runs along the footprint's dominant axis
 * (PCA), so the roof is one continuous non-self-intersecting surface for convex
 * polygons. Geometry is in local metres (y measured above the building base,
 * matching the ExtrudeGeometry); callers translate by baseY. Also returns the
 * ridge + hip lines used for the crisp illustrated silhouette.
 */
function buildPitchedRoof(
  pts: { x: number; z: number }[],
  wallTopLocalY: number,
  height: number
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

  // ~35° pitch, clamped to a believable band (small sheds stay low-key).
  const ridgeH = Math.min(5.5, Math.max(1.4, maxD * 0.7));
  // Lift the roof clear of the flat cap underneath to avoid z-fighting.
  const y0 = wallTopLocalY + 0.06;
  const hAt = (d: number) => y0 + ridgeH * (1 - Math.abs(d) / maxD);

  // Emit NON-indexed triangles: this three version's ExtrudeGeometry caps are
  // non-indexed, and mergeGeometries rejects mixed index/non-index inputs, so
  // the pitched roof must match the caps it merges with in the LOD build.
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const dp = (p.x - cx) * nx + (p.z - cz) * nz;
    const dq = (q.x - cx) * nx + (q.z - cz) * nz;
    const tp = (p.x - cx) * ax + (p.z - cz) * az;
    const tq = (q.x - cx) * ax + (q.z - cz) * az;
    const yp = hAt(dp), yq = hAt(dq);
    positions.push(p.x, y0, p.z,  q.x, y0, q.z,  q.x, yq, q.z);
    uvs.push(tp / 8, Math.abs(dp) / 8,  tq / 8, Math.abs(dq) / 8,  tq / 8, Math.abs(dq) / 8);
    positions.push(p.x, y0, p.z,  q.x, yq, q.z,  p.x, yp, p.z);
    uvs.push(tp / 8, Math.abs(dp) / 8,  tq / 8, Math.abs(dq) / 8,  tp / 8, Math.abs(dp) / 8);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();

  // Ridge + hip lines (non-indexed line segments).
  const ridgeTopY = y0 + ridgeH;
  const linePts: number[] = [
    cx + ax * tMin, ridgeTopY, cz + az * tMin,
    cx + ax * tMax, ridgeTopY, cz + az * tMax,
  ];
  for (const p of pts) {
    const d = (p.x - cx) * nx + (p.z - cz) * nz;
    linePts.push(p.x, y0, p.z,  p.x, hAt(d), p.z);
  }
  const ridgeGeom = new THREE.BufferGeometry();
  ridgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
  return { geom, ridgeGeom };
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
    uv.setXY(vi, t / 8, Math.abs(d) / 8);
  }
  uv.needsUpdate = true;
}

export class BuildingRenderer {
  public group = new THREE.Group();
  public edgeGroup = new THREE.Group();
  public overlayGroup = new THREE.Group();

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
    roofGeom?: THREE.BufferGeometry; // pitched roof surface (local coords, indexed)
    cellKey: string;
    buildingId: string | number;
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
  private materialsCache = new Map<string, THREE.MeshLambertMaterial[]>();
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
      if (a.typeId === 'generator_station' && a.constructionStatus === 'completed') {
        out.push(a.position);
      }
    }
    for (const f of this.freestandingBuildings) {
      if (f.typeId === 'generator_station' && f.constructionStatus === 'completed') {
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
  private cloneWithTint(base: THREE.MeshLambertMaterial[], wallTint: number, roofTint: number): THREE.MeshLambertMaterial[] {
    const wall = base[1].clone();
    wall.color.setHex(wallTint);
    const roof = base[0].clone();
    roof.color.setHex(roofTint);
    return [roof, wall];
  }


  constructor() {
    this.group.name = 'BuildingsGroup';
    this.edgeGroup.name = 'BuildingEdgesGroup';
    this.overlayGroup.name = 'BuildingOverlayGroup';
    this.group.add(this.edgeGroup);
    this.group.add(this.overlayGroup);
  }

  private getBuildingMaterials(
    type: BuildingCategory,
    isOccupied = false,
    adaptedCategory?: FunctionalCategory,
    isHQ = false,
    constructionStatus?: 'planned' | 'in_progress' | 'completed' | 'paused' | 'deconstructing',
    variant = 0,
    powered = false
  ): THREE.MeshLambertMaterial[] {
    const key = `${type}_${isOccupied}_${adaptedCategory || 'none'}_${isHQ}_${constructionStatus || 'none'}_v${variant}_p${powered ? 1 : 0}`;
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
    const roofTint = 0xffffff;

    // Powered operational buildings light their windows at night; everything
    // else stays dark even when the emissive map is present.
    const glowIntensity = (powered ? this.nightGlowFactor : 0) * 0.95;
    const wallMat = new THREE.MeshLambertMaterial({
      map: tex.wall,
      color: wallTint,
      emissive: 0x000000,
      emissiveMap: tex.glow,
      emissiveIntensity: glowIntensity,
    });
    wallMat.userData.powered = powered;
    const roofMat = new THREE.MeshLambertMaterial({
      map: tex.roof,
      color: roofTint,
    });
    roofMat.userData.powered = powered;

    // ExtrudeGeometry group 0 = caps (roof), group 1 = side walls.
    const mats = [roofMat, wallMat];
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
    const adapted = this.adaptedMap.get(bldg.id);
    const mats = this.getBuildingMaterials(
      bldg.type,
      bldg.isOccupied,
      adapted?.category,
      isHQ,
      adapted?.constructionStatus,
      buildingVariantForId(bldg.id),
      this.isBuildingPowered(bldg)
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
      for (const src of group) {
        const g0 = src.geom.groups[0];
        const g1 = src.geom.groups[1];
        if (g0) caps.push(extractGroupGeometry(src.geom, g0.start, g0.count).translate(0, src.baseY, 0));
        if (g1) sides.push(extractGroupGeometry(src.geom, g1.start, g1.count).translate(0, src.baseY, 0));
        // Pitched roofs ride in the caps merge (same shared roof material).
        if (src.roofGeom) caps.push(src.roofGeom.clone().translate(0, src.baseY, 0));
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
        // Roof cap UVs follow the footprint's dominant axis so the roof texture
        // runs parallel to the walls instead of at arbitrary world angles.
        remapRoofUvs(geom, pts);

        const isHQ = hqBuildingId !== null && String(bldg.id) === String(hqBuildingId);
        const adapted = adaptedBuildings.get(bldg.id);
        const isOccupiedOrInUse = Boolean(
          bldg.isOccupied ||
          isHQ ||
          (adapted && ((adapted.assignedWorkers || 0) > 0 || Boolean(adapted.assignedHeadId)))
        );
        const materials = this.getBuildingMaterials(
          bldg.type,
          isOccupiedOrInUse,
          adapted?.category,
          isHQ,
          adapted?.constructionStatus,
          buildingVariantForId(bldg.id),
          this.isBuildingPowered(bldg)
        );

        const mesh = new THREE.Mesh(geom, materials);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Position mesh base at lowest terrain vertex minus 4.0m skirt
        const baseY = minTerrainY - 4.0;
        mesh.position.y = baseY;
        mesh.userData = { buildingId: bldg.id, type: 'building', baseElevation: avgTerrainY, isHQ, isAdapted: !!adapted };

        this.group.add(mesh);
        this.buildingMeshes.set(bldg.id, mesh);
        this.buildingData.set(bldg.id, bldg);

        // Pitched hip roof for small, convex footprints — tall blocks, big
        // halls and complex shapes keep flat roofs (realistic and cheaper).
        const footprintArea = polygonArea(pts);
        const roofLocal =
          (bldg.height || 4) < 16 &&
          pts.length <= 40 &&
          footprintArea >= 25 &&
          footprintArea <= 4000 &&
          isConvexPolygon(pts)
            ? buildPitchedRoof(pts, totalExtrudeHeight, bldg.height || 4)
            : null;
        if (roofLocal) {
          const roofMesh = new THREE.Mesh(roofLocal.geom, materials[0]);
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
      }

      // Procedural surface texture for walls / towers / gates so they read as
      // materials (wood planks, brick, corrugated metal) rather than flat boxes.
      // repeat is in 0..1 box-UV space — tile every ~2m so 10m walls show 5 tiles.
      let matKind: 'wood' | 'brick' | 'metal' | 'concrete' | null = null;
      if (!isUnderConstruction && !isField) {
        if (typeId === 'wooden_palisade' || typeId === 'wooden_gate' || typeId === 'wooden_tower') matKind = 'wood';
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
        // The BoxGeometry UVs are 0..1 per face; scale by the real dimensions so
        // the surface tiles every ~2m on the visible sides and roof.
        const tex = getFreestandingMaterialTexture(matKind);
        tex.repeat.set(Math.max(1, width / 2), Math.max(1, height / 2));
        wallMatOpts.map = tex;
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

      // Add edge wireframe
      const edgeGeom = new THREE.EdgesGeometry(boxGeom);
      const edgeMat = new THREE.LineBasicMaterial({
        color: isUnderConstruction ? 0x60a5fa : beaconColor,
        linewidth: 2,
      });
      const edgeLine = new THREE.LineSegments(edgeGeom, edgeMat);
      edgeLine.position.set(free.position.x, baseY, free.position.z);
      edgeLine.rotation.y = (free.rotationDeg || 0) * Math.PI / 180;
      this.edgeGroup.add(edgeLine);

    } catch (e) {
      console.warn('Failed rendering freestanding building:', e);
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
    const towerColor = free.typeId === 'wooden_gate' ? 0x78350f : 0x334155;
    const towerRoofColor = free.typeId === 'wooden_gate' ? 0xca8a04 : 0x475569;
    const towerMat = new THREE.MeshLambertMaterial({
      color: towerColor,
      emissive: isUnderConstruction ? 0x451a03 : 0x100b02,
      transparent: isUnderConstruction,
      opacity: isUnderConstruction ? 0.75 : 1.0,
    });
    const towerRoofMat = new THREE.MeshLambertMaterial({
      color: towerRoofColor,
      emissive: isUnderConstruction ? 0xd97706 : 0x100b02,
      transparent: isUnderConstruction,
      opacity: isUnderConstruction ? 0.75 : 1.0,
    });

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
    const beamMat = new THREE.MeshLambertMaterial({
      color: isUnderConstruction ? 0xd97706 : 0x92400e,
      transparent: isUnderConstruction,
      opacity: isUnderConstruction ? 0.75 : 1.0,
    });
    const beamH = 0.5;
    const beamD = towerD + 0.3;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width + towerW * 2 + 0.2, beamH, beamD), beamMat);
    beam.position.set(0, towerH - beamH / 2, 0);
    beam.castShadow = true;
    setData(beam);
    gateGroup.add(beam);
    // An overhanging parapet lip on the front of the beam.
    const lip = new THREE.Mesh(new THREE.BoxGeometry(width + towerW * 2 + 0.2, 0.3, 0.35), beamMat);
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
    const leftDoor = new THREE.Group();
    const rightDoor = new THREE.Group();
    leftDoor.position.set(-hingeX, 0, 0);
    rightDoor.position.set(hingeX, 0, 0);
    for (const [side, group] of [
      [-1, leftDoor],
      [1, rightDoor],
    ] as const) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, doorT), wallMat);
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
   * Per-frame gate door animation. Friendly units (squads + vehicles) trigger
   * the doors open as they approach/traverse; doors ease closed once the area
   * is clear. Hostile units never open them (they cannot path through anyway).
   */
  public update(delta: number, friendlyPositions: { x: number; z: number }[] = []) {
    if (this.gateAnimations.size === 0 || !this.group.visible) return;
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
        free.constructionStatus === 'in_progress' || free.constructionStatus === 'planned';
      const centerElev = sampleElevation(elevation, free.position.x, free.position.z, exaggeration);
      const roofY = centerElev + (free.height || 4.5) + 3.0;
      this.createAdaptedMarker(
        free.position.x,
        roofY,
        free.position.z,
        free.category,
        isUnderConstruction
      );
    } catch (e) {
      console.warn('Failed rendering freestanding building:', e);
    }
  }

  private static buildingIconTextures = new Map<string, THREE.CanvasTexture>();

  private getBuildingIconTexture(category: FunctionalCategory | 'hq' | 'construction', label?: string): THREE.CanvasTexture {
    const key = `${category}_${label || ''}`;
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

  private createAdaptedMarker(x: number, y: number, z: number, category: FunctionalCategory, isInProgress = false) {
    const tex = this.getBuildingIconTexture(isInProgress ? 'construction' : category);
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

    // 1. Reset material for previous HQ if changed
    if (oldHqId !== null && String(oldHqId) !== String(hqBuildingId)) {
      const oldMesh = this.buildingMeshes.get(oldHqId);
      const oldBldg = this.buildingData.get(oldHqId);
      if (oldMesh && oldBldg) {
        const oldAdapted = adaptedBuildings.get(oldHqId);
        oldMesh.material = this.getBuildingMaterials(
          oldBldg.type,
          oldBldg.isOccupied,
          oldAdapted?.category,
          false,
          oldAdapted?.constructionStatus,
          buildingVariantForId(oldBldg.id),
          this.isBuildingPowered(oldBldg)
        );
      }
    }

    // 2. Set material for new HQ
    if (hqBuildingId !== null) {
      const newMesh = this.buildingMeshes.get(hqBuildingId);
      const newBldg = this.buildingData.get(hqBuildingId);
      if (newMesh && newBldg) {
        const newAdapted = adaptedBuildings.get(hqBuildingId);
        newMesh.material = this.getBuildingMaterials(
          newBldg.type,
          newBldg.isOccupied,
          newAdapted?.category,
          true,
          newAdapted?.constructionStatus,
          buildingVariantForId(newBldg.id),
          this.isBuildingPowered(newBldg)
        );
      }
    }

    // 3. Update adapted building materials
    for (const [bldgId, adapted] of adaptedBuildings) {
      if (hqBuildingId !== null && String(bldgId) === String(hqBuildingId)) continue;
      const mesh = this.buildingMeshes.get(bldgId);
      const bldg = this.buildingData.get(bldgId);
      if (mesh && bldg) {
        mesh.material = this.getBuildingMaterials(
          bldg.type,
          bldg.isOccupied,
          adapted.category,
          false,
          adapted.constructionStatus,
          buildingVariantForId(bldg.id),
          this.isBuildingPowered(bldg)
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
          adapted.constructionStatus === 'planned';
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
      const centerElev = sampleElevation(elevation, free.position.x, free.position.z, exaggeration);
      const topY = centerElev + (free.height || 6);
      this.createAdaptedMarker(
        free.position.x,
        topY,
        free.position.z,
        free.category,
        isUnderConstruction
      );
    }

    // Keep the zoomed-out merged LOD in sync with HQ / adapted / demolished /
    // freestanding changes (cheap signature check; rebuild only when it changed).
    this.refreshLodIfNeeded(hqBuildingId, adaptedBuildings, freestandingBuildings, demolishedBuildingIds);
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
        prevMesh.material = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg));
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
        const base = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg));
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
        prevMesh.material = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg));
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
        const base = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg));
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
          mesh.material = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg));
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
        const base = this.getBuildingMaterials(bldg.type, bldg.isOccupied, adapted?.category, isHQ, adapted?.constructionStatus, buildingVariantForId(bldg.id), this.isBuildingPowered(bldg));
        mesh.material = this.cloneWithTint(base, 0xff9d92, 0xff9d92);
      }
    }
  }

  public getBuildingById(id: string | number): BuildingPolygon | undefined {
    return this.buildingData.get(id);
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
        if (m.emissiveMap) {
          // Only powered colony buildings light their windows; abandoned
          // buildings stay dark at any hour.
          m.emissiveIntensity = (m.userData?.powered ? factor : 0) * 0.95;
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
