import { BuildingCategory, BuildingPolygon, Point2D, WorldAreaBounds } from '../types/map';
import { SettlementState, SettlementStockpile } from '../types/settlement';
import { getStockpileUnits } from './settlementService';
import { SquadInventory, SquadLootItem } from '../types/population';
import { BuildingSearchState } from '../types/scavenging';
import { ArmorItemId, TacticalSquadUnit, WeaponItemId } from '../types/combat';
import { WorldVehicle } from '../types/vehicle';
import { depositItemsIntoVehicle, getVehicleInventoryCapacity } from './vehicleService';
import { getPrimaryHQ, isBuildingOperational, isBuildingFullyLooted, isHQBuilding } from './buildingOperational';

const DEFAULT_CAPACITY = 4;

/** One inventory slot represents one carried loot item stack. */
export function getSquadInventoryCapacity(squad: TacticalSquadUnit): number {
  return Math.max(0, squad.members.filter((member) => member.isAlive).length);
}

function currentItemsCount(items: SquadLootItem[]): number {
  return items.length;
}

/** Convert internal identifiers such as `canned_goods` or `food_canned` to UI text. */
export function formatLootLabel(label: string): string {
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const q = (label: string, quantity: number, weight = 1): SquadLootItem => ({
  id: `${label}_${Math.random().toString(36).slice(2)}`,
  kind: 'resource',
  label,
  quantity,
  weight,
});

const i = (kind: SquadLootItem['kind'], label: string, itemId: string, weight: number): SquadLootItem => ({
  id: `${label}_${Math.random().toString(36).slice(2)}`,
  kind,
  label,
  quantity: 1,
  weight,
  itemId,
});

export function createEmptySquadInventory(capacity = DEFAULT_CAPACITY): SquadInventory {
  return { capacity, used: 0, items: [] };
}

/**
 * Calculate 2D polygon footprint area in square meters.
 */
export function calculateBuildingFootprintArea(b: BuildingPolygon): number {
  if (b.polygon && b.polygon.length >= 3) {
    let sum = 0;
    for (let j = 0; j < b.polygon.length; j++) {
      const next = (j + 1) % b.polygon.length;
      sum += b.polygon[j].x * b.polygon[next].z - b.polygon[next].x * b.polygon[j].z;
    }
    const area = Math.abs(sum) / 2;
    if (area > 8) return Math.round(area);
  }
  return 180;
}

/**
 * The bigger the building (footprint area x number of floors), the longer it takes to search.
 * - Tiny shed (~10-40m², 1 floor): ~10 - 14s
 * - Small house (~40-100m², 1-2 floors): ~14 - 22s
 * - Large house / small shop (~100-300m², 2-3 floors): ~22 - 35s
 * - Supermarket / Warehouse / Hospital (~500-2500m², 2-3 floors): ~35 - 60s
 * - Huge multi-building complex (>3000m²): 60s (cap)
 */
export function getBuildingSearchDurationSec(b: BuildingPolygon): number {
  const footprint = calculateBuildingFootprintArea(b);
  const floors = Math.max(1, Math.round(b.levels || 1));
  const searchVolume = footprint * floors;
  // Keep building size meaningful, but make routine food/water runs viable:
  // small structures finish quickly while large complexes still take longer.
  const baseTime = 5 + Math.sqrt(searchVolume) * 0.8;
  return Math.min(42, Math.max(7, Math.round(baseTime)));
}

export function generateLootForBuilding(
  b: BuildingPolygon,
  resourceMultiplier = 1
): SquadLootItem[] {
  const r = (min: number, max: number) => Math.max(1, Math.round((min + Math.floor(Math.random() * (max - min + 1))) * resourceMultiplier));
  const items: SquadLootItem[] = [];

  switch (b.type) {
    case 'supermarket':
      items.push(q('canned_goods', r(4, 9), 1.2), q('bottled_water', r(3, 8), 1.0));
      if (Math.random() < 0.6) items.push(q('first_aid_kits', r(1, 2), 1.5));
      if (Math.random() < 0.4) items.push(q('dried_rations', r(3, 6), 0.8));
      break;
    case 'restaurant':
      items.push(q('dried_rations', r(3, 6), 0.8), q('bottled_water', r(2, 5), 1.0));
      if (Math.random() < 0.3) items.push(q('canned_goods', r(2, 4), 1.2));
      break;
    case 'pharmacy':
      items.push(q('sterile_bandages', r(3, 7), 0.4), q('first_aid_kits', r(1, 4), 1.5));
      if (Math.random() < 0.7) items.push(q('antibiotics', r(1, 3), 0.4));
      if (Math.random() < 0.6) items.push(q('painkillers', r(2, 4), 0.4));
      break;
    case 'hospital':
      items.push(
        q('first_aid_kits', r(2, 5), 1.5),
        q('sterile_bandages', r(4, 10), 0.4),
        q('antibiotics', r(2, 5), 0.4),
        q('painkillers', r(2, 5), 0.4)
      );
      break;
    case 'police':
      items.push(q('ammunition', r(14, 32), 0.15));
      if (Math.random() < 0.8) {
        const isShotgun = Math.random() < 0.55;
        items.push(i('weapon', isShotgun ? 'Shotgun' : 'Pistol', isShotgun ? 'shotgun' : 'pistol', 3.2));
      }
      if (Math.random() < 0.5) {
        items.push(i('armor', 'Riot Vest', 'riot_vest', 4.0));
      }
      break;
    case 'gas_station':
      items.push(q('gasoline', r(12, 32), 0.5), q('diesel', r(6, 18), 0.5));
      if (Math.random() < 0.4) items.push(q('canned_goods', r(2, 5), 1.2));
      break;
    case 'warehouse':
    case 'industrial':
      items.push(q('metal', r(6, 16), 1.5), q('wood', r(5, 14), 1.2), q('gasoline', r(4, 12), 0.5));
      if (Math.random() < 0.6) items.push(q('scrap', r(4, 12), 0.9));
      if (Math.random() < 0.5) items.push(q('tools', r(2, 6), 1.8));
      if (Math.random() < 0.35) items.push(i('weapon', 'Fire Axe', 'axe', 2.0));
      if (Math.random() < 0.25) items.push(q('bricks', r(4, 10), 2.0));
      if (Math.random() < 0.3) items.push(q('logs', r(3, 8), 1.2));
      break;
    case 'school':
      // Guaranteed 1-3 scientific materials for Research Center construction & ongoing science
      items.push(
        q('scientific_materials', r(1, 3), 0.8),
        q('canned_goods', r(2, 6), 1.2),
        q('bottled_water', r(2, 6), 1.0),
        q('sterile_bandages', r(1, 4), 0.4)
      );
      if (Math.random() < 0.45) items.push(q('first_aid_kits', r(1, 3), 1.5));
      if (Math.random() < 0.35) items.push(q('tools', r(1, 3), 1.8));
      break;
    case 'commercial':
      items.push(q('canned_goods', r(2, 5), 1.2), q('bottled_water', r(2, 4), 1.0));
      if (Math.random() < 0.45) items.push(q('tools', r(1, 3), 1.8));
      if (Math.random() < 0.4) items.push(q('scrap', r(3, 8), 0.9));
      if (Math.random() < 0.25) items.push(q('first_aid_kits', r(1, 2), 1.5));
      break;
    default:
      items.push(q('canned_goods', r(1, 4), 1.2), q('bottled_water', r(1, 3), 1.0));
      if (Math.random() < 0.35) items.push(q('ammunition', r(2, 8), 0.15));
      if (Math.random() < 0.25) items.push(q('wood', r(2, 6), 1.2));
      if (Math.random() < 0.2) items.push(q('tools', r(1, 3), 1.8));
      if (Math.random() < 0.2) items.push(q('scrap', r(2, 6), 0.9));
  }
  return items;
}

export function createBuildingSearchState(
  buildingId: string | number,
  building?: BuildingPolygon,
  resourceMultiplier = 1
): BuildingSearchState {
  const lootPool = building ? generateLootForBuilding(building, resourceMultiplier) : [];
  const totalDuration = building ? getBuildingSearchDurationSec(building) : 15;
  return {
    buildingId,
    observed: false,
    searched: false,
    searchProgress: 0,
    totalDurationSec: totalDuration,
    elapsedDurationSec: 0,
    loot: lootPool,
    unlootedItems: [...lootPool],
    lootedItems: [],
  };
}

export function ensureBuildingSearchStates(
  state: SettlementState,
  buildings: BuildingPolygon[],
  resourceMultiplier = 1
): SettlementState {
  const m = new Map(state.buildingSearches || new Map());
  for (const b of buildings) {
    const freshDuration = getBuildingSearchDurationSec(b);
    const existing = m.get(b.id);
    if (!existing) {
      m.set(b.id, createBuildingSearchState(b.id, b, resourceMultiplier));
    } else {
      // If an existing unsearched building is a school whose loot doesn't yet contain scientific_materials,
      // refresh its loot pool so active games immediately gain scientific materials to scavenge.
      const needsLootRefresh =
        !existing.searched &&
        existing.searchProgress === 0 &&
        (!existing.lootedItems || existing.lootedItems.length === 0) &&
        b.type === 'school' &&
        !existing.loot.some((l) => l.label === 'scientific_materials');

      if (needsLootRefresh) {
        const freshLoot = generateLootForBuilding(b, resourceMultiplier);
        m.set(b.id, {
          ...existing,
          totalDurationSec: freshDuration,
          loot: freshLoot,
          unlootedItems: [...freshLoot],
        });
      } else if (existing.totalDurationSec !== freshDuration) {
        // Keep search progress/loot state but refresh the duration so size changes take effect
        m.set(b.id, { ...existing, totalDurationSec: freshDuration });
      }
    }
  }
  return { ...state, buildingSearches: m };
}

export function isPointInsidePolygon(pt: Point2D, poly?: Point2D[]): boolean {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    const intersect = zi > pt.z !== zj > pt.z && pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * True when a ground point lies inside a drag-box area. Prefers the exact
 * perspective-correct quad (`bounds.polygon`) — matching what the player sees
 * under the drawn box — and falls back to the axis-aligned box when no polygon
 * was provided.
 */
export function isPointInArea(pt: Point2D, bounds: WorldAreaBounds): boolean {
  if (bounds.polygon && bounds.polygon.length >= 3) {
    return isPointInsidePolygon(pt, bounds.polygon);
  }
  return pt.x >= bounds.minX && pt.x <= bounds.maxX && pt.z >= bounds.minZ && pt.z <= bounds.maxZ;
}

export function isSquadInsideBuilding(pos: Point2D, b: BuildingPolygon): boolean {
  if (b.polygon && b.polygon.length >= 3) {
    return isPointInsidePolygon(pos, b.polygon);
  }
  const distCenter = Math.hypot(pos.x - b.center.x, pos.z - b.center.z);
  return distCenter <= 3.5;
}

export function isSquadAtBuilding(pos: Point2D, b: BuildingPolygon, maxMargin = 0): boolean {
  if (isPointInsidePolygon(pos, b.polygon)) return true;
  if (maxMargin > 0) {
    const distCenter = Math.hypot(pos.x - b.center.x, pos.z - b.center.z);
    const bldgRadius =
      b.polygon && b.polygon.length > 0
        ? Math.max(...b.polygon.map((p) => Math.hypot(p.x - b.center.x, p.z - b.center.z)))
        : 6;
    return distCenter <= bldgRadius + maxMargin;
  }
  const distCenter = Math.hypot(pos.x - b.center.x, pos.z - b.center.z);
  return distCenter <= 3.5;
}

/**
 * Locate the nearest valid storage dropoff:
 * 1. A completed adapted or freestanding 'storage_depot'
 * 2. Or the HQ fortress if no storage depot has been constructed
 */
export function findNearestStorageDropoff(
  settlement: SettlementState,
  pos: Point2D,
  buildings?: BuildingPolygon[]
): { x: number; z: number; name: string; buildingId?: string | number } {
  let best: { x: number; z: number; name: string; buildingId?: string | number; dist: number } | null = null;

  // Check adapted storage depots
  if (settlement.adaptedBuildings) {
    const adaptedList =
      settlement.adaptedBuildings instanceof Map
        ? Array.from(settlement.adaptedBuildings.values())
        : Object.values(settlement.adaptedBuildings);

    for (const bldg of adaptedList as any[]) {
      if (
        (bldg.typeId === 'storage_depot' || bldg.typeId === 'warehouse') &&
        isBuildingOperational(bldg)
      ) {
        const center =
          bldg.center ||
          (buildings ? buildings.find((b) => String(b.id) === String(bldg.buildingId))?.center : null);
        if (center) {
          const dist = Math.hypot(pos.x - center.x, pos.z - center.z);
          if (!best || dist < best.dist) {
            best = {
              x: center.x,
              z: center.z,
              name: bldg.customName || 'Storage Depot',
              buildingId: bldg.buildingId,
              dist,
            };
          }
        }
      }
    }
  }

  // Check freestanding storage depots (canonical Warehouse or legacy alias).
  // Only COMPLETED depots qualify — a blueprint / under-construction depot
  // isn't a usable dropoff yet.
  if (settlement.freestandingBuildings) {
    for (const bldg of settlement.freestandingBuildings) {
      if (
        (bldg.typeId === 'storage_depot' || bldg.typeId === 'warehouse') &&
        isBuildingOperational(bldg) &&
        bldg.position
      ) {
        const dist = Math.hypot(pos.x - bldg.position.x, pos.z - bldg.position.z);
        if (!best || dist < best.dist) {
          best = {
            x: bldg.position.x,
            z: bldg.position.z,
            name: bldg.name || 'Storage Depot',
            buildingId: bldg.buildingId,
            dist,
          };
        }
      }
    }
  }

  if (best) {
    return { x: best.x, z: best.z, name: best.name, buildingId: best.buildingId };
  }

  // Fallback to HQ Fortress
  const primaryHQ = getPrimaryHQ(settlement);
  if (primaryHQ?.center) {
    return {
      x: primaryHQ.center.x,
      z: primaryHQ.center.z,
      name: primaryHQ.buildingName || 'HQ Fortress',
      buildingId: primaryHQ.buildingId,
    };
  }

  return { x: 0, z: 0, name: 'HQ Fortress' };
}

/**
 * Initializes or starts a building search order.
 */
export function startBuildingSearch(
  state: SettlementState,
  squadId: string,
  pos: Point2D,
  b: BuildingPolygon,
  radius = 18,
  resourceMultiplier = 1
): { success: boolean; newState: SettlementState; error?: string; searchState?: BuildingSearchState } {
  if (isHQBuilding(state, b.id)) {
    return {
      success: false,
      newState: state,
      error: 'This is your headquarters — command infrastructure is never scavenged.',
    };
  }
  const sq = state.squads.find((s) => s.id === squadId);
  if (!sq) return { success: false, newState: state, error: 'Squad not found.' };

  const m = new Map(state.buildingSearches || new Map());
  let cur = m.get(b.id);
  if (!cur) {
    cur = createBuildingSearchState(b.id, b, resourceMultiplier);
    m.set(b.id, cur);
  }

  if (cur.searched) {
    return {
      success: false,
      newState: state,
      error: 'This building has already been searched and cleared.',
    };
  }

  if (!isSquadAtBuilding(pos, b, radius)) {
    const d = Math.hypot(pos.x - b.center.x, pos.z - b.center.z);
    return {
      success: false,
      newState: state,
      error: `Squad is ${Math.round(d)}m away. Move closer.`,
    };
  }

  const updatedSearch: BuildingSearchState = {
    ...cur,
    observed: true,
    searchStartedAt: cur.searchStartedAt || Date.now(),
    totalDurationSec: cur.totalDurationSec || getBuildingSearchDurationSec(b),
    unlootedItems: cur.unlootedItems || [...cur.loot],
    lootedItems: cur.lootedItems || [],
  };
  m.set(b.id, updatedSearch);

  return {
    success: true,
    newState: {
      ...state,
      buildingSearches: m,
    },
    searchState: updatedSearch,
  };
}

export interface ScavengeTickResult {
  newState: SettlementState;
  updatedSquad: TacticalSquadUnit;
  itemsFoundThisTick: SquadLootItem[];
  isCompleted: boolean;
  inventoryFull: boolean;
  dropoff?: { x: number; z: number; name: string };
  searchProgress: number;
}

/**
 * Progresses scavenging over time for a squad within a building's footprint.
 * - Searches over time with a progress bar (0% -> 100%).
 * - The bigger the building footprint, the longer it takes.
 * - Items are discovered incrementally over time as milestones are reached.
 * - If squad's inventory reaches capacity, automatically paths back to the storage building (or HQ).
 */
export function tickBuildingScavengeProgress(
  state: SettlementState,
  squad: TacticalSquadUnit,
  building: BuildingPolygon,
  deltaSec: number,
  buildings?: BuildingPolygon[]
): ScavengeTickResult {
  const m = new Map(state.buildingSearches || new Map());
  let search = m.get(building.id);

  if (!search) {
    search = createBuildingSearchState(building.id, building);
  }

  const totalDuration = getBuildingSearchDurationSec(building);
  const unlooted = search.unlootedItems ? [...search.unlootedItems] : [...search.loot];
  const looted = search.lootedItems ? [...search.lootedItems] : [];
  const totalItemsCount = search.loot.length;
  const previouslyResolvedCount = Math.max(0, totalItemsCount - unlooted.length);

  // Scavenging is a squad effort; the Expedition Center is a strategic
  // logistics HQ (caravan coordination), not a search-speed buff.
  let elapsed = (search.elapsedDurationSec || 0) + deltaSec;
  let progress = Math.min(100, Math.round((elapsed / totalDuration) * 100));

  // Determine newly unlocked items this tick based on progress milestones
  const itemsFoundThisTick: SquadLootItem[] = [];
  const slotCapacity = getSquadInventoryCapacity(squad);
  const existingInv = state.squadInventories?.[squad.squadId];
  // Keep the authoritative carried inventory in sync with the tactical unit.
  // Combat ticks can replace the unit object, so never recreate an occupied
  // inventory from the unit's legacy weight fields.
  const inv = existingInv || createEmptySquadInventory(slotCapacity);
  let currentUsed = currentItemsCount(inv.items);
  let currentItems = [...inv.items];
  const capacity = slotCapacity;
  let inventoryFull = false;

  if (unlooted.length > 0 && totalItemsCount > 0) {
    // Each item is uncovered when progress crosses (itemIndex + 0.35) / totalItemsCount * 100
    const remainingUnlooted: SquadLootItem[] = [];

    for (let idx = 0; idx < unlooted.length; idx++) {
      const item = unlooted[idx];
      const itemTotalIndex = previouslyResolvedCount + idx;
      const milestoneProgress = Math.round(((itemTotalIndex + 0.4) / totalItemsCount) * 100);

      if (progress >= milestoneProgress && !inventoryFull) {
        if (currentUsed < capacity) {
          currentUsed += 1;
          currentItems.push(item);
          looted.push(item);
          itemsFoundThisTick.push(item);
        } else {
          // Inventory is full! Item remains in building for future scavenging
          remainingUnlooted.push(item);
          inventoryFull = true;
        }
      } else {
        remainingUnlooted.push(item);
      }
    }

    search.unlootedItems = remainingUnlooted;
  }

  // Check if inventory has reached or exceeded capacity
  if (currentUsed >= capacity) {
    inventoryFull = true;
  }

  // The search completes once progress reaches 100% — even if the squad's
  // carry capacity forced some loot to be left behind. Leftovers stay in the
  // building so a later run can collect them (searched stays false until the
  // building is fully cleared, keeping it eligible for the scavenge queue),
  // and the squad returns with its partial haul instead of being stuck in the
  // searching state forever.
  const isCompleted = progress >= 100;

  search.elapsedDurationSec = elapsed;
  search.totalDurationSec = totalDuration;
  search.searchProgress = progress;
  search.lootedItems = looted;
  search.observed = true;
  if (isCompleted && (search.unlootedItems?.length ?? 0) === 0) {
    search.searched = true;
  }
  m.set(building.id, search);

  // Update squad state and destination
  let nextSquad: TacticalSquadUnit = {
    ...squad,
    searchProgress: progress,        currentWeightKg: currentUsed,
  };

  let dropoffDestination: { x: number; z: number; name: string } | undefined;

  const assignedVeh = squad.assignedVehicleId
    ? state.vehicles?.find((v) => v.id === squad.assignedVehicleId && v.condition !== 'wrecked')
    : null;

  // A squad must finish searching its current building even when its carry
  // slots fill. Once progress reaches 100%, the remaining items stay in the
  // building and the squad returns with the partial haul.
  const shouldReturnAfterSearch = inventoryFull && isCompleted;

  // Mounted squads deposit their haul into the vehicle's cargo bay the moment
  // the building is cleared, so the expedition can keep driving to the next
  // building without shuttling home after every structure.
  let updatedVehicles: WorldVehicle[] | undefined;

  if (shouldReturnAfterSearch || isCompleted) {
    if (assignedVeh) {
      // 1. Transfer squad loot into the cargo bay (up to its capacity).
      const transfer = depositItemsIntoVehicle(assignedVeh, currentItems);
      let updatedVehicle = transfer.vehicle;
      const vehicleFull = (updatedVehicle.inventory || []).length >= getVehicleInventoryCapacity(updatedVehicle);
      // Whatever didn't fit stays in the squad's backpack.
      currentItems = transfer.overflow;
      currentUsed = transfer.overflow.length;
      inventoryFull = currentUsed >= capacity;
      updatedVehicles = (state.vehicles || []).map((v) => (v.id === updatedVehicle.id ? updatedVehicle : v));

      if (vehicleFull) {
        // 2a. Cargo bay is full -> after the squad boards, the vehicle drives
        // home to HQ/storage so BOTH the backpack and the bay are deposited.
        // IFZ storage gate: skip the home trip when the settlement cannot take
        // the combined haul — the bay keeps the loot until storage frees and
        // the player (or a later deposit run) drives home.
        const combinedHaul = [...currentItems, ...(updatedVehicle.inventory || [])];
        if (hasStockpileRoomForHaul(state, combinedHaul)) {
          updatedVehicle = { ...updatedVehicle, autoDepotReturn: true };
          updatedVehicles = (state.vehicles || []).map((v) => (v.id === updatedVehicle.id ? updatedVehicle : v));
          dropoffDestination = findNearestStorageDropoff(
            state,
            { x: assignedVeh.position.x, z: assignedVeh.position.z },
            buildings
          );
        }
      }

      // 2b. Walk back to the parked vehicle and board it. The simulation loop
      // then drives it either home (bay full) or to the next queued building.
      nextSquad = {
        ...nextSquad,
        state: 'returning',
        targetPos: { x: assignedVeh.position.x, z: assignedVeh.position.z },
        pendingMountVehicleId: assignedVeh.id,
        targetBuildingId: null,
        targetBuildingName: `Return to ${assignedVeh.name}`,
        searchProgress: undefined,
        pathState: undefined,
      };
    } else if (shouldReturnAfterSearch || currentUsed > 0) {
      // IFZ storage gate: only trek home when the settlement can actually take
      // the haul. If storage is full the squad does NOT return — it keeps the
      // loot in its backpack out in the field (holdHaul) until storage frees,
      // avoiding the pointless round-trip that would just strand the load at a
      // full depot.
      if (!hasStockpileRoomForHaul(state, currentItems)) {
        nextSquad = {
          ...nextSquad,
          state: 'idle',
          holdHaul: true,
          targetPos: null,
          targetBuildingId: null,
          targetBuildingName: null,
          searchProgress: undefined,
          pathState: undefined,
        };
      } else {
        // Inventory full or carrying loot -> Auto-path on foot to storage depot
        // (or HQ if none)
        dropoffDestination = findNearestStorageDropoff(state, { x: squad.x, z: squad.z }, buildings);
        nextSquad = {
          ...nextSquad,
          state: 'returning',
          targetPos: { x: dropoffDestination.x, z: dropoffDestination.z },
          targetBuildingId: null,
          targetBuildingName: dropoffDestination.name,
          searchProgress: undefined,
          pathState: undefined,
        };
      }
    } else {
      // Empty haul and nothing left to carry -> go idle.
      nextSquad = {
        ...nextSquad,
        state: 'idle',
        targetBuildingId: null,
        targetBuildingName: null,
        searchProgress: undefined,
        pathState: undefined,
      };
    }
  } else {
    // Still scavenging in progress. A full backpack does not interrupt the
    // current building search; it only prevents additional loot pickup.
    nextSquad = {
      ...nextSquad,
      state: 'searching',
    };
  }

  const newState: SettlementState = {
    ...state,
    buildingSearches: m,
    ...(updatedVehicles ? { vehicles: updatedVehicles } : {}),
    squadInventories: {
      ...(state.squadInventories || {}),
      [squad.squadId]: {
        ...inv,
        capacity,
        used: currentUsed,
        items: currentItems,
      },
    },
  };

  return {
    newState,
    updatedSquad: nextSquad,
    itemsFoundThisTick,
    isCompleted,
    inventoryFull,
    dropoff: dropoffDestination,
    searchProgress: progress,
  };
}

/** Adds a single loot stack into the settlement stockpile. */
function addLootToStockpile(stock: any, l: SquadLootItem): void {
  switch (l.label) {
    case 'canned_goods':
      stock.food.canned_goods += l.quantity;
      break;
    case 'dried_rations':
      stock.food.dried_rations += l.quantity;
      break;
    case 'bottled_water':
      stock.water.bottled_water += l.quantity;
      break;
    case 'first_aid_kits':
      stock.medical.first_aid_kits += l.quantity;
      break;
    case 'sterile_bandages':
      stock.medical.sterile_bandages += l.quantity;
      break;
    case 'antibiotics':
      stock.medical.antibiotics += l.quantity;
      break;
    case 'painkillers':
      stock.medical.painkillers += l.quantity;
      break;
    case 'gasoline':
      stock.fuel.gasoline += l.quantity;
      break;
    case 'diesel':
      stock.fuel.diesel += l.quantity;
      break;
    case 'ammunition':
      stock.ammo.sharedPool += l.quantity;
      break;
    case 'wood':
      stock.materials.wood += l.quantity;
      break;
    case 'metal':
      stock.materials.metal += l.quantity;
      break;
    case 'bricks':
      stock.materials.bricks += l.quantity;
      break;
    case 'tools':
      stock.materials.tools = (stock.materials.tools || 0) + l.quantity;
      break;
    case 'logs':
      stock.materials.logs = (stock.materials.logs || 0) + l.quantity;
      break;
    case 'scrap':
      stock.materials.scrap = (stock.materials.scrap || 0) + l.quantity;
      break;
    case 'scientific_materials':
      stock.materials.scientific_materials = (stock.materials.scientific_materials || 0) + l.quantity;
      break;
  }
}

/** Adds weapons/armor loot stacks into the settlement armory. */
function addLootToArmory(armory: { weapons: WeaponItemId[]; armor: ArmorItemId[] }, items: SquadLootItem[]): void {
  for (const l of items) {
    if (l.kind === 'weapon' && l.itemId) armory.weapons.push(l.itemId as WeaponItemId);
    if (l.kind === 'armor' && l.itemId) armory.armor.push(l.itemId as ArmorItemId);
  }
}

/** Loot labels that land in the finite stockpile (everything else is armory). */
const STOCKPILE_LOOT_LABELS = new Set([
  'canned_goods',
  'dried_rations',
  'bottled_water',
  'first_aid_kits',
  'sterile_bandages',
  'antibiotics',
  'painkillers',
  'gasoline',
  'diesel',
  'ammunition',
  'wood',
  'metal',
  'bricks',
  'tools',
  'logs',
  'scrap',
  'scientific_materials',
]);

/** Stockpile units an item consumes (0 for weapons/armor, which go to the armory). */
function lootStockpileUnits(l: SquadLootItem): number {
  return STOCKPILE_LOOT_LABELS.has(l.label) ? (l.quantity ?? 1) : 0;
}

/**
 * True when the settlement stockpile can accept every unit of the given haul
 * under `totalStorageCapacity` (weapons/armor never consume capacity). This is
 * the IFZ gate: a squad checks whether storage has room BEFORE trekking home
 * to deposit — if not, it simply doesn't return and keeps the loot.
 */
export function hasStockpileRoomForHaul(state: SettlementState, items: SquadLootItem[]): boolean {
  const capacity = state.totalStorageCapacity ?? Infinity;
  const units = items.reduce((sum, l) => sum + lootStockpileUnits(l), 0);
  return getStockpileUnits(state.stockpile) + units <= capacity;
}

/**
 * Adds loot to the stockpile while respecting totalStorageCapacity. Anything
 * that doesn't fit is returned as overflow (never silently lost) so the caller
 * can keep it in the squad's backpack / vehicle bay. Armory-only loot always
 * deposits — it doesn't consume stockpile units.
 */
function depositLootWithinCapacity(
  stock: SettlementStockpile,
  items: SquadLootItem[],
  capacity: number
): { stockpile: SettlementStockpile; deposited: SquadLootItem[]; overflow: SquadLootItem[] } {
  let usedUnits = getStockpileUnits(stock);
  const deposited: SquadLootItem[] = [];
  const overflow: SquadLootItem[] = [];
  for (const l of items) {
    const units = lootStockpileUnits(l);
    if (usedUnits + units > capacity) {
      overflow.push(l);
      continue;
    }
    addLootToStockpile(stock, l);
    usedUnits += units;
    deposited.push(l);
  }
  return { stockpile: stock, deposited, overflow };
}

/**
 * Unloads squad inventory when arrived at a storage dropoff building or HQ fortress.
 */
export function unloadSquadAtDropoff(
  state: SettlementState,
  squadId: string,
  pos: Point2D,
  dropoff: { x: number; z: number; name?: string },
  radius = 20
): { newState: SettlementState; unloaded: SquadLootItem[] } {
  if (Math.hypot(pos.x - dropoff.x, pos.z - dropoff.z) > radius) {
    return { newState: state, unloaded: [] };
  }

  const inv = state.squadInventories?.[squadId];
  if (!inv?.items?.length) {
    return { newState: state, unloaded: [] };
  }

  const stock = structuredClone(state.stockpile);
  const items = inv.items;

  // Finite stockpile: deposit only what fits under totalStorageCapacity.
  // Overflow stays in the squad's backpack instead of vanishing.
  const capacity = state.totalStorageCapacity ?? Infinity;
  const { stockpile: stockAfter, deposited, overflow } = depositLootWithinCapacity(stock, items, capacity);

  const armory = {
    weapons: [...(state.armory?.weapons || [])],
    armor: [...(state.armory?.armor || [])],
  };
  addLootToArmory(armory, deposited);

  const overflowUnits = overflow.reduce((sum, item) => sum + lootStockpileUnits(item), 0);

  return {
    newState: {
      ...state,
      stockpile: stockAfter,
      armory,
      overflowLootUnits: (state.overflowLootUnits || 0) + overflowUnits,
      squadInventories: {
        ...(state.squadInventories || {}),
        [squadId]: { ...createEmptySquadInventory(inv.capacity), items: overflow },
      },
    },
    unloaded: deposited,
  };
}

/**
 * Unloads a vehicle's cargo bay when the mounted squad returns to a storage
 * dropoff or HQ fortress. The whole bay is emptied into the settlement stockpile
 * and armory, so mounted expeditions deposit their cargo in one trip.
 */
export function unloadVehicleAtDropoff(
  state: SettlementState,
  vehicle: WorldVehicle,
  dropoff: { x: number; z: number; name?: string },
  radius = 20
): { newState: SettlementState; unloaded: SquadLootItem[] } {
  const bay = vehicle.inventory || [];
  if (bay.length === 0) {
    return { newState: state, unloaded: [] };
  }
  if (Math.hypot(vehicle.position.x - dropoff.x, vehicle.position.z - dropoff.z) > radius) {
    return { newState: state, unloaded: [] };
  }

  const stock = structuredClone(state.stockpile);

  // Finite stockpile: deposit only what fits under totalStorageCapacity.
  // Overflow stays in the vehicle's cargo bay instead of vanishing.
  const capacity = state.totalStorageCapacity ?? Infinity;
  const { stockpile: stockAfter, deposited, overflow } = depositLootWithinCapacity(stock, bay, capacity);

  const armory = {
    weapons: [...(state.armory?.weapons || [])],
    armor: [...(state.armory?.armor || [])],
  };
  addLootToArmory(armory, deposited);

  const overflowUnits = overflow.reduce((sum, item) => sum + lootStockpileUnits(item), 0);

  return {
    newState: {
      ...state,
      stockpile: stockAfter,
      armory,
      overflowLootUnits: (state.overflowLootUnits || 0) + overflowUnits,
      vehicles: (state.vehicles || []).map((v) => (v.id === vehicle.id ? { ...v, inventory: overflow } : v)),
    },
    unloaded: deposited,
  };
}

/** Legacy alias for compatibility with HQ fortress dropoffs */
export function unloadSquadAtHQ(
  state: SettlementState,
  squadId: string,
  pos: Point2D,
  hq: Point2D,
  radius = 18
): { newState: SettlementState; unloaded: SquadLootItem[] } {
  return unloadSquadAtDropoff(state, squadId, pos, { x: hq.x, z: hq.z, name: 'HQ Fortress' }, radius);
}

/** Legacy direct search wrapper for compatibility */
export function searchBuilding(
  state: SettlementState,
  squadId: string,
  pos: Point2D,
  b: BuildingPolygon,
  radius = 18
): { success: boolean; newState: SettlementState; error?: string; loot?: SquadLootItem[] } {
  return startBuildingSearch(state, squadId, pos, b, radius);
}
