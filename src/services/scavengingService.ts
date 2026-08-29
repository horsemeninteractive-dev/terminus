import { BuildingCategory, BuildingPolygon, Point2D } from '../types/map';
import { SettlementState } from '../types/settlement';
import { SquadInventory, SquadLootItem } from '../types/population';
import { BuildingSearchState } from '../types/scavenging';
import { ArmorItemId, TacticalSquadUnit, WeaponItemId } from '../types/combat';

const DEFAULT_CAPACITY = 45;

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

export function generateLootForBuilding(b: BuildingPolygon): SquadLootItem[] {
  const r = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
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
        items.push(i('armor', 'Tactical Vest', 'tactical_vest', 4.0));
      }
      break;
    case 'gas_station':
      items.push(q('gasoline', r(12, 32), 0.5), q('diesel', r(6, 18), 0.5));
      if (Math.random() < 0.4) items.push(q('canned_goods', r(2, 5), 1.2));
      break;
    case 'warehouse':
    case 'industrial':
      items.push(q('metal', r(6, 16), 1.5), q('wood', r(5, 14), 1.2), q('gasoline', r(4, 12), 0.5));
      if (Math.random() < 0.35) items.push(i('weapon', 'Machete', 'machete', 2.0));
      if (Math.random() < 0.25) items.push(q('bricks', r(4, 10), 2.0));
      break;
    case 'school':
      items.push(q('canned_goods', r(2, 6), 1.2), q('bottled_water', r(2, 6), 1.0), q('sterile_bandages', r(1, 4), 0.4));
      break;
    default:
      items.push(q('canned_goods', r(1, 4), 1.2), q('bottled_water', r(1, 3), 1.0));
      if (Math.random() < 0.35) items.push(q('ammunition', r(2, 8), 0.15));
      if (Math.random() < 0.25) items.push(q('wood', r(2, 6), 1.2));
  }
  return items;
}

export function createBuildingSearchState(
  buildingId: string | number,
  building?: BuildingPolygon
): BuildingSearchState {
  const lootPool = building ? generateLootForBuilding(building) : [];
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
  buildings: BuildingPolygon[]
): SettlementState {
  const m = new Map(state.buildingSearches || new Map());
  for (const b of buildings) {
    const freshDuration = getBuildingSearchDurationSec(b);
    const existing = m.get(b.id);
    if (!existing) {
      m.set(b.id, createBuildingSearchState(b.id, b));
    } else if (existing.totalDurationSec !== freshDuration) {
      // Keep search progress/loot state but refresh the duration so size changes take effect
      m.set(b.id, { ...existing, totalDurationSec: freshDuration });
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
      if (bldg.typeId === 'storage_depot' && bldg.constructionStatus === 'completed') {
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

  // Check freestanding storage depots
  if (settlement.freestandingBuildings) {
    for (const bldg of settlement.freestandingBuildings) {
      if (bldg.typeId === 'storage_depot' && bldg.position) {
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
  if (settlement.hq?.center) {
    return {
      x: settlement.hq.center.x,
      z: settlement.hq.center.z,
      name: settlement.hq.buildingName || 'HQ Fortress',
      buildingId: settlement.hq.buildingId,
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
  radius = 18
): { success: boolean; newState: SettlementState; error?: string; searchState?: BuildingSearchState } {
  const sq = state.squads.find((s) => s.id === squadId);
  if (!sq) return { success: false, newState: state, error: 'Squad not found.' };

  const m = new Map(state.buildingSearches || new Map());
  let cur = m.get(b.id);
  if (!cur) {
    cur = createBuildingSearchState(b.id, b);
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

  let elapsed = (search.elapsedDurationSec || 0) + deltaSec;
  let progress = Math.min(100, Math.round((elapsed / totalDuration) * 100));

  // Determine newly unlocked items this tick based on progress milestones
  const itemsFoundThisTick: SquadLootItem[] = [];
  const inv = state.squadInventories?.[squad.squadId] || createEmptySquadInventory();
  let currentUsed = inv.used;
  let currentItems = [...inv.items];
  let inventoryFull = false;

  if (unlooted.length > 0 && totalItemsCount > 0) {
    // Each item is uncovered when progress crosses (itemIndex + 0.35) / totalItemsCount * 100
    const remainingUnlooted: SquadLootItem[] = [];

    for (let idx = 0; idx < unlooted.length; idx++) {
      const item = unlooted[idx];
      const itemTotalIndex = totalItemsCount - unlooted.length + idx;
      const milestoneProgress = Math.round(((itemTotalIndex + 0.4) / totalItemsCount) * 100);

      if (progress >= milestoneProgress && !inventoryFull) {
        const itemWeight = (item.quantity || 1) * (item.weight || 1);
        if (currentUsed + itemWeight <= inv.capacity) {
          currentUsed += itemWeight;
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
  if (currentUsed >= inv.capacity * 0.98) {
    inventoryFull = true;
  }

  const isCompleted = progress >= 100 && search.unlootedItems.length === 0;

  search.elapsedDurationSec = elapsed;
  search.totalDurationSec = totalDuration;
  search.searchProgress = progress;
  search.lootedItems = looted;
  search.observed = true;
  if (isCompleted) {
    search.searched = true;
  }
  m.set(building.id, search);

  // Update squad state and destination
  let nextSquad: TacticalSquadUnit = {
    ...squad,
    searchProgress: progress,
    currentWeightKg: currentUsed,
  };

  let dropoffDestination: { x: number; z: number; name: string } | undefined;

  const assignedVeh = squad.assignedVehicleId
    ? state.vehicles?.find((v) => v.id === squad.assignedVehicleId && v.condition !== 'wrecked')
    : null;

  if (inventoryFull) {
    if (assignedVeh) {
      // Return to parked expedition vehicle to board it and drive loot home
      dropoffDestination = { x: assignedVeh.position.x, z: assignedVeh.position.z, name: assignedVeh.name };
      nextSquad = {
        ...nextSquad,
        state: 'returning',
        targetPos: { x: assignedVeh.position.x, z: assignedVeh.position.z },
        pendingMountVehicleId: assignedVeh.id,
        targetBuildingId: null,
        targetBuildingName: `Return to ${assignedVeh.name}`,
        searchProgress: undefined,
      };
    } else {
      // Inventory full -> Auto-path on foot to storage depot (or HQ if none)
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
  } else if (isCompleted) {
    if (assignedVeh) {
      // Search complete -> Return to expedition vehicle
      dropoffDestination = { x: assignedVeh.position.x, z: assignedVeh.position.z, name: assignedVeh.name };
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
    } else if (currentUsed > 0) {
      // Search complete! If carrying items, return to storage on foot, otherwise idle
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
    } else {
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
    // Still scavenging in progress
    nextSquad = {
      ...nextSquad,
      state: 'searching',
    };
  }

  const newState: SettlementState = {
    ...state,
    buildingSearches: m,
    squadInventories: {
      ...(state.squadInventories || {}),
      [squad.squadId]: {
        ...inv,
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

  for (const l of items) {
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
    }
  }

  const armory = {
    weapons: [...(state.armory?.weapons || [])],
    armor: [...(state.armory?.armor || [])],
  };

  for (const l of items) {
    if (l.kind === 'weapon' && l.itemId) armory.weapons.push(l.itemId as WeaponItemId);
    if (l.kind === 'armor' && l.itemId) armory.armor.push(l.itemId as ArmorItemId);
  }

  return {
    newState: {
      ...state,
      stockpile: stock,
      armory,
      squadInventories: {
        ...(state.squadInventories || {}),
        [squadId]: createEmptySquadInventory(inv.capacity),
      },
    },
    unloaded: items,
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
