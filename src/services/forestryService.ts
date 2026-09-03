import { MapData, Point2D, ResourceNode, RoadSegment, LanduseArea, BuildingPolygon } from '../types/map';
import { AdaptedBuilding, SettlementState } from '../types/settlement';
import { isBuildingOperational } from './buildingOperational';
import { isPointInsidePolygon } from './scavengingService';
import { depositWithinCapacity } from './stockpileCapacity';

// ================================================================
// §IFZ Forester's Hut & Sawmill — spatial tree work
// ================================================================
// The reference implements these as spatial jobs: a Forester's Hut plants and
// tends actual nearby trees (renewable wood), and a Sawmill cuts mature trees
// inside its working area. Terminus keeps its logs→lumber recipe chain as a
// documented extension, and adds the real mechanic on top: staffed huts regrow
// depleted wood nodes and plant new saplings inside their working radius, and
// staffed sawmills auto-cut the nearest mature tree inside theirs. No new
// labour pool or UI queue: the buildings' assigned workers ARE the forestry
// crew, and the wood lands in the stockpile through the normal capacity-aware
// deposit path (exactly like the gatherers' hauls). Night and colony alarms
// send the crews to shelter, so nothing happens then.
// ================================================================

export const FORESTER_WORK_RADIUS_M = 40;
export const SAWMILL_WORK_RADIUS_M = 30;
/** A hut keeps at least this many live trees in its radius before planting more. */
export const FORESTER_TARGET_LIVE_TREES = 8;
/** Average real-time seconds between brand-new sapling plantings per hut. */
export const FORESTER_PLANT_INTERVAL_SEC = 45;
/** Total tree-growth units the whole crew produces per second (split across the
 *  saplings/stumps it is tending — constant throughput, not per-tree). */
export const FORESTER_GROWTH_UNITS_PER_WORKER_SEC = 0.05;
/** Mature wood a single sawmill worker converts per second. */
export const SAWMILL_CUT_RATE_PER_WORKER = 1.6;
export const SAPLING_MAX_MIN = 6;
export const SAPLING_MAX_MAX = 10;
/** A planted sapling starts with this much early growth. */
export const SAPLING_INITIAL_AMOUNT = 1;

const WOOD_TREE_TYPES = new Set(['tree', 'tree_large']);

function isWoodTree(n: ResourceNode): boolean {
  return n.type === 'wood' && WOOD_TREE_TYPES.has(n.subType);
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function isInAnyPolygon(pt: Point2D, polys: (Point2D[] | undefined)[]): boolean {
  for (const poly of polys) {
    if (poly && poly.length >= 3 && isPointInsidePolygon(pt, poly)) return true;
  }
  return false;
}

function isInWater(pt: Point2D, landuse: LanduseArea[]): boolean {
  return isInAnyPolygon(
    pt,
    landuse.filter((l) => l.type === 'water').map((l) => l.polygon)
  );
}

/** Shortest distance from a point to a road polyline. */
function roadDistanceM(pt: Point2D, roads: RoadSegment[]): number {
  let best = Infinity;
  for (const r of roads) {
    const pts = r.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const lenSq = abx * abx + abz * abz;
      let t = 0;
      if (lenSq > 0) {
        t = ((pt.x - a.x) * abx + (pt.z - a.z) * abz) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const d = Math.hypot(pt.x - (a.x + t * abx), pt.z - (a.z + t * abz));
      if (d < best) best = d;
    }
  }
  return best === Infinity ? Infinity : best;
}

/** Find a clear spot for a new sapling inside the hut's working radius. */
function findPlantSpot(
  center: Point2D,
  radius: number,
  buildings: BuildingPolygon[],
  freestanding: AdaptedBuilding[],
  roads: RoadSegment[],
  landuse: LanduseArea[],
  nodes: ResourceNode[],
  rng: () => number
): Point2D | null {
  const blockedPolys = [
    ...buildings.map((b) => b.polygon),
    ...freestanding.map((b) => b.polygon),
  ];
  for (let attempt = 0; attempt < 60; attempt++) {
    const angle = rng() * Math.PI * 2;
    const distR = 3 + rng() * Math.max(1, radius - 3);
    const pt = { x: center.x + Math.cos(angle) * distR, z: center.z + Math.sin(angle) * distR };
    if (isInAnyPolygon(pt, blockedPolys)) continue;
    if (landuse.length > 0 && isInWater(pt, landuse)) continue;
    if (roads.length > 0 && roadDistanceM(pt, roads) < 3.5) continue;
    if (nodes.some((n) => dist(n.position, pt) < 3)) continue;
    return pt;
  }
  return null;
}

export interface ForestryTickResult {
  newState: SettlementState;
  mapData: MapData;
}

/**
 * Runs the spatial forestry stage. Buildings under construction or under
 * repair are not operational and take no part; crews shelter at night/alarm.
 */
export function tickForestryWork(
  state: SettlementState,
  mapData: MapData,
  deltaSec: number,
  isNight: boolean = false,
  alarmActive: boolean = false
): ForestryTickResult {
  if (isNight || alarmActive || deltaSec <= 0) {
    return { newState: state, mapData };
  }

  const freestanding = state.freestandingBuildings || [];
  const operational = [
    ...[...state.adaptedBuildings.values()].filter((b) => isBuildingOperational(b)),
    ...freestanding.filter((b) => isBuildingOperational(b)),
  ];
  const foresters = operational.filter((b) => b.typeId === 'foresters_hut');
  const sawmills = operational.filter((b) => b.typeId === 'sawmill');
  if (foresters.length === 0 && sawmills.length === 0) {
    return { newState: state, mapData };
  }

  const nodes: ResourceNode[] = mapData.resourceNodes.map((n) => ({ ...n }));
  let plantedThisTick = 0;
  let lcgState = Math.floor(Math.random() * 1e6) || 7;
  const rng = () => {
    lcgState = (lcgState * 9301 + 49297) % 233280;
    return lcgState / 233280;
  };

  for (const hut of foresters) {
    const workers = Math.max(0, hut.assignedWorkers || 0);
    if (workers <= 0) continue; // an unstaffed hut does not manage the forest
    const center = hut.position || { x: 0, z: 0 };
    const radius = FORESTER_WORK_RADIUS_M;
    const inRadius = nodes.filter(
      (n) => isWoodTree(n) && dist(n.position, center) <= radius
    );

    // 1. Replant stumps: every depleted tree inside the radius becomes a
    //    tended sapling again (the crew's replanting work).
    for (const n of inRadius) {
      if (n.amount <= 0 || n.isDepleted) {
        n.amount = SAPLING_INITIAL_AMOUNT;
        n.isDepleted = false;
        n.source = 'forester';
      }
    }

    // 2. Growth: the crew's output is a fixed budget split evenly across every
    //    under-grown tree it manages (watering rounds — constant throughput).
    const growing = inRadius.filter((n) => n.amount < n.maxAmount);
    const budget = workers * FORESTER_GROWTH_UNITS_PER_WORKER_SEC * deltaSec;
    if (growing.length > 0) {
      const share = budget / growing.length;
      for (const n of growing) {
        n.amount = Math.min(n.maxAmount, n.amount + share);
        n.isDepleted = false;
      }
    }

    // 3. Plant brand-new saplings when the radius is thin. Probabilistic with
    //    an average cadence of FORESTER_PLANT_INTERVAL_SEC per hut; a single
    //    long tick may allow several planting attempts.
    const liveTrees = inRadius.filter((n) => n.amount > 0).length;
    if (liveTrees < FORESTER_TARGET_LIVE_TREES) {
      const attempts = Math.max(
        1,
        Math.ceil(deltaSec / FORESTER_PLANT_INTERVAL_SEC)
      );
      for (let a = 0; a < attempts; a++) {
        if (rng() < 0.65) {
          const spot = findPlantSpot(
            center,
            radius,
            mapData.buildings,
            freestanding,
            mapData.roads || [],
            mapData.landuse || [],
            nodes,
            rng
          );
          if (!spot) break;
          const maxAmount =
            SAPLING_MAX_MIN +
            Math.floor(rng() * (SAPLING_MAX_MAX - SAPLING_MAX_MIN + 1));
          nodes.push({
            id: `forest_${Date.now()}_${plantedThisTick++}`,
            type: 'wood',
            subType: 'tree',
            position: spot,
            heightOffset: 0,
            rotation: rng() * Math.PI * 2,
            scale: 0.4 + rng() * 0.6,
            source: 'forester',
            amount: SAPLING_INITIAL_AMOUNT,
            maxAmount,
            isDepleted: false,
          });
        }
      }
    }
  }

  // Sawmill auto-cut: the crew mills the NEAREST mature tree inside the
  // working radius into wood, deposited through the capacity-aware path — a
  // full stockpile pauses the saw rather than felling trees it cannot store.
  let stock = state.stockpile;
  let overflowUnits = 0;
  let sawmillPausedFull = false;
  for (const mill of sawmills) {
    if (sawmillPausedFull) break;
    const workers = Math.max(0, mill.assignedWorkers || 0);
    if (workers <= 0) continue; // an unstaffed sawmill idles
    const center = mill.position || { x: 0, z: 0 };
    const cuttable = nodes
      .filter(
        (n) =>
          isWoodTree(n) &&
          n.amount > 0 &&
          dist(n.position, center) <= SAWMILL_WORK_RADIUS_M
      )
      .sort((a, b) => dist(a.position, center) - dist(b.position, center));
    if (cuttable.length === 0) continue;

    let remaining = workers * SAWMILL_CUT_RATE_PER_WORKER * deltaSec;
    for (const n of cuttable) {
      if (remaining <= 0) break;
      const take = Math.min(n.amount, remaining);
      const { stockpile, overflow } = depositWithinCapacity(
        stock,
        state.totalStorageCapacity ?? Infinity,
        { materials: { wood: take } }
      );
      stock = stockpile;
      // Only fell what actually landed in storage: a full stockpile pauses the
      // saw rather than felling timber it cannot store (no partial waste).
      const overflowWood = (overflow.materials && overflow.materials.wood) || 0;
      const depositedWood = take - overflowWood;
      if (depositedWood > 0) {
        n.amount = Math.max(0, n.amount - depositedWood);
        n.isDepleted = n.amount <= 0;
        remaining -= depositedWood;
      }
      if (overflowWood > 0) {
        sawmillPausedFull = true;
        overflowUnits += 1; // surfaced through the header's overflow warning
        break;
      }
    }
  }

  const newState: SettlementState = {
    ...state,
    stockpile: stock,
    overflowLootUnits: (state.overflowLootUnits || 0) + overflowUnits,
  };

  return {
    newState,
    mapData: { ...mapData, resourceNodes: nodes },
  };
}
