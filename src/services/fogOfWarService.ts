import { TacticalSquadUnit, ZombieLair } from '../types/combat';
import { MapData, Point2D } from '../types/map';
import { HiddenSurvivorGroup } from '../types/population';
import { RivalHideout } from '../types/rivalFaction';
import { AdaptedBuilding, DeconstructionJob, FogOfWarState, SettlementState } from '../types/settlement';
import { WorldVehicle } from '../types/vehicle';

// Per-source vision radii (§3.5). Squads scout the furthest; buildings reveal a
// permanent perimeter; construction/deconstruction sites and resource gathering
// crews reveal the workers physically present at the site.
export const VISION_RADII = {
  squad: 115,
  vehicle: 105,
  building: 110,
  hq: 140,
  worker: 75,
} as const;

export type VisionSourceKind = keyof typeof VISION_RADII;

export interface VisionSource {
  x: number;
  z: number;
  radius: number;
  kind: VisionSourceKind;
}

export type FogCellClass = 'unexplored' | 'explored' | 'visible';

export interface FogGridInfo {
  cellSize: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
}

const DEFAULT_CELL_SIZE = 20;

/**
 * Creates the fog grid covering the whole visible terrain. The grid is a square
 * centered on the map origin matching the terrain plane extent (radius * 4), so
 * there is no un-fogged "bright rim" beyond the local zone.
 */
export function createFogGrid(mapData: MapData): FogOfWarState {
  const extent = Math.max(1300, mapData.radius * 2);
  const cellSize = DEFAULT_CELL_SIZE;
  const cols = Math.ceil((extent * 2) / cellSize);
  const rows = Math.ceil((extent * 2) / cellSize);

  return {
    cellSize,
    minX: -extent,
    minZ: -extent,
    cols,
    rows,
    explored: new Array<number>(cols * rows).fill(0),
  };
}

export function ensureFogGrid(existing: FogOfWarState | undefined, mapData: MapData): FogOfWarState {
  if (existing && existing.cols > 0 && existing.rows > 0) return existing;
  return createFogGrid(mapData);
}

export function cellIndexOf(grid: FogGridInfo, x: number, z: number): number {
  const col = Math.floor((x - grid.minX) / grid.cellSize);
  const row = Math.floor((z - grid.minZ) / grid.cellSize);
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return -1;
  return row * grid.cols + col;
}

export function isCellExplored(grid: FogOfWarState, index: number): boolean {
  if (index < 0 || index >= grid.explored.length) return false;
  return grid.explored[index] === 1;
}

/**
 * Computes the union of vision sources for the settlement: player squads
 * (wherever they are), player vehicles, owned/adapted buildings, and the workers
 * physically present at in-progress construction/deconstruction sites. Before HQ
 * establishment this returns no sources, leaving the entire map covered.
 */
export function computeVisionSources(
  settlement: SettlementState,
  squads: TacticalSquadUnit[],
  vehicles: WorldVehicle[]
): VisionSource[] {
  const sources: VisionSource[] = [];

  // 1. Squad vision (active and alive squads)
  for (const squad of squads) {
    if (squad && squad.currentHp > 0) {
      sources.push({ x: squad.x, z: squad.z, radius: VISION_RADII.squad, kind: 'squad' });
    }
  }

  // 2. Vehicles: ONLY vehicles occupied/mounted by a player squad reveal the map
  for (const vehicle of vehicles) {
    if (vehicle && vehicle.condition !== 'wrecked' && vehicle.assignedSquadId) {
      sources.push({
        x: vehicle.position.x,
        z: vehicle.position.z,
        radius: VISION_RADII.vehicle,
        kind: 'vehicle',
      });
    }
  }

  // 3. Colony Headquarters reveals a large, crystal-clear defensive perimeter
  if (settlement.hq?.center) {
    sources.push({
      x: settlement.hq.center.x,
      z: settlement.hq.center.z,
      radius: VISION_RADII.hq,
      kind: 'hq',
    });
  }

  // 4. Adapted & Freestanding buildings (all adapted/built structures reveal fog)
  const adaptedList: AdaptedBuilding[] = settlement.adaptedBuildings instanceof Map
    ? Array.from(settlement.adaptedBuildings.values())
    : typeof settlement.adaptedBuildings === 'object' && settlement.adaptedBuildings !== null
      ? (Object.values(settlement.adaptedBuildings) as AdaptedBuilding[])
      : [];

  const freestandingList: AdaptedBuilding[] = Array.isArray(settlement.freestandingBuildings)
    ? settlement.freestandingBuildings
    : [];

  for (const b of [...adaptedList, ...freestandingList]) {
    if (!b) continue;
    let bx = b.position?.x ?? (b as any).center?.x;
    let bz = b.position?.z ?? (b as any).center?.z;

    // If position not directly stored, compute polygon centroid
    if ((bx === undefined || bz === undefined) && b.polygon && b.polygon.length > 0) {
      const sum = b.polygon.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 });
      bx = sum.x / b.polygon.length;
      bz = sum.z / b.polygon.length;
    }

    if (bx !== undefined && bz !== undefined) {
      sources.push({
        x: bx,
        z: bz,
        radius: VISION_RADII.building,
        kind: 'building',
      });
    }
  }

  // 5. Workers & Deconstruction jobs
  const deconstructList: DeconstructionJob[] = settlement.deconstructionJobs instanceof Map
    ? Array.from(settlement.deconstructionJobs.values())
    : typeof settlement.deconstructionJobs === 'object' && settlement.deconstructionJobs !== null
      ? (Object.values(settlement.deconstructionJobs) as DeconstructionJob[])
      : [];

  for (const job of deconstructList) {
    if (job?.position) {
      sources.push({ x: job.position.x, z: job.position.z, radius: VISION_RADII.worker, kind: 'worker' });
    }
  }

  // 6. Active resource work orders / gathering crews out in the field
  if (Array.isArray(settlement.resourceWorkOrders)) {
    for (const worker of settlement.resourceWorkOrders) {
      if (worker?.position) {
        sources.push({ x: worker.position.x, z: worker.position.z, radius: VISION_RADII.worker, kind: 'worker' });
      }
    }
  }

  // Before HQ establishment there must be no fallback reveal. The map remains
  // completely shrouded until the player establishes the headquarters.
  return sources;
}

/**
 * Returns the set of currently-visible cell indices (union of all source radii).
 */
export function computeVisibleCells(grid: FogGridInfo, sources: VisionSource[]): Set<number> {
  const visible = new Set<number>();
  for (const source of sources) {
    const r = source.radius;
    const minCol = Math.max(0, Math.floor((source.x - r - grid.minX) / grid.cellSize));
    const maxCol = Math.min(grid.cols - 1, Math.floor((source.x + r - grid.minX) / grid.cellSize));
    const minRow = Math.max(0, Math.floor((source.z - r - grid.minZ) / grid.cellSize));
    const maxRow = Math.min(grid.rows - 1, Math.floor((source.z + r - grid.minZ) / grid.cellSize));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cx = grid.minX + (col + 0.5) * grid.cellSize;
        const cz = grid.minZ + (row + 0.5) * grid.cellSize;
        const dx = cx - source.x;
        const dz = cz - source.z;
        if (dx * dx + dz * dz <= r * r) {
          visible.add(row * grid.cols + col);
        }
      }
    }
  }
  return visible;
}

/**
 * Three-state classification for a world point, matching §3.5:
 * unexplored (fully hidden), explored (dimmed "last known"), visible (live).
 */
export function classifyPoint(
  grid: FogOfWarState,
  visibleCells: Set<number>,
  x: number,
  z: number
): FogCellClass {
  const index = cellIndexOf(grid, x, z);
  if (index < 0) return 'unexplored';
  if (visibleCells.has(index)) return 'visible';
  if (isCellExplored(grid, index)) return 'explored';
  return 'unexplored';
}

/**
 * Persists currently-visible cells into the explored ("last known") grid.
 * Returns a new FogOfWarState only when new cells were revealed.
 */
export function markExploredCells(grid: FogOfWarState, visibleCells: Set<number>): FogOfWarState {
  let changed = false;
  for (const index of visibleCells) {
    if (grid.explored[index] !== 1) {
      grid.explored[index] = 1;
      changed = true;
    }
  }
  // Mutating the shared array in place is intentional here; the caller clones the
  // settlement state so this stays serializable per tick. Return the grid as-is.
  return grid;
}

function toEntries<K = any, V = any>(val: any): [K, V][] {
  if (!val) return [];
  if (val instanceof Map) return Array.from(val.entries());
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.entries(val) as [K, V][];
  return [];
}

/**
 * Survivor groups are discovered by scouting — a squad (not a passive building)
 * must have the group's building within its vision radius (§4.4, §3.5).
 * Returns the group ids that should be marked discovered this tick.
 */
export function discoverGroupsInVision(
  groups: Map<string | number, HiddenSurvivorGroup>,
  squads: TacticalSquadUnit[],
  mapData: MapData | null, additionalVisionSources: Point2D[] = []
): (string | number)[] {
  const discovered: (string | number)[] = [];
  if (!mapData || squads.length === 0) return discovered;

  const buildingCenters = new Map<string, { x: number; z: number }>();
  for (const b of mapData.buildings) {
    buildingCenters.set(String(b.id), b.center);
  }

  const entries = toEntries<string | number, HiddenSurvivorGroup>(groups);
  for (const [key, group] of entries) {
    if (!group || group.isDiscovered || group.isRecruited) continue;
    const center = buildingCenters.get(String(group.buildingId));
    if (!center) continue;

    for (const squad of squads) {
      if (!squad.isDeployed || squad.currentHp <= 0) continue;
      const dx = center.x - squad.x;
      const dz = center.z - squad.z;
      if (dx * dx + dz * dz <= VISION_RADII.squad * VISION_RADII.squad) { discovered.push(key); break; }
    }
    if (!discovered.includes(key)) for (const source of additionalVisionSources) {
      const dx=center.x-source.x,dz=center.z-source.z;
      if(dx*dx+dz*dz<=VISION_RADII.building*VISION_RADII.building){discovered.push(key);break;}
    }
  }

  return discovered;
}

/**
 * Rival Hideouts & zombie Lairs are also discovered by scouting (§5.2) — a squad
 * must bring the building within its vision radius before the threat is revealed
 * and rendered as a faction marker.
 */
export interface DiscoveredThreats {
  hideoutIds: (string | number)[];
  lairIds: (string | number)[];
}

export function discoverThreatsInVision(
  hideouts: Map<string | number, RivalHideout>,
  lairs: Map<string | number, ZombieLair>,
  squads: TacticalSquadUnit[],
  mapData: MapData | null
): DiscoveredThreats {
  const hideoutIds: (string | number)[] = [];
  const lairIds: (string | number)[] = [];
  if (!mapData || squads.length === 0) return { hideoutIds, lairIds };

  const buildingCenters = new Map<string, Point2D>();
  for (const b of mapData.buildings) buildingCenters.set(String(b.id), b.center);

  const squadNear = (center: Point2D | undefined) =>
    !!center &&
    squads.some(
      (sq) =>
        sq.isDeployed &&
        sq.currentHp > 0 &&
        Math.hypot(center.x - sq.x, center.z - sq.z) <= VISION_RADII.squad
    );

  const hideoutEntries = toEntries<string | number, RivalHideout>(hideouts);
  for (const [key, hideout] of hideoutEntries) {
    if (!hideout || hideout.isDiscovered || hideout.isCleared) continue;
    if (squadNear(buildingCenters.get(String(hideout.buildingId)))) hideoutIds.push(key);
  }

  const lairEntries = toEntries<string | number, ZombieLair>(lairs);
  for (const [key, lair] of lairEntries) {
    if (!lair || lair.isDiscovered || lair.isCleared) continue;
    if (squadNear(buildingCenters.get(String(lair.buildingId)))) lairIds.push(key);
  }

  return { hideoutIds, lairIds };
}
