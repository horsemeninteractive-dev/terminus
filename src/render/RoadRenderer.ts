import * as THREE from 'three';
import { sampleElevation } from '../services/elevationService';
import { ElevationGrid, LanduseArea, Point2D, RoadSegment } from '../types/map';
import {
  createRealisticAsphaltTexture,
  createRealisticPathTexture,
  createRealisticCurbTexture,
} from './realisticTextures';

/** Deck height above the terrain surface for bridge spans (metres). */
const BRIDGE_DECK_RISE = 2.0;
/** Ramp length (metres) at each end of a bridge span easing road→deck height. */
const BRIDGE_RAMP_LEN = 12;
/** Total railing height above the deck surface. */
const BRIDGE_RAILING_H = 1.1;
/** Slim edge-beam (fascia) depth under the deck edges — the old full-height
 * skirt hang turned the whole span into a solid grey box girder. */
const BRIDGE_FASCIA_H = 0.45;
/** Height of the under-deck arch ribs at their crest. */
const BRIDGE_ARCH_RISE = 1.0;
/** Spacing between the pickets of the open railing (metres). */
const BRIDGE_BALUSTER_STRIDE = 2.6;
/** Support piers reach this far below the deck into the riverbed. */
const BRIDGE_PIER_DEPTH = 2.5;

export class RoadRenderer {
  public group = new THREE.Group();
  public labelGroup = new THREE.Group();

  /**
   * Terrain surface sampler injected by WorldScene: height of the terrain AS
   * RENDERED (piecewise-linear mesh) or null outside the mesh. Roads must lie
   * ON the visible terrain — the smooth analytic elevation can sit meters
   * below the rendered triangles on slopes, sinking roads into hillsides.
   */
  private terrainSurfaceSampler: ((x: number, z: number) => number | null) | null = null;

  public setTerrainSurfaceSampler(sampler: ((x: number, z: number) => number | null) | null) {
    this.terrainSurfaceSampler = sampler;
  }

  /** Rendered-terrain height when available, else the smooth analytic surface. */
  private terrainY(
    elevation: ElevationGrid | null | undefined,
    x: number,
    z: number,
    exaggeration: number
  ): number {
    return this.terrainSurfaceSampler?.(x, z) ?? sampleElevation(elevation, x, z, exaggeration);
  }

  /** Water polygons for bridge detection (set alongside terrain sampler). */
  private waterPolygons: Point2D[][] = [];

  public setWaterPolygons(polys: Point2D[][]) {
    this.waterPolygons = polys;
  }

  private static isInsidePolygon(x: number, z: number, poly: Point2D[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }

  /** True when the point sits inside any mapped water polygon. */
  private isOverWater(x: number, z: number): boolean {
    for (const poly of this.waterPolygons) {
      if (poly.length >= 3 && RoadRenderer.isInsidePolygon(x, z, poly)) return true;
    }
    return false;
  }

  /** Cached bridge deck samples from the last rebuildRoads: world XZ + deck
   *  top Y. Queried per-frame by the vehicle renderer so trucks ride the deck. */
  private deckSamples: Array<{ x: number; z: number; y: number; hw: number }> = [];
  private deckGrid = new Map<string, number[]>();
  private static DECK_CELL = 16;

  /**
   * Deck top surface Y at a world point, or null when the point is not on a
   * bridge road (within the road's half-width corridor of a lifted sample).
   */
  public sampleBridgeDeckY(x: number, z: number): number | null {
    if (this.deckSamples.length === 0) return null;
    const k = Math.floor(x / RoadRenderer.DECK_CELL) + '_' + Math.floor(z / RoadRenderer.DECK_CELL);
    const candidates = this.deckGrid.get(k);
    if (!candidates) return null;
    for (const idx of candidates) {
      const s = this.deckSamples[idx];
      if (Math.hypot(s.x - x, s.z - z) <= s.hw) return s.y;
    }
    return null;
  }

  /**
   * Bridge deck height logic for one road sample: over water the road lifts
   * onto a raised deck (with entry/exit ramps), elsewhere it hugs the terrain.
   * Returns the extra Y the road surface should sit at (0 = normal).
   */
  private bridgeDeckRise(sample: Point2D, prevSample: Point2D | null, nextSample: Point2D | null): number {
    if (this.waterPolygons.length === 0) return 0;
    const over = this.isOverWater(sample.x, sample.z);
    if (!over) {
      // Near the bank a ramp eases the road up to deck height. The ramp is
      // measured from the last dry sample toward the water — while the road is
      // still on land but the NEXT sample is already over water, start rising.
      const nearNext = nextSample && this.isOverWater(nextSample.x, nextSample.z);
      const nearPrev = prevSample && this.isOverWater(prevSample.x, prevSample.z);
      if (nearNext && nearPrev) return BRIDGE_DECK_RISE; // short island between water
      if (nearNext || nearPrev) {
        // Distance from this dry sample to the waterline: full rise at the
        // bank, tapering to 0 over BRIDGE_RAMP_LEN metres.
        const other = (nearNext ? nextSample : prevSample)!;
        let d = 0;
        const step = 2.0;
        const dx = (other.x - sample.x);
        const dz = (other.z - sample.z);
        const total = Math.hypot(dx, dz);
        while (d < total) {
          d += step;
          if (this.isOverWater(sample.x + (dx / total) * d, sample.z + (dz / total) * d)) break;
        }
        const ramp = Math.max(0, 1 - d / BRIDGE_RAMP_LEN);
        return BRIDGE_DECK_RISE * ramp;
      }
      return 0;
    }
    // Fully over water: full deck height.
    return BRIDGE_DECK_RISE;
  }

  // Realistic procedural textures
  private asphaltTexture = createRealisticAsphaltTexture();
  private pedestrianTexture = createRealisticPathTexture(true);
  private curbTexture = createRealisticCurbTexture();

  private roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x3e424a,
    roughness: 0.82,
    metalness: 0.08,
    map: this.asphaltTexture,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -1.0,
    depthWrite: true,
  });

  private pedestrianMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a606d,
    roughness: 0.85,
    metalness: 0.04,
    map: this.pedestrianTexture,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -1.0,
    depthWrite: true,
  });

  private curbMaterial = new THREE.MeshStandardMaterial({
    color: 0x6e7683,
    roughness: 0.8,
    metalness: 0.1,
    map: this.curbTexture,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1.2,
    polygonOffsetUnits: -1.2,
    depthWrite: true,
  });

  private markingsMaterial = new THREE.MeshBasicMaterial({
    color: 0xf1efe7,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -1.4,
    polygonOffsetUnits: -1.4,
    depthWrite: true,
  });

  // Bridge railings: painted-steel posts and rails, lighter than the asphalt.
  private bridgeRailingMaterial = new THREE.MeshStandardMaterial({
    color: 0xc2c7cf,
    roughness: 0.55,
    metalness: 0.35,
    side: THREE.DoubleSide,
  });

  // Bridge piers: darker concrete rising out of the water.
  private bridgePierMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b7076,
    roughness: 0.95,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  private labelMaterials: THREE.MeshBasicMaterial[] = [];
  private showStreetLabels = false;

  /**
   * Toggles the road surface/curb/marking meshes without touching the street
   * name labels (they live in their own group and follow showStreetLabels).
   * Used so satellite imagery can replace the vector road layer entirely.
   */
  public setMeshesVisible(visible: boolean) {
    this.group.children.forEach((child) => {
      if (child !== this.labelGroup) child.visible = visible;
    });
  }

  constructor() {
    this.group.name = 'RoadsGroup';
    this.labelGroup.name = 'RoadLabelsGroup';
    this.labelGroup.visible = false;
    this.group.add(this.labelGroup);
  }

  /**
   * Subdivides road segments adaptively: dense sampling only where the polyline
   * actually curves or the sampled terrain slopes, coarse sampling on straight,
   * flat stretches. The old fixed 1.4m step produced millions of vertices on
   * city-scale maps (the single largest FPS cost) for detail the terrain grid
   * cannot express anyway.
   */
  private subdivideRoadPoints(
    points: Point2D[],
    maxSegLength = 3.5,
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ): Point2D[] {
    if (points.length <= 1) return points;
    const result: Point2D[] = [points[0]];

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      if (dist <= maxSegLength) {
        result.push(p2);
        continue;
      }

      // Direction change vs the previous segment (curvature driver).
      const prev = points[i - 1] ?? p1;
      const dir1x = (p1.x - prev.x) / (Math.hypot(p1.x - prev.x, p1.z - prev.z) || 1);
      const dir1z = (p1.z - prev.z) / (Math.hypot(p1.x - prev.x, p1.z - prev.z) || 1);
      const len2 = Math.hypot(p2.x - p1.x, p2.z - p1.z) || 1;
      const dir2x = (p2.x - p1.x) / len2;
      const dir2z = (p2.z - p1.z) / len2;
      const turn = Math.abs(dir1x * dir2z - dir1z * dir2x); // |sin(theta)|

      // Terrain slope across the segment (elevation driver).
      let slope = 0;
      if (elevation) {
        const e1 = this.terrainY(elevation, p1.x, p1.z, exaggeration);
        const e2 = this.terrainY(elevation, p2.x, p2.z, exaggeration);
        slope = Math.abs(e2 - e1) / Math.max(dist, 1);
      }

      // Density: straight+flat stretches clamp to 12m; curvy or sloped
      // stretches keep the old fine 1.4m sampling. Intermediate values ease
      // smoothly so ribbons never show tessellation seams.
      const curveFactor = Math.min(1, turn * 14 + slope * 6);
      const step = maxSegLength + (12 - maxSegLength) * (1 - curveFactor);

      const steps = Math.ceil(dist / step);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({
          x: p1.x + (p2.x - p1.x) * t,
          z: p1.z + (p2.z - p1.z) * t,
        });
      }
      result.push(p2);
    }

    return result;
  }

  public rebuildRoads(
    roads: RoadSegment[],
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    this.clear();
    this.deckSamples = [];
    this.deckGrid.clear();

    const roadGeometries: THREE.BufferGeometry[] = [];
    const pedestrianGeometries: THREE.BufferGeometry[] = [];
    const curbGeometries: THREE.BufferGeometry[] = [];
    const markingGeometries: THREE.BufferGeometry[] = [];
    const railingGeometries: THREE.BufferGeometry[] = [];
    const pierGeometries: THREE.BufferGeometry[] = [];

    // 1. Build Spatial Index of Junctions
    interface RoadJunction {
      x: number;
      z: number;
      branches: { roadIdx: number; isStart: boolean; width: number; isPedestrian: boolean }[];
      maxWidth: number;
      radius: number;
      isPedestrianOnly: boolean;
    }

    const junctionGrid = new Map<string, RoadJunction[]>();
    const junctions: RoadJunction[] = [];
    const JUNC_CELL = 8;
    const getJuncCell = (x: number, z: number) =>
      Math.floor(x / JUNC_CELL) + '_' + Math.floor(z / JUNC_CELL);

    // Index all road endpoints into clustered junctions
    for (let rIdx = 0; rIdx < roads.length; rIdx++) {
      const r = roads[rIdx];
      if (!r.points || r.points.length < 2) continue;
      const isPed = [
        'pedestrian',
        'footway',
        'cycleway',
        'path',
        'steps',
        'living_street',
      ].includes(r.highwayType);
      const w = r.width || (isPed ? 3 : 6);

      const pStart = r.points[0];
      const pEnd = r.points[r.points.length - 1];

      const endpoints = [
        { pt: pStart, isStart: true },
        { pt: pEnd, isStart: false },
      ];

      for (const ep of endpoints) {
        const cx = Math.floor(ep.pt.x / JUNC_CELL);
        const cz = Math.floor(ep.pt.z / JUNC_CELL);
        let found: RoadJunction | null = null;

        for (let dx = -1; dx <= 1 && !found; dx++) {
          for (let dz = -1; dz <= 1 && !found; dz++) {
            const list = junctionGrid.get(cx + dx + '_' + (cz + dz));
            if (list) {
              for (const cand of list) {
                if (Math.hypot(cand.x - ep.pt.x, cand.z - ep.pt.z) < 1.6) {
                  found = cand;
                  break;
                }
              }
            }
          }
        }

        if (!found) {
          found = {
            x: ep.pt.x,
            z: ep.pt.z,
            branches: [],
            maxWidth: w,
            radius: Math.max(w / 2, 2.2) + 0.4,
            isPedestrianOnly: isPed,
          };
          junctions.push(found);
          const k = getJuncCell(ep.pt.x, ep.pt.z);
          if (!junctionGrid.has(k)) junctionGrid.set(k, []);
          junctionGrid.get(k)!.push(found);
        }

        found.branches.push({
          roadIdx: rIdx,
          isStart: ep.isStart,
          width: w,
          isPedestrian: isPed,
        });
        if (w > found.maxWidth) {
          found.maxWidth = w;
          found.radius = Math.max(w / 2, 2.2) + 0.4;
        }
        if (!isPed) {
          found.isPedestrianOnly = false;
        }
      }
    }

    // 2. Build Spatial Index of Road Centerlines for fast cross-road overlap queries
    interface SegmentBox {
      roadIdx: number;
      p1: Point2D;
      p2: Point2D;
      halfW: number;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }

    const roadSegGrid = new Map<string, SegmentBox[]>();
    const ROAD_CELL = 25;
    const getRoadCell = (x: number, z: number) =>
      Math.floor(x / ROAD_CELL) + '_' + Math.floor(z / ROAD_CELL);

    for (let rIdx = 0; rIdx < roads.length; rIdx++) {
      const r = roads[rIdx];
      if (!r.points || r.points.length < 2) continue;
      const hw = (r.width || 6) / 2;
      for (let i = 0; i < r.points.length - 1; i++) {
        const p1 = r.points[i];
        const p2 = r.points[i + 1];
        const minX = Math.min(p1.x, p2.x) - hw;
        const maxX = Math.max(p1.x, p2.x) + hw;
        const minZ = Math.min(p1.z, p2.z) - hw;
        const maxZ = Math.max(p1.z, p2.z) + hw;
        const segBox: SegmentBox = { roadIdx: rIdx, p1, p2, halfW: hw, minX, maxX, minZ, maxZ };

        const cMinX = Math.floor(minX / ROAD_CELL);
        const cMaxX = Math.floor(maxX / ROAD_CELL);
        const cMinZ = Math.floor(minZ / ROAD_CELL);
        const cMaxZ = Math.floor(maxZ / ROAD_CELL);

        for (let cx = cMinX; cx <= cMaxX; cx++) {
          for (let cz = cMinZ; cz <= cMaxZ; cz++) {
            const k = cx + '_' + cz;
            if (!roadSegGrid.has(k)) roadSegGrid.set(k, []);
            roadSegGrid.get(k)!.push(segBox);
          }
        }
      }
    }

    // Helper: Checks if a 2D point is inside an overlapping road other than excludeRoadIdx
    const isPointInOtherRoad = (pt: Point2D, excludeRoadIdx: number): boolean => {
      const k = getRoadCell(pt.x, pt.z);
      const segs = roadSegGrid.get(k);
      if (!segs) return false;

      for (const seg of segs) {
        if (seg.roadIdx === excludeRoadIdx) continue;
        if (
          pt.x < seg.minX ||
          pt.x > seg.maxX ||
          pt.z < seg.minZ ||
          pt.z > seg.maxZ
        ) {
          continue;
        }
        // Distance to segment centerline
        const dx = seg.p2.x - seg.p1.x;
        const dz = seg.p2.z - seg.p1.z;
        const segLenSq = dx * dx + dz * dz;
        if (segLenSq < 0.0001) continue;
        const t = Math.max(0, Math.min(1, ((pt.x - seg.p1.x) * dx + (pt.z - seg.p1.z) * dz) / segLenSq));
        const projX = seg.p1.x + t * dx;
        const projZ = seg.p1.z + t * dz;
        const dSq = (pt.x - projX) * (pt.x - projX) + (pt.z - projZ) * (pt.z - projZ);
        if (dSq < seg.halfW * seg.halfW) {
          return true;
        }
      }
      return false;
    };

    // Helper: Find closest junction for an endpoint
    const findJunction = (pt: Point2D): RoadJunction | null => {
      const cx = Math.floor(pt.x / JUNC_CELL);
      const cz = Math.floor(pt.z / JUNC_CELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = junctionGrid.get(cx + dx + '_' + (cz + dz));
          if (list) {
            for (const j of list) {
              if (Math.hypot(j.x - pt.x, j.z - pt.z) < 1.8) {
                return j;
              }
            }
          }
        }
      }
      return null;
    };

    // 3. Generate Smooth Intersection Caps at Multi-Branch Junctions
    for (const junc of junctions) {
      if (junc.branches.length < 2) continue;

      const yOffset = junc.isPedestrianOnly ? 0.05 : 0.08;
      const centerY = this.terrainY(elevation, junc.x, junc.z, exaggeration) + yOffset;
      const radius = junc.radius;
      const numSegments = 16;

      const juncVerts: number[] = [];
      const juncUvs: number[] = [];
      const juncIndices: number[] = [];

      // Center vertex (index 0)
      juncVerts.push(junc.x, centerY, junc.z);
      juncUvs.push(junc.x * 0.15, junc.z * 0.15);

      for (let s = 0; s <= numSegments; s++) {
        const theta = (s * Math.PI * 2) / numSegments;
        const px = junc.x + Math.cos(theta) * radius;
        const pz = junc.z + Math.sin(theta) * radius;
        const py = this.terrainY(elevation, px, pz, exaggeration) + yOffset;

        juncVerts.push(px, py, pz);
        juncUvs.push(px * 0.15, pz * 0.15);

        if (s < numSegments) {
          juncIndices.push(0, s + 1, s + 2);
        }
      }

      const juncGeom = new THREE.BufferGeometry();
      juncGeom.setAttribute('position', new THREE.Float32BufferAttribute(juncVerts, 3));
      juncGeom.setAttribute('uv', new THREE.Float32BufferAttribute(juncUvs, 2));
      juncGeom.setIndex(juncIndices);
      juncGeom.computeVertexNormals();

      if (junc.isPedestrianOnly) {
        pedestrianGeometries.push(juncGeom);
      } else {
        roadGeometries.push(juncGeom);
      }
    }

    // 4. Generate Road Ribbons with Seamless Curbs and Edge Blending
    for (let rIdx = 0; rIdx < roads.length; rIdx++) {
      const road = roads[rIdx];
      if (!road.points || road.points.length < 2) continue;

      const rawPts = road.points;
      const pts = this.subdivideRoadPoints(rawPts, 1.4, elevation, exaggeration);
      const width = road.width || 6;
      const halfW = width / 2;
      const curbW = 0.28;

      const isPedestrian = [
        'pedestrian',
        'footway',
        'cycleway',
        'path',
        'steps',
        'living_street',
      ].includes(road.highwayType);

      const vertices: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      const curbVertices: number[] = [];
      const curbUvs: number[] = [];
      const curbIndices: number[] = [];

      const markingVertices: number[] = [];
      const markingUvs: number[] = [];
      const markingIndices: number[] = [];

      // Bridge geometry (railings, arches, support piers) — only built for
      // spans that actually cross water, so ordinary roads pay nothing.
      const railingVertices: number[] = [];
      const railingIndices: number[] = [];
      const pierVertices: number[] = [];
      const pierIndices: number[] = [];
      /** Lifted slices, in order — consumed after the loop to lay out the open
       * balustrade and the under-deck arches along the span. */
      const liftedSlices: {
        cx: number; cz: number; lx: number; lz: number; rx: number; rz: number;
        surfaceY: number; dist: number;
      }[] = [];

      // Tight, snug vertical offsets above terrain
      const yOffset = isPedestrian ? 0.05 : 0.08;
      const curbY = yOffset + 0.055;
      const markingY = yOffset + 0.015;
      const skirtDepth = 0.5;

      const startJunc = findJunction(pts[0]);
      const endJunc = findJunction(pts[pts.length - 1]);
      const hasMultiStartJunc = !!(startJunc && startJunc.branches.length >= 2);
      const hasMultiEndJunc = !!(endJunc && endJunc.branches.length >= 2);
      const startJuncRadius = startJunc ? startJunc.radius : 0;
      const endJuncRadius = endJunc ? endJunc.radius : 0;

      // Track curb state per slice
      const leftCurbClear: boolean[] = [];
      const rightCurbClear: boolean[] = [];

      let accumulatedDistance = 0;

      for (let i = 0; i < pts.length; i++) {
        let dx = 0;
        let dz = 0;

        if (i === 0) {
          dx = pts[1].x - pts[0].x;
          dz = pts[1].z - pts[0].z;
        } else if (i === pts.length - 1) {
          dx = pts[i].x - pts[i - 1].x;
          dz = pts[i].z - pts[i - 1].z;
          accumulatedDistance += Math.hypot(dx, dz);
        } else {
          const dx1 = pts[i].x - pts[i - 1].x;
          const dz1 = pts[i].z - pts[i - 1].z;
          const dx2 = pts[i + 1].x - pts[i].x;
          const dz2 = pts[i + 1].z - pts[i].z;
          const len1 = Math.hypot(dx1, dz1) || 1;
          const len2 = Math.hypot(dx2, dz2) || 1;
          dx = dx1 / len1 + dx2 / len2;
          dz = dz1 / len1 + dz2 / len2;
          accumulatedDistance += len1;
        }

        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;

        // Sample terrain across 3 points: Left Edge, Centerline, Right Edge
        const leftX = pts[i].x + nx * halfW;
        const leftZ = pts[i].z + nz * halfW;
        const centerX = pts[i].x;
        const centerZ = pts[i].z;
        const rightX = pts[i].x - nx * halfW;
        const rightZ = pts[i].z - nz * halfW;

        // Conformal elevation sampling - all heights follow terrain uniformly
        const leftTerrainY = this.terrainY(elevation, leftX, leftZ, exaggeration);
        const centerTerrainY = this.terrainY(elevation, centerX, centerZ, exaggeration);
        const rightTerrainY = this.terrainY(elevation, rightX, rightZ, exaggeration);

        // BRIDGE: over water the road lifts onto a raised deck with ramps at
        // the banks; over land the rise is zero and the road hugs the terrain
        // exactly as before.
        const deckRise = isPedestrian
          ? 0
          : this.bridgeDeckRise(pts[i], i > 0 ? pts[i - 1] : null, i < pts.length - 1 ? pts[i + 1] : null);

        const leftSurfaceY = leftTerrainY + yOffset + deckRise;
        const centerSurfaceY = centerTerrainY + yOffset + deckRise;
        const rightSurfaceY = rightTerrainY + yOffset + deckRise;

        const vDistance = accumulatedDistance * 0.2;

        // Check if edge is inside an intersection or overlapping road
        const distToStartPt = Math.hypot(pts[i].x - pts[0].x, pts[i].z - pts[0].z);
        const distToEndPt = Math.hypot(pts[i].x - pts[pts.length - 1].x, pts[i].z - pts[pts.length - 1].z);

        const inStartJunc = hasMultiStartJunc && distToStartPt < startJuncRadius - 0.2;
        const inEndJunc = hasMultiEndJunc && distToEndPt < endJuncRadius - 0.2;
        const inJunctionZone = inStartJunc || inEndJunc;

        const leftOverlapsRoad = isPointInOtherRoad({ x: leftX, z: leftZ }, rIdx);
        const rightOverlapsRoad = isPointInOtherRoad({ x: rightX, z: rightZ }, rIdx);

        // Curbs are suppressed on the bridge itself — a curb quad would else
        // stretch from the riverbed up to the deck edge, another solid wall.
        const isLeftCurbActive = !isPedestrian && !inJunctionZone && !leftOverlapsRoad && deckRise <= 0.05;
        const isRightCurbActive = !isPedestrian && !inJunctionZone && !rightOverlapsRoad && deckRise <= 0.05;

        leftCurbClear.push(isLeftCurbActive);
        rightCurbClear.push(isRightCurbActive);

        // Skirts drop below terrain only on true outer boundaries (not inside overlapping junctions)
        // On a bridge the skirt is only a slim fascia below the deck edge, so
        // water stays visible beneath the span instead of the deck reading as
        // a solid box down to the riverbed.
        const onBridgeEdge = deckRise > 0.05;
        const leftSkirtY = leftOverlapsRoad || inJunctionZone
          ? leftSurfaceY
          : onBridgeEdge
            ? leftSurfaceY - BRIDGE_FASCIA_H
            : Math.min(leftSurfaceY - skirtDepth, leftTerrainY - skirtDepth);
        const rightSkirtY = rightOverlapsRoad || inJunctionZone
          ? rightSurfaceY
          : onBridgeEdge
            ? rightSurfaceY - BRIDGE_FASCIA_H
            : Math.min(rightSurfaceY - skirtDepth, rightTerrainY - skirtDepth);

        // 5 vertices per cross section:
        // 0: Left Skirt Bottom
        // 1: Left Surface
        // 2: Center Surface
        // 3: Right Surface
        // 4: Right Skirt Bottom
        vertices.push(
          leftX + nx * 0.04, leftSkirtY, leftZ + nz * 0.04,
          leftX, leftSurfaceY, leftZ,
          centerX, centerSurfaceY, centerZ,
          rightX, rightSurfaceY, rightZ,
          rightX - nx * 0.04, rightSkirtY, rightZ - nz * 0.04
        );

        uvs.push(
          0.0, vDistance,
          0.04, vDistance,
          0.5, vDistance,
          0.96, vDistance,
          1.0, vDistance
        );

        // Curbs (only active on non-overlapping edges)
        if (!isPedestrian) {
          curbVertices.push(
            pts[i].x + nx * (halfW + curbW),
            leftTerrainY + curbY,
            pts[i].z + nz * (halfW + curbW)
          );
          curbVertices.push(leftX, leftSurfaceY + 0.025, leftZ);

          curbVertices.push(rightX, rightSurfaceY + 0.025, rightZ);
          curbVertices.push(
            pts[i].x - nx * (halfW + curbW),
            rightTerrainY + curbY,
            pts[i].z - nz * (halfW + curbW)
          );

          curbUvs.push(0, vDistance, 1, vDistance, 0, vDistance, 1, vDistance);
        }

        // Center line markings for wide roads (width >= 6m, stopping before intersections)
        if (!isPedestrian && width >= 6) {
          const markW = 0.18;
          const markDistToStart = hasMultiStartJunc ? distToStartPt : Infinity;
          const markDistToEnd = hasMultiEndJunc ? distToEndPt : Infinity;
          const isMarkingActive =
            markDistToStart > startJuncRadius + 0.8 &&
            markDistToEnd > endJuncRadius + 0.8;

          if (isMarkingActive) {
            const currentMarkVertIdx = markingVertices.length / 3;
            markingVertices.push(
              pts[i].x + nx * markW,
              centerSurfaceY + markingY,
              pts[i].z + nz * markW,
              pts[i].x - nx * markW,
              centerSurfaceY + markingY,
              pts[i].z - nz * markW
            );
            markingUvs.push(0, vDistance, 1, vDistance);

            // Connect to previous slice if the previous slice was adjacent
            if (i > 0 && markingVertices.length >= 12) {
              const prevIdx = currentMarkVertIdx - 2;
              markingIndices.push(prevIdx, currentMarkVertIdx, prevIdx + 1);
              markingIndices.push(prevIdx + 1, currentMarkVertIdx, currentMarkVertIdx + 1);
            }
          }
        }

        if (i < pts.length - 1) {
          const rowA = i * 5;
          const rowB = (i + 1) * 5;

          // 1. Left Skirt
          indices.push(rowA + 0, rowB + 0, rowA + 1);
          indices.push(rowA + 1, rowB + 0, rowB + 1);
          // 2. Left Lane
          indices.push(rowA + 1, rowB + 1, rowA + 2);
          indices.push(rowA + 2, rowB + 1, rowB + 2);

          // 3. Right Lane
          indices.push(rowA + 2, rowB + 2, rowA + 3);
          indices.push(rowA + 3, rowB + 2, rowB + 3);

          // 4. Right Skirt
          indices.push(rowA + 3, rowB + 3, rowA + 4);
          indices.push(rowA + 4, rowB + 3, rowB + 4);

          // Curbs: only generate curb quads between slices where both ends are clear of junctions
          if (!isPedestrian) {
            const cIdx = i * 4;
            // Left curb:
            if (leftCurbClear[i]) {
              curbIndices.push(cIdx, cIdx + 4, cIdx + 1);
              curbIndices.push(cIdx + 1, cIdx + 4, cIdx + 5);
            }
            // Right curb:
            if (rightCurbClear[i]) {
              curbIndices.push(cIdx + 2, cIdx + 6, cIdx + 3);
              curbIndices.push(cIdx + 3, cIdx + 6, cIdx + 7);
            }
          }

        }

        // BRIDGE: this slice is genuinely on the span (deck rise > 0.3 m).
        // Record it for the post-loop balustrade/arch layout and keep feeding
        // the vehicle deck sampler.
        if (deckRise > 0.3) {
          // Deck sample for the vehicle renderer: centre of the slice, deck
          // surface Y, corridor half-width (slightly wider than the road so a
          // truck on the edge still reads as on-deck).
          const deckIdx = this.deckSamples.length;
          this.deckSamples.push({ x: pts[i].x, z: pts[i].z, y: centerSurfaceY, hw: halfW + 1.0 });
          const dk = Math.floor(pts[i].x / RoadRenderer.DECK_CELL) + '_' + Math.floor(pts[i].z / RoadRenderer.DECK_CELL);
          let bucket = this.deckGrid.get(dk);
          if (!bucket) {
            bucket = [];
            this.deckGrid.set(dk, bucket);
          }
          bucket.push(deckIdx);
          liftedSlices.push({
            cx: pts[i].x, cz: pts[i].z,
            lx: leftX, lz: leftZ, rx: rightX, rz: rightZ,
            surfaceY: centerSurfaceY, dist: accumulatedDistance,
          });
          // Support piers every ~20 m of deck length: slim box columns from
          // just under the deck fascia down into the riverbed.
          const pierStride = 20;
          const segLen = i > 0 ? Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) : 0;
          const prevAccum = accumulatedDistance - segLen;
          if (i > 0 && i < pts.length - 1 && Math.floor(accumulatedDistance / pierStride) > Math.floor(prevAccum / pierStride)) {
            for (const sgn of [1, -1]) {
              const bx = pts[i].x + nx * sgn * halfW * 0.7;
              const bz = pts[i].z + nz * sgn * halfW * 0.7;
              const baseY = this.terrainY(elevation, bx, bz, exaggeration) - BRIDGE_PIER_DEPTH;
              const w = Math.max(0.55, width * 0.09);
              const pierTop = centerSurfaceY - BRIDGE_FASCIA_H;
              const base = pierVertices.length / 3;
              // Box pier: 8 corners (4 bottom, 4 top).
              pierVertices.push(
                bx - w, baseY, bz - w, bx + w, baseY, bz - w, bx + w, baseY, bz + w, bx - w, baseY, bz + w,
                bx - w, pierTop, bz - w, bx + w, pierTop, bz - w, bx + w, pierTop, bz + w, bx - w, pierTop, bz + w
              );
              // Sides (skip top/bottom faces — hidden by deck and riverbed).
              for (let q = 0; q < 4; q++) {
                const b0 = base + q;
                const b1 = base + ((q + 1) % 4);
                pierIndices.push(b0, b0 + 4, b1, b1, b0 + 4, b1 + 4);
              }
            }
          }
        }
      }

      // BRIDGE DRESSING — laid out after the main loop now that every lifted
      // slice of the span is known:
      //  • an OPEN balustrade (two horizontal rails + slim pickets) instead of
      //    the old solid parapet wall,
      //  • arch ribs under the deck between supports for a classic span look.
      if (liftedSlices.length >= 2) {
        const firstDist = liftedSlices[0].dist;
        const span = Math.max(1, liftedSlices[liftedSlices.length - 1].dist - firstDist);
        const archCount = Math.min(6, Math.max(1, Math.round(span / 18)));

        for (let s = 0; s < liftedSlices.length; s++) {
          const p = liftedSlices[s];
          const base = railingVertices.length / 3;

          // Rail bands: per edge a lower bar (0.12–0.30) and a top bar
          // (0.82–BRIDGE_RAILING_H). Quads pair with the previous slice.
          railingVertices.push(
            p.lx, p.surfaceY + 0.12, p.lz, p.lx, p.surfaceY + 0.30, p.lz,
            p.lx, p.surfaceY + 0.82, p.lz, p.lx, p.surfaceY + BRIDGE_RAILING_H, p.lz,
            p.rx, p.surfaceY + 0.12, p.rz, p.rx, p.surfaceY + 0.30, p.rz,
            p.rx, p.surfaceY + 0.82, p.rz, p.rx, p.surfaceY + BRIDGE_RAILING_H, p.rz
          );
          if (s > 0) {
            const prev = base - 8;
            for (const pair of [[0, 1], [2, 3], [4, 5], [6, 7]]) {
              railingIndices.push(
                prev + pair[0], base + pair[0], prev + pair[1],
                prev + pair[1], base + pair[0], base + pair[1]
              );
            }
          }

          // Pickets every ~2.6 m: slim vertical quads on both edges.
          if (s === 0 || p.dist - liftedSlices[s - 1].dist >= BRIDGE_BALUSTER_STRIDE) {
            const n = liftedSlices[s + 1] ?? liftedSlices[s - 1];
            let tx = n.cx - p.cx;
            let tz = n.cz - p.cz;
            const tl = Math.hypot(tx, tz) || 1;
            tx /= tl;
            tz /= tl;
            for (const [ex, ez] of [[p.lx, p.lz], [p.rx, p.rz]]) {
              const bv = railingVertices.length / 3;
              railingVertices.push(
                ex - tx * 0.045, p.surfaceY + 0.06, ez - tz * 0.045,
                ex + tx * 0.045, p.surfaceY + 0.06, ez + tz * 0.045,
                ex - tx * 0.045, p.surfaceY + BRIDGE_RAILING_H - 0.08, ez - tz * 0.045,
                ex + tx * 0.045, p.surfaceY + BRIDGE_RAILING_H - 0.08, ez + tz * 0.045
              );
              railingIndices.push(bv, bv + 2, bv + 1, bv + 1, bv + 2, bv + 3);
            }
          }

          // Arch ribs: vertical bands under each deck edge. Height follows a
          // repeated sine arc — zero at the supports, crest mid-span.
          const t = (p.dist - firstDist) / span;
          const arch = Math.abs(Math.sin(Math.PI * archCount * t)) * BRIDGE_ARCH_RISE;
          const topY = p.surfaceY - BRIDGE_FASCIA_H - 0.03;
          for (const [ex, ez] of [[p.lx, p.lz], [p.rx, p.rz]]) {
            const av = pierVertices.length / 3;
            pierVertices.push(ex, topY, ez, ex, topY - arch, ez);
            if (s > 0) {
              pierIndices.push(av - 2, av, av - 1, av - 1, av, av + 1);
            }
          }
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setIndex(indices);
      geom.computeVertexNormals();

      if (isPedestrian) {
        pedestrianGeometries.push(geom);
      } else {
        roadGeometries.push(geom);
      }

      if (curbVertices.length > 0 && curbIndices.length > 0) {
        const cGeom = new THREE.BufferGeometry();
        cGeom.setAttribute('position', new THREE.Float32BufferAttribute(curbVertices, 3));
        cGeom.setAttribute('uv', new THREE.Float32BufferAttribute(curbUvs, 2));
        cGeom.setIndex(curbIndices);
        cGeom.computeVertexNormals();
        curbGeometries.push(cGeom);
      }

      if (markingVertices.length > 0 && markingIndices.length > 0) {
        const mGeom = new THREE.BufferGeometry();
        mGeom.setAttribute('position', new THREE.Float32BufferAttribute(markingVertices, 3));
        mGeom.setAttribute('uv', new THREE.Float32BufferAttribute(markingUvs, 2));
        mGeom.setIndex(markingIndices);
        mGeom.computeVertexNormals();
        markingGeometries.push(mGeom);
      }

      if (railingVertices.length > 0 && railingIndices.length > 0) {
        const rGeom = new THREE.BufferGeometry();
        rGeom.setAttribute('position', new THREE.Float32BufferAttribute(railingVertices, 3));
        rGeom.setIndex(railingIndices);
        rGeom.computeVertexNormals();
        railingGeometries.push(rGeom);
      }

      if (pierVertices.length > 0 && pierIndices.length > 0) {
        const pGeom = new THREE.BufferGeometry();
        pGeom.setAttribute('position', new THREE.Float32BufferAttribute(pierVertices, 3));
        pGeom.setIndex(pierIndices);
        pGeom.computeVertexNormals();
        pierGeometries.push(pGeom);
      }
    }

    // Merge and instantiate meshes for high-performance rendering
    if (roadGeometries.length > 0) {
      const mergedRoad = this.mergeBufferGeometries(roadGeometries);
      if (mergedRoad) {
        const mesh = new THREE.Mesh(mergedRoad, this.roadMaterial);
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    }

    if (pedestrianGeometries.length > 0) {
      const mergedPed = this.mergeBufferGeometries(pedestrianGeometries);
      if (mergedPed) {
        const mesh = new THREE.Mesh(mergedPed, this.pedestrianMaterial);
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    }

    if (curbGeometries.length > 0) {
      const mergedCurb = this.mergeBufferGeometries(curbGeometries);
      if (mergedCurb) {
        const mesh = new THREE.Mesh(mergedCurb, this.curbMaterial);
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    }

    if (markingGeometries.length > 0) {
      const mergedMarking = this.mergeBufferGeometries(markingGeometries);
      if (mergedMarking) {
        const mesh = new THREE.Mesh(mergedMarking, this.markingsMaterial);
        this.group.add(mesh);
      }
    }

    // Bridge railings (concrete parapets) and support piers.
    if (railingGeometries.length > 0) {
      const mergedRail = this.mergeBufferGeometries(railingGeometries);
      if (mergedRail) {
        const mesh = new THREE.Mesh(mergedRail, this.bridgeRailingMaterial);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.group.add(mesh);
      }
    }
    if (pierGeometries.length > 0) {
      const mergedPier = this.mergeBufferGeometries(pierGeometries);
      if (mergedPier) {
        const mesh = new THREE.Mesh(mergedPier, this.bridgePierMaterial);
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    }

    // Build Flat Surface Road Name Labels
    this.rebuildRoadLabels(roads, elevation, exaggeration);
    if (!this.group.children.includes(this.labelGroup)) {
      this.group.add(this.labelGroup);
    }
    this.labelGroup.visible = this.showStreetLabels;
  }

  private rebuildRoadLabels(
    roads: RoadSegment[],
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    // Clear existing label meshes & materials
    while (this.labelGroup.children.length > 0) {
      const c = this.labelGroup.children[0] as THREE.Mesh;
      if (c.geometry) c.geometry.dispose();
      this.labelGroup.remove(c);
    }
    this.labelMaterials.forEach((m) => {
      if (m.map) m.map.dispose();
      m.dispose();
    });
    this.labelMaterials = [];

    const textureCache = new Map<string, THREE.CanvasTexture>();

    const getOrCreateTexture = (text: string): THREE.CanvasTexture => {
      const existing = textureCache.get(text);
      if (existing) return existing;

      const canvas = document.createElement('canvas');
      const charCount = text.length;
      canvas.height = 64;
      canvas.width = Math.max(128, Math.min(1024, Math.ceil(charCount * 36 + 56)));
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Subtle dark tactical backdrop pill
        ctx.fillStyle = 'rgba(10, 15, 24, 0.82)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(4, 8, canvas.width - 8, canvas.height - 16, 8);
        } else {
          ctx.rect(4, 8, canvas.width - 8, canvas.height - 16);
        }
        ctx.fill();

        // Border highlight
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Tactical Typography
        ctx.font = 'bold 30px "Courier New", monospace, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Dark stroke halo for legibility
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.95)';
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, cx, cy);

        // Crisp high-contrast foreground
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(text, cx, cy);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      textureCache.set(text, tex);
      return tex;
    };

    // Filter valid named roads
    const namedRoads = roads.filter(
      (r) => r.name && r.name.trim().length > 1 && r.points && r.points.length >= 2
    );

    // Spatial tracker to prevent overlapping labels
    const placedLabels: { x: number; z: number; name: string }[] = [];

    for (const road of namedRoads) {
      const rawName = road.name?.trim() || '';
      if (!rawName) continue;
      const normName = this.decodeStreetName(rawName).toLocaleUpperCase();

      const isPedestrian = [
        'pedestrian',
        'footway',
        'cycleway',
        'path',
        'steps',
        'living_street',
      ].includes(road.highwayType);

      const yOffset = isPedestrian ? 0.22 : 0.32;
      const rawPts = road.points;
      if (rawPts.length < 2) continue;

      // Subdivide points smoothly so the ribbon follows road curves without excess vertex count
      const pts = this.subdivideRoadPoints(rawPts, 2.5, elevation, exaggeration);
      if (pts.length < 2) continue;

      // Calculate cumulative distances along the road
      const dists: number[] = [0];
      for (let i = 0; i < pts.length - 1; i++) {
        const segDist = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        dists.push(dists[i] + segDist);
      }
      const totalLen = dists[dists.length - 1];
      if (totalLen < 12) continue;

      const roadWidth = road.width || (isPedestrian ? 3 : 6);
      const textHalfWidth = Math.min(roadWidth * 0.65, 3.2) / 2;
      const aspect = Math.max(128, Math.min(1024, Math.ceil(normName.length * 36 + 56))) / 64;
      const labelLen = Math.min(textHalfWidth * 2 * aspect, totalLen * 0.85);

      if (labelLen < 8) continue;

      // Determine label anchor intervals along road
      const anchorDistances: number[] = [];
      if (totalLen < 120) {
        anchorDistances.push((totalLen - labelLen) / 2);
      } else {
        const step = Math.max(140, labelLen * 2.5);
        for (let d = 40; d + labelLen <= totalLen - 20; d += step) {
          anchorDistances.push(d);
        }
      }

      for (const startDist of anchorDistances) {
        const endDist = startDist + labelLen;
        const midDist = startDist + labelLen / 2;

        // Sample points within [startDist, endDist]
        const samplePts: Point2D[] = [];

        // Interpolate position at given distance along spline
        const getPointAtDist = (targetDist: number): Point2D => {
          if (targetDist <= 0) return { x: pts[0].x, z: pts[0].z };
          if (targetDist >= totalLen) return { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z };

          let idx = 0;
          while (idx < dists.length - 1 && dists[idx + 1] < targetDist) {
            idx++;
          }
          const t = (targetDist - dists[idx]) / (dists[idx + 1] - dists[idx] || 1);
          return {
            x: pts[idx].x + (pts[idx + 1].x - pts[idx].x) * t,
            z: pts[idx].z + (pts[idx + 1].z - pts[idx].z) * t,
          };
        };

        const midPt = getPointAtDist(midDist);

        // Check spatial proximity to avoid label collisions
        const isTooClose = placedLabels.some((p) => {
          const d = Math.hypot(midPt.x - p.x, midPt.z - p.z);
          return p.name === normName ? d < 110 : d < 45;
        });
        if (isTooClose) continue;

        // Sample vertices along label stretch at ~1.2m steps
        const numSlices = Math.max(6, Math.ceil(labelLen / 1.2));
        for (let s = 0; s <= numSlices; s++) {
          const currDist = startDist + (labelLen * s) / numSlices;
          samplePts.push(getPointAtDist(currDist));
        }

        if (samplePts.length < 2) continue;

        // Cartographic reading orientation check:
        // Ensure text reads left-to-right (dx >= 0) or bottom-to-top (dz <= 0)
        const pStart = samplePts[0];
        const pEnd = samplePts[samplePts.length - 1];
        const totalDx = pEnd.x - pStart.x;
        const totalDz = pEnd.z - pStart.z;
        let shouldReverse = false;
        if (Math.abs(totalDx) >= Math.abs(totalDz)) {
          if (totalDx < 0) shouldReverse = true;
        } else {
          if (totalDz > 0) shouldReverse = true;
        }
        if (shouldReverse) {
          samplePts.reverse();
        }

        // Compute cumulative distances along the oriented sample points
        const subDists: number[] = [0];
        for (let i = 0; i < samplePts.length - 1; i++) {
          subDists.push(subDists[i] + Math.hypot(samplePts[i + 1].x - samplePts[i].x, samplePts[i + 1].z - samplePts[i].z));
        }
        const totalSubLen = subDists[subDists.length - 1] || 1;

        // Build conformal 3D ribbon geometry
        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        for (let i = 0; i < samplePts.length; i++) {
          let tx = 0;
          let tz = 0;
          if (i === 0) {
            tx = samplePts[1].x - samplePts[0].x;
            tz = samplePts[1].z - samplePts[0].z;
          } else if (i === samplePts.length - 1) {
            tx = samplePts[i].x - samplePts[i - 1].x;
            tz = samplePts[i].z - samplePts[i - 1].z;
          } else {
            const tx1 = samplePts[i].x - samplePts[i - 1].x;
            const tz1 = samplePts[i].z - samplePts[i - 1].z;
            const tx2 = samplePts[i + 1].x - samplePts[i].x;
            const tz2 = samplePts[i + 1].z - samplePts[i].z;
            const len1 = Math.hypot(tx1, tz1) || 1;
            const len2 = Math.hypot(tx2, tz2) || 1;
            tx = tx1 / len1 + tx2 / len2;
            tz = tz1 / len1 + tz2 / len2;
          }
          const tLen = Math.hypot(tx, tz) || 1;
          tx /= tLen;
          tz /= tLen;

          // Normal perpendicular to road path
          const nx = -tz;
          const nz = tx;

          const u = subDists[i] / totalSubLen;

          const leftX = samplePts[i].x + nx * textHalfWidth;
          const leftZ = samplePts[i].z + nz * textHalfWidth;
          const rightX = samplePts[i].x - nx * textHalfWidth;
          const rightZ = samplePts[i].z - nz * textHalfWidth;

          const leftY = this.terrainY(elevation, leftX, leftZ, exaggeration) + yOffset;
          const rightY = this.terrainY(elevation, rightX, rightZ, exaggeration) + yOffset;

          // The canvas texture is drawn upright in screen space. On this ground
          // ribbon, the cross-track axis is the texture's vertical axis; use the
          // opposite UV order so labels are not rendered upside down.
          vertices.push(leftX, leftY, leftZ);
          uvs.push(u, 0.0);

          vertices.push(rightX, rightY, rightZ);
          uvs.push(u, 1.0);

          if (i < samplePts.length - 1) {
            const tl = i * 2;
            const tr = i * 2 + 1;
            const bl = (i + 1) * 2;
            const br = (i + 1) * 2 + 1;

            indices.push(tl, bl, tr);
            indices.push(tr, bl, br);
          }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const tex = getOrCreateTexture(normName);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2.5,
          polygonOffsetUnits: -2.5,
          side: THREE.DoubleSide,
        });
        this.labelMaterials.push(mat);

        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 995;
        this.labelGroup.add(mesh);

        placedLabels.push({ x: midPt.x, z: midPt.z, name: normName });
      }
    }
  }

  private decodeStreetName(value: string): string {
    try {
      if (!/[ÃÂâ€™â€œâ€\u009d]/.test(value)) return value;
      const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return value;
    }
  }

  public setShowStreetLabels(visible: boolean) {
    this.showStreetLabels = visible;
    this.labelGroup.visible = visible;
  }

  private mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
    if (geometries.length === 0) return null;
    if (geometries.length === 1) return geometries[0];

    let totalVertices = 0;
    let totalIndices = 0;
    let hasUv = false;

    for (const g of geometries) {
      totalVertices += g.attributes.position.count;
      if (g.index) totalIndices += g.index.count;
      if (g.attributes.uv) hasUv = true;
    }

    const mergedPositions = new Float32Array(totalVertices * 3);
    const mergedNormals = new Float32Array(totalVertices * 3);
    const mergedUvs = hasUv ? new Float32Array(totalVertices * 2) : null;
    const mergedIndices = new Uint32Array(totalIndices);

    let vOffset = 0;
    let iOffset = 0;
    let indexBase = 0;

    for (const g of geometries) {
      const pos = g.attributes.position.array;
      const norm = g.attributes.normal?.array;
      const uv = g.attributes.uv?.array;

      mergedPositions.set(pos, vOffset * 3);
      if (norm) {
        mergedNormals.set(norm, vOffset * 3);
      }
      if (mergedUvs && uv) {
        mergedUvs.set(uv, vOffset * 2);
      }

      if (g.index) {
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i++) {
          mergedIndices[iOffset + i] = idx[i] + indexBase;
        }
        iOffset += idx.length;
      }

      indexBase += g.attributes.position.count;
      vOffset += g.attributes.position.count;
      g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    if (mergedUvs) {
      merged.setAttribute('uv', new THREE.BufferAttribute(mergedUvs, 2));
    }
    merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
    return merged;
  }

  public setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  public clear() {
    const toRemove: THREE.Object3D[] = [];
    this.group.children.forEach((c) => {
      if (c !== this.labelGroup) toRemove.push(c);
    });
    toRemove.forEach((c) => {
      if (c instanceof THREE.Mesh && c.geometry) c.geometry.dispose();
      this.group.remove(c);
    });

    while (this.labelGroup.children.length > 0) {
      const c = this.labelGroup.children[0] as THREE.Mesh;
      if (c.geometry) c.geometry.dispose();
      this.labelGroup.remove(c);
    }
    this.labelMaterials.forEach((m) => {
      if (m.map) m.map.dispose();
      m.dispose();
    });
    this.labelMaterials = [];

    if (!this.group.children.includes(this.labelGroup)) {
      this.group.add(this.labelGroup);
    }
  }

  public dispose() {
    this.clear();
    this.roadMaterial.dispose();
    this.pedestrianMaterial.dispose();
    this.curbMaterial.dispose();
    this.markingsMaterial.dispose();
    this.asphaltTexture.dispose();
    this.pedestrianTexture.dispose();
    this.curbTexture.dispose();
  }
}
