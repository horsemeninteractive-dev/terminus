import {
  calculateBuildingStats,
  calculatePolygonArea,
  FUNCTIONAL_BUILDING_DEFINITIONS,
  getAdaptedCost,
} from '../data/functionalBuildings';
import { BuildingPolygon, Point2D } from '../types/map';
import {
  AdaptedBuilding,
  BuildingSection,
  ConstructionWorkOrder,
  DeconstructionJob,
  DeconstructionSource,
  FunctionalBuildingTypeId,
  ResourceCost,
  SettlementHQ,
  SettlementState,
  SettlementStockpile,
} from '../types/settlement';
import { clipPolygonToRect, polygonArea, polygonBounds, splitFootprintIntoStrips } from './adaptationGeometry';
import {
  DEFAULT_JOB_PRIORITIES,
  INITIAL_GENERAL_POPULATION,
  INITIAL_NAMED_SURVIVORS,
  getStarterNamedSurvivors,
  recalculateLaborDistribution,
} from './populationService';
import { GameScenarioSettings } from '../types/saveGame';
import { DEFAULT_BANNER_CONFIG } from '../data/bannerCatalog';
import { WorldVehicle } from '../types/vehicle';
import {
  createInitialResearchState,
  getBuildingLockStatus,
  isResearchUnlocked,
} from './researchService';
import { createInitialMoraleState } from './moraleService';
import { createInitialWeatherState } from './weatherService';
import { getPrimaryHQ, isBuildingFullyLooted, isHQBuilding, isHQOperational, isBuildingOperational } from './buildingOperational';
import { getStockpileUnits } from './stockpileCapacity';

/**
 * Baseline starting resources. Food and water are replaced with population-scaled
 * values when a new scenario is created; these defaults cover legacy callers.
 */
export const INITIAL_STOCKPILE: SettlementStockpile = {
  food: {
    canned_goods: 0,
    mre_rations: 0,
    dried_rations: 0,
    fresh_harvest: 0,
  },
  water: {
    bottled_water: 0,
    purified_water: 0,
    rainwater: 0,
  },
  medical: {
    first_aid_kits: 8,
    sterile_bandages: 18,
    antibiotics: 6,
    painkillers: 12,
  },
  fuel: {
    gasoline: 50,
    diesel: 0,
    biofuel: 0,
  },
  ammo: {
    sharedPool: 150, // Shared ammunition pool
  },
  materials: {
    wood: 50,
    metal: 50,
    bricks: 50,
    tools: 20,
  },
};

/**
 * Creates a fresh, empty settlement state configured by optional scenario settings
 */
export function createInitialSettlementState(
  name = 'Sector Zero Command',
  scenario?: Partial<GameScenarioSettings>
): SettlementState {
  const colonyName = scenario?.colonyName || name;
  const banner = scenario?.banner || DEFAULT_BANNER_CONFIG;
  const scavengingResourceMultiplier =
    scenario?.startingSupplies === 'scarce' || scenario?.resourcesLevel === 1
      ? 0.5
      : scenario?.startingSupplies === 'plentiful' || scenario?.resourcesLevel === 3
        ? 1.8
        : 1;

  const stockpile: SettlementStockpile = {
    food: { canned_goods: 0, mre_rations: 0, dried_rations: 0, fresh_harvest: 0 },
    water: { bottled_water: 0, purified_water: 0, rainwater: 0 },
    medical: {
      first_aid_kits: 8,
      sterile_bandages: 18,
      antibiotics: 6,
      painkillers: 12,
    },
    fuel: { gasoline: 50, diesel: 0, biofuel: 0 },
    ammo: { sharedPool: 150 },
    materials: { wood: 50, metal: 50, bricks: 50, tools: 20 },
  };

  // Population scaling per player scenario settings:
  // Low (peopleLevel: 1): 1 named specialist + 12 general workers (13 total)
  // Med (peopleLevel: 2): 2 named specialists + 24 general workers (26 total)
  // High (peopleLevel: 3): 3 named specialists + 48 general workers (51 total)
  let peopleLvl = scenario?.peopleLevel;
  if (!peopleLvl) {
    if (scenario?.startingPopulation) {
      if (scenario.startingPopulation <= 15) peopleLvl = 1;
      else if (scenario.startingPopulation <= 30) peopleLvl = 2;
      else peopleLvl = 3;
    } else {
      peopleLvl = 2;
    }
  }

  const namedCount = peopleLvl === 1 ? 1 : peopleLvl === 3 ? 3 : 2;
  const generalCount = peopleLvl === 1 ? 12 : peopleLvl === 3 ? 48 : 24;

  // Each citizen consumes 0.5 food/day and 1.5 water/day. Start with exactly
  // five food-days and seven water-days, independent of supply difficulty.
  const startingPopulation = namedCount + generalCount;
  stockpile.food.canned_goods = Math.round(startingPopulation * 0.5 * 5);
  stockpile.water.bottled_water = Math.round(startingPopulation * 1.5 * 7);

  const starterNamedSurvivors = getStarterNamedSurvivors(namedCount);
  const children: import('../types/population').ChildCitizen[] = [];
  const generalPopulation = {
    total: generalCount,
    children,
    inSquads: 0,
    assignedJobs: { construction: 0, food: 0, defense: 0, production: 0, medical: 0, other: 0 },
    unassigned: generalCount,
  };

  // Starter vehicle if convoy start enabled
  const starterVehicles: WorldVehicle[] = [];
  if (scenario?.convoyStart) {
    starterVehicles.push({
      id: 'starter_convoy_truck',
      type: 'armed_truck',
      name: 'Expedition Armed Truck',
      condition: 'operational',
      position: { x: 0, z: 0 },
      rotation: 0,
      y: 0,
      currentHp: 520,
      maxHp: 520,
      fuelType: 'diesel',
      currentFuel: 60,
      maxFuel: 75,
      fuelConsumptionPer100m: 1.4,
      assignedSquadId: null,
      isMoving: false,
      roadPathWaypoints: [],
      currentWaypointIndex: 0,
      targetPos: null,
      speed: 0,
      isDiscovered: true,
      isSiphoned: false,
      isParkedAtHQ: true,
      totalDistanceDriven: 0,
      killCount: 0,
      turret: {
        mountType: 'hmg_50cal',
        rotation: 0,
        fireRate: 5,
        lastFireTime: 0,
        damage: 35,
        range: 35,
        targetZombieId: null,
      },
    });
  }

  return {
    name: colonyName,
    banner,
    scenarioSettings: scenario as GameScenarioSettings,
    scavengingResourceMultiplier,
    isInitialized: false,
    headquarters: [],
    primaryHQId: null,
    stockpile,
    adaptedBuildings: new Map<string | number, AdaptedBuilding>(),
    freestandingBuildings: [],
    // Starting capacity always fits the starting stockpile (with margin), so
    // the tutorial economy isn't instantly "storage full" while the cap is
    // still a real ceiling for everything deposited afterwards.
    totalStorageCapacity: Math.max(250, getStockpileUnits(stockpile) + 100),
    totalLivingCapacity: 0,
    totalDefenseRating: 0,
    namedSurvivors: starterNamedSurvivors,
    generalPopulation,
    squads: [],
    squadCapacity: 2,
    buildingSearches: new Map(),
    squadInventories: {},
    resourceWorkOrders: [],
    constructionOrders: [],
    hiddenGroups: new Map(),
    jobPriorities: JSON.parse(JSON.stringify(DEFAULT_JOB_PRIORITIES)),
    infections: new Map(),
    outbreaks: new Map(),
    fallenHeroes: [],
    vehicles: starterVehicles,
    vehicleWorkshopOrders: [],
    rivalHideouts: new Map(),
    zombieLairs: new Map(),
    deconstructionJobs: new Map(),
    demolishedBuildings: new Map(),
    armory: { weapons: ['pistol', 'pistol', 'pistol', 'pistol'], armor: [] },
    research: createInitialResearchState(),
    morale: createInitialMoraleState(),
    weather: createInitialWeatherState(),
  };
}

/**
 * Grants debug resources to settlement stockpile (§7.2 testing)
 */
export function grantDebugResources(
  state: SettlementState,
  delta: Partial<SettlementStockpile>
): SettlementState {
  const current = state.stockpile;
  const updated: SettlementStockpile = {
    food: {
      canned_goods: current.food.canned_goods + (delta.food?.canned_goods || 0),
      mre_rations: current.food.mre_rations + (delta.food?.mre_rations || 0),
      dried_rations: current.food.dried_rations + (delta.food?.dried_rations || 0),
      fresh_harvest: current.food.fresh_harvest + (delta.food?.fresh_harvest || 0),
    },
    water: {
      bottled_water: current.water.bottled_water + (delta.water?.bottled_water || 0),
      purified_water: current.water.purified_water + (delta.water?.purified_water || 0),
      rainwater: current.water.rainwater + (delta.water?.rainwater || 0),
    },
    medical: {
      first_aid_kits: current.medical.first_aid_kits + (delta.medical?.first_aid_kits || 0),
      sterile_bandages: current.medical.sterile_bandages + (delta.medical?.sterile_bandages || 0),
      antibiotics: current.medical.antibiotics + (delta.medical?.antibiotics || 0),
      painkillers: current.medical.painkillers + (delta.medical?.painkillers || 0),
    },
    fuel: {
      gasoline: current.fuel.gasoline + (delta.fuel?.gasoline || 0),
      diesel: current.fuel.diesel + (delta.fuel?.diesel || 0),
      biofuel: current.fuel.biofuel + (delta.fuel?.biofuel || 0),
    },
    ammo: {
      sharedPool: current.ammo.sharedPool + (delta.ammo?.sharedPool || 0),
    },
    materials: {
      ...current.materials,
      wood: current.materials.wood + (delta.materials?.wood || 0),
      metal: current.materials.metal + (delta.materials?.metal || 0),
      bricks: current.materials.bricks + (delta.materials?.bricks || 0),
      tools: (current.materials.tools || 0) + (delta.materials?.tools || 0),
    },
  };

  return {
    ...state,
    stockpile: updated,
  };
}

/**
 * Sets settlement stockpile directly
 */
export function setDebugResources(
  state: SettlementState,
  stockpile: SettlementStockpile
): SettlementState {
  return {
    ...state,
    stockpile: JSON.parse(JSON.stringify(stockpile)),
  };
}

/**
 * Checks if stockpile has enough materials for a given cost
 */
export function canAffordCost(stockpile: SettlementStockpile, cost: ResourceCost): boolean {
  // `(x || 0)` on both sides: older saves seeded `materials` without a tools
  // key, and `undefined >= 0` is false — which silently blocked EVERY build.
  return (
    stockpile.materials.wood >= (cost.wood || 0) &&
    stockpile.materials.metal >= (cost.metal || 0) &&
    stockpile.materials.bricks >= (cost.bricks || 0) &&
    (stockpile.materials.tools || 0) >= (cost.tools || 0)
  );
}

/**
 * Deducts materials from settlement stockpile
 */
export function deductCost(stockpile: SettlementStockpile, cost: ResourceCost): SettlementStockpile {
  return {
    ...stockpile,
    materials: {
      ...stockpile.materials,
      wood: Math.max(0, stockpile.materials.wood - (cost.wood || 0)),
      metal: Math.max(0, stockpile.materials.metal - (cost.metal || 0)),
      bricks: Math.max(0, stockpile.materials.bricks - (cost.bricks || 0)),
      tools: Math.max(0, (stockpile.materials.tools || 0) - (cost.tools || 0)),
    },
  };
}

// Shared finite-storage helpers (deposit-within-capacity, unit counting) live
// in ./stockpileCapacity so every resource stream — gathering, deconstruction,
// caravans, production — can import them without creating service cycles.
export { getStockpileUnits, depositWithinCapacity, countStockpileUnits } from './stockpileCapacity';

/**
 * Adds materials to settlement stockpile
 */
export function addMaterials(
  stockpile: SettlementStockpile,
  materials: Partial<ResourceCost>
): SettlementStockpile {
  return {
    ...stockpile,
    materials: {
      wood: stockpile.materials.wood + (materials.wood || 0),
      metal: stockpile.materials.metal + (materials.metal || 0),
      bricks: stockpile.materials.bricks + (materials.bricks || 0),
      tools: stockpile.materials.tools + (materials.tools || 0),
    },
  };
}

/**
 * Calculates aggregate settlement stats across all HQs and all adapted &
 * freestanding buildings. `headquarters` is the authoritative collection;
 * the primary command HQ is the entry matching `primaryHQId`.
 */
export function recalculateSettlementStats(
  headquarters: SettlementHQ[],
  primaryHQId: string | number | null,
  adaptedBuildings: Map<string | number, AdaptedBuilding>,
  freestanding: AdaptedBuilding[]
) {
  const list = Array.isArray(headquarters) ? headquarters : [];
  const primary = getPrimaryHQ({ headquarters: list, primaryHQId });
  const additional = list.filter(
    (h) => !primary || String(h.buildingId) !== String(primary.buildingId)
  );

  let storageCap = 250; // Base baseline storage
  let livingCap = 0;
  let defenseRating = 0;
  // HQ provides the first 2 deployable squad slots; each built Squad Quarters
  // adds another from its building definition.
  let squadCapacity = 0;

  // §7.5 A destroyed command center contributes nothing — a breached HQ does
  // not provide storage, shelter, defense or squad slots until re-established.
  if (primary && isHQOperational(primary)) {
    const hqDefinition = FUNCTIONAL_BUILDING_DEFINITIONS.headquarters;
    // The primary HQ's vault is a fixed 850 storage units regardless of the
    // physical footprint of the building it was established in, so settlement
    // storage is exactly 850 (plus warehouses etc.) once an HQ exists.
    storageCap = 850;
    const hqAdaptedArea = primary.footprintAreaM2;
    squadCapacity += Math.max(1, Math.floor(Math.sqrt(Math.max(1, hqAdaptedArea)) / 8)) + (hqDefinition.squadCapacity || 0);
    // HQ is the colony's primary shelter. Its functional capacity is computed
    // when it is established; use that value rather than a footprint-only
    // estimate so the warning and morale calculation agree with the HQ panel.
    livingCap += Math.max(2, primary.maxCapacity || Math.floor(primary.footprintAreaM2 / 20));
    defenseRating += primary.defenseRating;
  }

  for (const additionalHQ of additional) {
    if (!isHQOperational(additionalHQ)) continue;
    squadCapacity += Math.max(1, Math.floor(Math.sqrt(Math.max(1, additionalHQ.footprintAreaM2)) / 8)) + (FUNCTIONAL_BUILDING_DEFINITIONS.headquarters.squadCapacity || 0);
    storageCap += FUNCTIONAL_BUILDING_DEFINITIONS.headquarters.storageCapacity || 0;
    livingCap += Math.max(2, additionalHQ.maxCapacity);
    defenseRating += additionalHQ.defenseRating;
  }

  const allBuildings = [...Array.from(adaptedBuildings.values()), ...freestanding];

  const STORAGE_TYPES: FunctionalBuildingTypeId[] = ['warehouse', 'storage_depot', 'food_pantry'];
  const LIVING_TYPES: FunctionalBuildingTypeId[] = [
    'shelter',
    'shelter_bunkhouse',
    'house',
    'squad_quarters',
  ];
  const SQUAD_CAPACITY_TYPES: FunctionalBuildingTypeId[] = ['squad_quarters'];

  for (const bldg of allBuildings) {
    // §7.1 Operational state is the single authority for every stat: a
    // breached, still-under-construction, or repair-stalled building
    // contributes NO defense, storage, living, or squad capacity. A destroyed
    // Watchtower is not a shield and a gutted Warehouse is not a vault.
    if (!isBuildingOperational(bldg)) continue;
    defenseRating += bldg.defenseRating;
    if (STORAGE_TYPES.includes(bldg.typeId)) {
      storageCap += bldg.maxCapacity;
    } else if (LIVING_TYPES.includes(bldg.typeId)) {
      livingCap += bldg.maxCapacity;
    }
    // A squad slot is all-or-nothing: a partially adapted Squad Quarters does
    // not field half a squad, so only a fully converted building grants the slot.
    if (
      SQUAD_CAPACITY_TYPES.includes(bldg.typeId) &&
      (bldg.adaptationPercentage ?? 100) >= 100
    ) {
      squadCapacity += FUNCTIONAL_BUILDING_DEFINITIONS[bldg.typeId]?.squadCapacity || 1;
    }
  }

  return { storageCap, livingCap, defenseRating, squadCapacity };
}

/**
 * Establishes selected building as the Settlement Headquarters (§3.4)
 */
export function establishSettlementHQ(
  state: SettlementState,
  bldg: BuildingPolygon
): SettlementState {
  const stats = calculateBuildingStats('headquarters', bldg, true);
  // Command-center structural integrity: larger/higher HQs are tougher. The
  // baseline matches a Fortified Tower so a small HQ can still be overrun by
  // a determined siege, while a large command block shrugs off early hordes.
  const hqMaxDurability = Math.max(650, Math.round(600 + stats.footprintArea * 0.5 + bldg.levels * 120));
  const hqStats: SettlementHQ = {
    buildingId: bldg.id,
    buildingName: bldg.name || `${bldg.type.toUpperCase()} COMMAND HQ`,
    establishedAt: Date.now(),
    footprintAreaM2: stats.footprintArea,
    levels: bldg.levels,
    center: bldg.center,
    defenseRating: stats.baseDefense + 50, // HQ fortified bonus
    maxCapacity: stats.maxCapacity,
    maxDurability: hqMaxDurability,
    currentDurability: hqMaxDurability,
  };

  const adaptedBuildings = new Map(state.adaptedBuildings);
  const headquarters = [...(state.headquarters || [])];
  const existingHQ = headquarters.find((h) => String(h.buildingId) === String(bldg.id));
  if (existingHQ) return state;
  headquarters.push(hqStats);
  // The newly established/selected command center becomes primary — even when
  // it replaces a previously-breached HQ (reclamation promotes the new HQ).
  const { storageCap, livingCap, defenseRating, squadCapacity } = recalculateSettlementStats(
    headquarters,
    hqStats.buildingId,
    adaptedBuildings,
    state.freestandingBuildings
  );

  const intermediateState: SettlementState = {
    ...state,
    isInitialized: true,
    primaryHQId: hqStats.buildingId,
    headquarters,
    adaptedBuildings,
    totalStorageCapacity: storageCap,
    totalLivingCapacity: livingCap,
    totalDefenseRating: defenseRating,
    squadCapacity,
  };

  return recalculateLaborDistribution(intermediateState);
}

/**
/** Options for area-based (§7.1 IFZ drag) and split-section adaptation. */
export interface AdaptBuildingOptions {
  /**
   * Physical selection already clipped to the source footprint (the exact
   * dragged area). When given, the conversion covers this sub-region rather
   * than a preset percentage; the stored percentage is derived from its area.
   */
  selectionPolygon?: Point2D[];
  /** For split sections: adapt the section record instead of the whole
   *  building. The record is keyed by the section id and stamped with the
   *  source building id so each section stays independently adaptable. */
  section?: BuildingSection;
  /** Cost multiplier applied to the type's full adaptation cost before the
   *  incremental share is taken. Sections pay only their footprint's share so
   *  a building split into N parts costs the same total as one whole build. */
  costScale?: number;
  /** Building whose search/loot state gates the adaptation. Sections share
   *  their parent's cleared status (sections themselves are never searched). */
  gateBuildingId?: string | number;
}

/**
 * Converts a real OSM building into an adapted functional structure (§7.1, §7.2).
 * `adaptation` is either a legacy percentage (0–100) or a physical selection
 * polygon — the exact area the player dragged across the footprint. With a
 * polygon, the stored `adaptedPolygon` / `adaptedAreaM2` reflect the real
 * selected region and the percentage is derived from its area.
 */
export function adaptBuilding(
  state: SettlementState,
  bldg: BuildingPolygon,
  typeId: FunctionalBuildingTypeId,
  adaptation: number | Point2D[] = 100,
  options: AdaptBuildingOptions = {}
): { success: boolean; newState: SettlementState; error?: string } {
  const { selectionPolygon, section, costScale, gateBuildingId } = options;
  const recordKey = section ? section.id : bldg.id;
  const gateId = gateBuildingId ?? bldg.id;
  // `adaptation` may itself be a physical selection polygon (the dragged area),
  // in which case it takes precedence over the options polygon.
  const physicalSelection =
    Array.isArray(adaptation) && adaptation.length >= 3 ? adaptation : selectionPolygon;
  const def = FUNCTIONAL_BUILDING_DEFINITIONS[typeId];
  if (!def) {
    return { success: false, newState: state, error: 'Unknown functional building type' };
  }

  // Purpose-built facilities (Cistern, walls, gates, towers, …) are freestanding
  // only — they can never be made by converting a real-world building.
  if (!def.adaptationAllowed) {
    return {
      success: false,
      newState: state,
      error: 'This facility is purpose-built and can only be constructed freestanding.',
    };
  }

  // Research gate: the reference design gates adaptation by the building's tech
  // requirement (e.g. House requires Advanced Woodworks).
  const lock = getBuildingLockStatus(state, def.researchRequirement);
  if (!lock.unlocked) {
    return {
      success: false,
      newState: state,
      error: `Requires research: ${lock.requiredName}`,
    };
  }

  // IFZ rule: a real building must be scavenged AND fully cleared (no leftover
  // loot) before it can be converted into a functional structure. The HQ is
  // command infrastructure and can never be adapted away either. Split sections
  // gate against the PARENT building's cleared status — sections are never
  // searched separately.
  if (isHQBuilding(state, gateId)) {
    return {
      success: false,
      newState: state,
      error: 'This is your headquarters — it cannot be converted into another facility.',
    };
  }
  const searchState = state.buildingSearches?.get(gateId);
  if (!isBuildingFullyLooted(searchState)) {
    return {
      success: false,
      newState: state,
      error: 'This building must be fully scavenged and cleared before it can be adapted.',
    };
  }

  // §7.1 IFZ-style physical selection: when the player drags across the
  // footprint, the conversion covers exactly that sub-region. The dragged
  // polygon is clipped to the real footprint and the coverage percentage is
  // DERIVED from the selected area rather than being a preset knob.
  let requestedPercentage = Math.max(1, Math.min(100, typeof adaptation === 'number' ? adaptation : 100));
  let adaptedPolygon: Point2D[] | undefined;
  if (physicalSelection && physicalSelection.length >= 3) {
    const sel = polygonBounds(physicalSelection);
    const clipped = clipPolygonToRect(bldg.polygon || [], sel.minX, sel.maxX, sel.minZ, sel.maxZ);
    if (clipped.length >= 3) {
      const selectedArea = polygonArea(clipped);
      const footprintArea = Math.max(1, polygonArea(bldg.polygon || []));
      requestedPercentage = Math.min(100, Math.max(1, Math.round((selectedArea / footprintArea) * 100)));
      adaptedPolygon = clipped;
    }
  } else if (section && section.polygon.length >= 3) {
    adaptedPolygon = section.polygon;
  }

  const existing = state.adaptedBuildings.get(recordKey);
  if (existing && existing.typeId !== typeId) {
    return { success: false, newState: state, error: 'This structure is already assigned to another adaptation.' };
  }
  const stats = calculateBuildingStats(typeId, bldg, true);
  const previousPercentage = existing?.adaptationPercentage || 0;
  const targetPercentage = Math.max(previousPercentage, requestedPercentage);
  const incrementalPercentage = Math.max(0, targetPercentage - previousPercentage);
  if (incrementalPercentage <= 0) {
    return { success: false, newState: state, error: 'This adaptation is already complete.' };
  }
  // §Terminus economics: the base cost scales with the REAL structure's shell
  // volume (footprint × height), not a per-type flat rate — a large building
  // costs proportionally more because it yields proportionally more capacity.
  const fullCost = getAdaptedCost(typeId, bldg.type, stats.footprintArea, bldg.height);
  const baseCost: ResourceCost = costScale && costScale !== 1
    ? {
        wood: Math.ceil(fullCost.wood * costScale),
        metal: Math.ceil(fullCost.metal * costScale),
        bricks: Math.ceil(fullCost.bricks * costScale),
        tools: fullCost.tools ? Math.ceil(fullCost.tools * costScale) : 0,
      }
    : fullCost;
  const cost: ResourceCost = {
    wood: Math.ceil(baseCost.wood * incrementalPercentage / 100),
    metal: Math.ceil(baseCost.metal * incrementalPercentage / 100),
    bricks: Math.ceil(baseCost.bricks * incrementalPercentage / 100),
    tools: baseCost.tools ? Math.ceil(baseCost.tools * incrementalPercentage / 100) : 0,
  };
  if (!canAffordCost(state.stockpile, cost)) {
    return {
      success: false,
      newState: state,
      error: `Insufficient construction materials (Requires: ${cost.wood}W / ${cost.metal}M / ${cost.bricks}B)`,
    };
  }

  const workerCount = 0; // Live labour distribution assigns construction workers.

  // §7.1 partial adaptation: capacity, defense and worker-slot contribution are
  // ALL proportional to the converted area, not the whole shell. `fullCapacity`
  // keeps the 100% value for expansion previews; `maxCapacity` is scaled so
  // every consumer (storage/living aggregates, housing, morale) sees a 25%
  // warehouse as a 25% warehouse. Durability stays full — the physical shell
  // stands regardless of how much of it is converted.
  const scale = targetPercentage / 100;
  const previousFullCapacity = existing?.fullCapacity ?? existing?.maxCapacity;
  const fullCapacity = previousFullCapacity ?? stats.maxCapacity;
  const scaledCapacity = Math.max(0, Math.round(fullCapacity * scale));

  const adapted: AdaptedBuilding = {
    buildingId: recordKey,
    typeId: typeId,
    isHQ: false,
    name: def.name,
    category: def.category,
    adaptedAt: Date.now(),
    footprintAreaM2: stats.footprintArea,
    adaptedAreaM2: stats.footprintArea * targetPercentage / 100,
    adaptationPercentage: targetPercentage,
    adaptedPolygon,
    sourceBuildingId: section ? section.sourceBuildingId : undefined,
    totalFloorAreaM2: stats.totalFloorArea,
    volumeM3: stats.volume,
    fullCapacity,
    maxCapacity: scaledCapacity,
    currentUsage: 0,
    capacityUnit: stats.capacityUnit,
    // Multi-recipe facilities start on their first recipe; expanding a partial
    // conversion keeps whatever the player already selected.
    selectedRecipeId:
      existing?.selectedRecipeId ??
      (def.recipes?.length ? def.recipes[0].id : undefined),
    maxDurability: stats.maxDurability,
    currentDurability: stats.maxDurability,
    defenseRating: Math.round(stats.baseDefense * scale),
    isFreestanding: false,
    position: bldg.center,
    height: bldg.height,
    levels: bldg.levels,
    polygon: bldg.polygon,
    constructionStatus: 'in_progress',
    constructionProgress: 0,
    constructionWorkRequired: Math.max(1, Math.round(100 * incrementalPercentage / 100)),
    constructionWorkDone: 0,
    assignedWorkers: workerCount,
  };

  const newAdaptedMap = new Map(state.adaptedBuildings);
  newAdaptedMap.set(recordKey, existing ? { ...existing, ...adapted } : adapted);

  const constructionOrder: ConstructionWorkOrder = {
    id: `const_${recordKey}_${Date.now()}`,
    buildingId: recordKey,
    buildingName: def.name,
    workerCount,
    state: 'traveling',
    position: { ...(getPrimaryHQ(state)?.center || bldg.center) },
    targetPosition: { ...bldg.center },
    totalCost: cost,
    deductedCost: { wood: 0, metal: 0, bricks: 0, tools: 0 },
    progress: 0,
    createdAt: Date.now(),
  };

  const updatedOrders = [
    ...(state.constructionOrders || []).filter((o) => o.buildingId !== recordKey),
    constructionOrder,
  ];

  const { storageCap, livingCap, defenseRating, squadCapacity } = recalculateSettlementStats(
    state.headquarters,
    state.primaryHQId ?? null,
    newAdaptedMap,
    state.freestandingBuildings
  );

  const intermediateState: SettlementState = {
    ...state,
    adaptedBuildings: newAdaptedMap,
    constructionOrders: updatedOrders,
    totalStorageCapacity: storageCap,
    totalLivingCapacity: livingCap,
    totalDefenseRating: defenseRating,
    squadCapacity,
  };

  return {
    success: true,
    newState: recalculateLaborDistribution(intermediateState),
  };
}

/**
 * IFZ-style footprint splitting (§7.1): divides a large real building into
 * `parts` independently-adaptable sections. The split costs bricks (partition
 * walls) and each resulting section can later be adapted into a different
 * facility type via `adaptBuildingSection`. A split building's whole-building
 * adaptation is removed — the sections are the adaptation surface from then on.
 */
export function splitBuilding(
  state: SettlementState,
  bldg: BuildingPolygon,
  parts: 2 | 3 | 4 = 2
): { success: boolean; newState: SettlementState; error?: string; sections?: BuildingSection[] } {
  if (!bldg.polygon || bldg.polygon.length < 3) {
    return { success: false, newState: state, error: 'This structure has no valid footprint to split.' };
  }
  if (parts < 2 || parts > 4) {
    return { success: false, newState: state, error: 'A structure can be split into 2–4 sections.' };
  }
  if (isHQBuilding(state, bldg.id)) {
    return { success: false, newState: state, error: 'The headquarters cannot be split.' };
  }
  const existingSections = state.buildingSections?.get(bldg.id);
  if (existingSections && existingSections.length > 0) {
    return { success: false, newState: state, error: 'This building is already split into sections.' };
  }
  const existingAdaptation = state.adaptedBuildings.get(bldg.id);
  if (existingAdaptation) {
    return { success: false, newState: state, error: 'Remove the building adaptation before splitting it into sections.' };
  }
  const searchState = state.buildingSearches?.get(bldg.id);
  if (!isBuildingFullyLooted(searchState)) {
    return { success: false, newState: state, error: 'The building must be fully scavenged and cleared before it can be split.' };
  }

  const strips = splitFootprintIntoStrips(bldg.polygon, parts);
  if (strips.length < 2) {
    return { success: false, newState: state, error: 'This footprint is too irregular to split into sections.' };
  }

  // Partition walls cost bricks proportional to the total cut length.
  const b = polygonBounds(bldg.polygon);
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const totalCutLength = (parts - 1) * span;
  const brickCost = Math.max(15, Math.ceil(totalCutLength * 1.5));
  const stock = state.stockpile.materials;
  if ((stock.bricks || 0) < brickCost) {
    return {
      success: false,
      newState: state,
      error: `Insufficient bricks for the partition walls (Requires ${brickCost} bricks).`,
    };
  }

  const sections: BuildingSection[] = strips.map((s, i) => ({
    id: `${bldg.id}::s${i}`,
    sourceBuildingId: bldg.id,
    index: i,
    polygon: s.polygon,
    center: s.center,
    footprintAreaM2: s.areaM2,
    splitBrickCost: brickCost,
  }));

  const newStockpile = {
    ...state.stockpile,
    materials: { ...stock, bricks: stock.bricks - brickCost },
  };
  const buildingSections = new Map(state.buildingSections || []);
  buildingSections.set(bldg.id, sections);

  return {
    success: true,
    newState: { ...state, stockpile: newStockpile, buildingSections },
    sections,
  };
}

/**
 * Adapts ONE split section of a real building into a functional structure
 * (§7.1). Each section is independently adaptable — the map key is the section
 * id and the record is stamped with the source building id, so a single large
 * warehouse can become e.g. a shelter section + a medbay section.
 */
export function adaptBuildingSection(
  state: SettlementState,
  sourceBldg: BuildingPolygon,
  section: BuildingSection,
  typeId: FunctionalBuildingTypeId
): { success: boolean; newState: SettlementState; error?: string } {
  const sections = state.buildingSections?.get(sourceBldg.id) || [];
  if (!sections.some((s) => s.id === section.id)) {
    return { success: false, newState: state, error: 'This section does not belong to the selected building.' };
  }
  const footprintArea = Math.max(1, polygonArea(sourceBldg.polygon || []));
  const sectionShare = Math.max(0.02, Math.min(1, section.footprintAreaM2 / footprintArea));
  // Synthesise a polygon representing just this section so capacity/volume/
  // footprint stats are proportional to the section, not the whole shell.
  const sectionBldg: BuildingPolygon = {
    ...sourceBldg,
    id: section.id,
    polygon: section.polygon,
    center: section.center,
  };
  return adaptBuilding(state, sectionBldg, typeId, 100, {
    section,
    selectionPolygon: section.polygon,
    costScale: sectionShare,
    gateBuildingId: sourceBldg.id,
  });
}

/**
 * Builds a freestanding structure on open terrain (§7.1)
 */
export function deadaptBuilding(
  state: SettlementState,
  buildingId: string | number
): { success: boolean; newState: SettlementState; error?: string } {
  const adapted = state.adaptedBuildings.get(buildingId);
  if (!adapted || adapted.isFreestanding) {
    return { success: false, newState: state, error: 'No reversible building adaptation found.' };
  }
  if (adapted.isHQ) return { success: false, newState: state, error: 'The headquarters cannot be deadapted.' };
  if (state.constructionOrders?.some((order) => order.buildingId === buildingId)) {
    return { success: false, newState: state, error: 'Finish or cancel the current adaptation first.' };
  }
  const next = new Map(state.adaptedBuildings);
  next.delete(buildingId);
  const orders = (state.constructionOrders || []).filter((order) => order.buildingId !== buildingId);
  return { success: true, newState: recalculateLaborDistribution({ ...state, adaptedBuildings: next, constructionOrders: orders }) };
}

export function buildFreestanding(
  state: SettlementState,
  typeId: FunctionalBuildingTypeId,
  position: Point2D,
  customWidth = 8,
  customLength = 8,
  customHeight = 4.5,
  rotationDeg = 0
): { success: boolean; newState: SettlementState; error?: string } {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS[typeId];
  if (!def) {
    return { success: false, newState: state, error: 'Unknown functional building type' };
  }

  // Research gate (applies to e.g. Fortified Wall / Gate / Tower).
  const lock = getBuildingLockStatus(state, def.researchRequirement);
  if (!lock.unlocked) {
    return {
      success: false,
      newState: state,
      error: `Requires research: ${lock.requiredName}`,
    };
  }

  // Adaptation-type facilities (conversions of real-world buildings) can only
  // be erected freestanding from scratch once the colony masters Advanced
  // Masonry. Genuinely freestanding IFZ structures (walls, gates, towers,
  // wire, sandbags — defs with `adaptationAllowed: false`) are exempt.
  if (def.adaptationAllowed && !isResearchUnlocked(state, 'advanced_masonry')) {
    return {
      success: false,
      newState: state,
      error: 'Requires research: Advanced Masonry (freestanding facilities need masonry expertise)',
    };
  }

  const cost = def.freestandingCost;
  if (!canAffordCost(state.stockpile, cost)) {
    return {
      success: false,
      newState: state,
      error: `Insufficient construction materials (Requires: ${cost.wood}W / ${cost.metal}M / ${cost.bricks}B)`,
    };
  }

  const footprintArea = customWidth * customLength;
  const dummyBldg: BuildingPolygon = {
    id: `free_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type: 'residential',
    rawType: 'freestanding',
    name: `Freestanding ${def.name}`,
    height: customHeight,
    levels: 1,
    center: position,
    polygon: [
      { x: position.x - customWidth / 2, z: position.z - customLength / 2 },
      { x: position.x + customWidth / 2, z: position.z - customLength / 2 },
      { x: position.x + customWidth / 2, z: position.z + customLength / 2 },
      { x: position.x - customWidth / 2, z: position.z + customLength / 2 },
    ],
    tags: { freestanding: 'true' },
  };

  const stats = calculateBuildingStats(typeId, dummyBldg, false);
  const workerCount = 0; // Live labour distribution assigns construction workers.

  const freestandingObj: AdaptedBuilding = {
    buildingId: dummyBldg.id,
    typeId: typeId,
    isHQ: false,
    name: `Freestanding ${def.name}`,
    category: def.category,
    adaptedAt: Date.now(),
    footprintAreaM2: footprintArea,
    adaptedAreaM2: footprintArea,
    adaptationPercentage: 100,
    totalFloorAreaM2: footprintArea,
    volumeM3: footprintArea * customHeight,
    maxCapacity: Math.max(2, Math.floor(stats.maxCapacity * 0.7)),
    currentUsage: 0,
    capacityUnit: stats.capacityUnit,
    selectedRecipeId: def.recipes?.length ? def.recipes[0].id : undefined,
    maxDurability: stats.maxDurability,
    currentDurability: stats.maxDurability,
    defenseRating: stats.baseDefense,
    isFreestanding: true,
    position: position,
    height: customHeight,
    levels: 1,
    polygon: dummyBldg.polygon,
    width: customWidth,
    length: customLength,
    rotationDeg,
    constructionStatus: 'in_progress',
    constructionProgress: 0,
    constructionWorkRequired: 140,
    constructionWorkDone: 0,
    assignedWorkers: workerCount,
  };

  const constructionOrder: ConstructionWorkOrder = {
    id: `const_${dummyBldg.id}_${Date.now()}`,
    buildingId: dummyBldg.id,
    buildingName: `Freestanding ${def.name}`,
    workerCount,
    state: 'traveling',
    position: { ...(getPrimaryHQ(state)?.center || position) },
    targetPosition: { ...position },
    totalCost: cost,
    deductedCost: { wood: 0, metal: 0, bricks: 0, tools: 0 },
    progress: 0,
    createdAt: Date.now(),
  };

  const newFreestandingList = [...state.freestandingBuildings, freestandingObj];
  const updatedOrders = [
    ...(state.constructionOrders || []).filter((o) => o.buildingId !== dummyBldg.id),
    constructionOrder,
  ];

  const { storageCap, livingCap, defenseRating, squadCapacity } = recalculateSettlementStats(
    state.headquarters,
    state.primaryHQId ?? null,
    state.adaptedBuildings,
    newFreestandingList
  );

  const intermediateState: SettlementState = {
    ...state,
    freestandingBuildings: newFreestandingList,
    constructionOrders: updatedOrders,
    totalStorageCapacity: storageCap,
    totalLivingCapacity: livingCap,
    totalDefenseRating: defenseRating,
    squadCapacity,
  };

  return {
    success: true,
    newState: recalculateLaborDistribution(intermediateState),
  };
}

/**
 * Estimates recoverable materials for a plain, unadapted OSM building (§7.2).
 */
export function estimateOsmBuildingMaterials(bldg: BuildingPolygon): ResourceCost {
  const area = Math.max(20, calculatePolygonArea(bldg.polygon || []));
  const levels = Math.max(1, bldg.levels || 1);

  const isMasonryHeavy = ['commercial', 'supermarket', 'warehouse', 'industrial', 'civic', 'hospital', 'school'].includes(
    bldg.type
  );

  return {
    wood: Math.max(5, Math.round(area * (isMasonryHeavy ? 0.1 : 0.25) * levels)),
    metal: Math.max(5, Math.round(area * (isMasonryHeavy ? 0.15 : 0.08) * levels)),
    bricks: Math.max(10, Math.round(area * (isMasonryHeavy ? 0.4 : 0.25) * levels)),
  };
}

/**
 * Deconstruction work scales with building size: bigger buildings take longer
 * and support more assigned workers to speed up (§7.2).
 */
export function computeDeconstructionWork(
  footprintAreaM2: number,
  levels: number
): { workRequired: number; maxWorkers: number } {
  const area = Math.max(20, footprintAreaM2);
  return {
    workRequired: Math.round(80 + area * 0.4 + Math.max(1, levels) * 25),
    maxWorkers: Math.min(6, Math.max(3, Math.floor(area / 60))),
  };
}

/**
 * Starts a building deconstruction job (§7.2).
 *
 * This mirrors construction (§4.6): ordering deconstruction does not remove the
 * building — it registers a tracked job, assigns Construction workers to it, and
 * the building stays visible on the map (with progress) until the job completes,
 * at which point the recovered materials enter storage and the building is removed.
 */
export function orderDeconstruction(
  state: SettlementState,
  buildingId: string | number,
  plainBuilding?: BuildingPolygon
): { success: boolean; newState: SettlementState; error?: string } {
  if (state.deconstructionJobs.has(buildingId)) {
    return { success: false, newState: state, error: 'Deconstruction is already underway on this structure.' };
  }

  // Only a *standing* primary command center is protected — rubble from a
  // breached HQ is deconstructable like any other ruin.
  const commandCenter = getPrimaryHQ(state);
  if (
    commandCenter &&
    isHQOperational(commandCenter) &&
    String(commandCenter.buildingId) === String(buildingId)
  ) {
    return { success: false, newState: state, error: 'The headquarters cannot be deconstructed.' };
  }

  let source: DeconstructionSource;
  let buildingName = 'Structure';
  let position: Point2D = { x: 0, z: 0 };
  let recover: ResourceCost = { wood: 0, metal: 0, bricks: 0 };
  let footprintArea = 60;
  let levels = 1;

  const adapted = state.adaptedBuildings.get(buildingId);
  if (adapted) {
    source = 'adapted';
    buildingName = adapted.name;
    position = adapted.position;
    footprintArea = adapted.footprintAreaM2;
    levels = adapted.levels || 1;
    const def = FUNCTIONAL_BUILDING_DEFINITIONS[adapted.typeId];
    recover = {
      wood: Math.round(def.adaptationCost.wood * 0.5),
      metal: Math.round(def.adaptationCost.metal * 0.5),
      bricks: Math.round(def.adaptationCost.bricks * 0.5),
    };
  } else {
    const freeIdx = state.freestandingBuildings.findIndex((f) => f.buildingId === buildingId);
    if (freeIdx !== -1) {
      const free = state.freestandingBuildings[freeIdx];
      source = 'freestanding';
      buildingName = free.name;
      position = free.position;
      footprintArea = free.footprintAreaM2;
      levels = free.levels || 1;
      const def = FUNCTIONAL_BUILDING_DEFINITIONS[free.typeId];
      recover = {
        wood: Math.round(def.freestandingCost.wood * 0.5),
        metal: Math.round(def.freestandingCost.metal * 0.5),
        bricks: Math.round(def.freestandingCost.bricks * 0.5),
      };
    } else if (plainBuilding) {
      source = 'osm';
      buildingName = plainBuilding.name || `${plainBuilding.type.toUpperCase()} STRUCTURE`;
      position = plainBuilding.center;
      footprintArea = Math.max(20, calculatePolygonArea(plainBuilding.polygon || []));
      levels = Math.max(1, plainBuilding.levels || 1);
      recover = estimateOsmBuildingMaterials(plainBuilding);
    } else {
      return { success: false, newState: state, error: 'Structure not found for deconstruction.' };
    }
  }

  const { workRequired, maxWorkers } = computeDeconstructionWork(footprintArea, levels);

  const job: DeconstructionJob = {
    buildingId,
    buildingName,
    source,
    position,
    recoverWood: recover.wood,
    recoverMetal: recover.metal,
    recoverBricks: recover.bricks,
    workRequired,
    workDone: 0,
    assignedWorkers: 0,
    maxWorkers,
    startedAt: Date.now(),
    progressPct: 0,
    state: 'dismantling',
    carriedMaterials: { wood: 0, metal: 0, bricks: 0 },
  };

  const newJobs = new Map(state.deconstructionJobs);
  newJobs.set(buildingId, job);

  return {
    success: true,
    newState: recalculateLaborDistribution({ ...state, deconstructionJobs: newJobs }),
  };
}

/**
 * Cancels an in-progress deconstruction job. The building remains untouched and
 * its assigned workers return to the general labour pool.
 */
export function cancelDeconstruction(
  state: SettlementState,
  buildingId: string | number
): SettlementState {
  if (!state.deconstructionJobs.has(buildingId)) return state;
  const newJobs = new Map(state.deconstructionJobs);
  newJobs.delete(buildingId);
  return recalculateLaborDistribution({ ...state, deconstructionJobs: newJobs });
}
