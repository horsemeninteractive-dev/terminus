import {
  calculateBuildingStats,
  calculatePolygonArea,
  FUNCTIONAL_BUILDING_DEFINITIONS,
  getAdaptedCost,
} from '../data/functionalBuildings';
import { BuildingPolygon, Point2D } from '../types/map';
import {
  AdaptedBuilding,
  ConstructionWorkOrder,
  DeconstructionJob,
  DeconstructionSource,
  FunctionalBuildingTypeId,
  ResourceCost,
  SettlementHQ,
  SettlementState,
  SettlementStockpile,
} from '../types/settlement';
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
} from './researchService';
import { createInitialMoraleState } from './moraleService';
import { createInitialWeatherState } from './weatherService';

/**
 * Initial starting resources for a new outpost settlement per §7.2
 */
export const INITIAL_STOCKPILE: SettlementStockpile = {
  food: {
    canned_goods: 45,
    mre_rations: 25,
    dried_rations: 30,
    fresh_harvest: 10,
  },
  water: {
    bottled_water: 60,
    purified_water: 40,
    rainwater: 20,
  },
  medical: {
    first_aid_kits: 8,
    sterile_bandages: 18,
    antibiotics: 6,
    painkillers: 12,
  },
  fuel: {
    gasoline: 35,
    diesel: 25,
    biofuel: 0,
  },
  ammo: {
    sharedPool: 120, // Shared ammunition pool
  },
  materials: {
    wood: 180,
    metal: 140,
    bricks: 120,
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

  // Resource level multiplier (scarce = 0.5x, standard = 1.0x, plentiful = 1.8x)
  let supplyMult = 1.0;
  if (scenario?.startingSupplies === 'scarce' || scenario?.resourcesLevel === 1) {
    supplyMult = 0.5;
  } else if (scenario?.startingSupplies === 'plentiful' || scenario?.resourcesLevel === 3) {
    supplyMult = 1.8;
  }

  const stockpile: SettlementStockpile = {
    food: {
      canned_goods: Math.round(INITIAL_STOCKPILE.food.canned_goods * supplyMult),
      mre_rations: Math.round(INITIAL_STOCKPILE.food.mre_rations * supplyMult),
      dried_rations: Math.round(INITIAL_STOCKPILE.food.dried_rations * supplyMult),
      fresh_harvest: Math.round(INITIAL_STOCKPILE.food.fresh_harvest * supplyMult),
    },
    water: {
      bottled_water: Math.round(INITIAL_STOCKPILE.water.bottled_water * supplyMult),
      purified_water: Math.round(INITIAL_STOCKPILE.water.purified_water * supplyMult),
      rainwater: Math.round(INITIAL_STOCKPILE.water.rainwater * supplyMult),
    },
    medical: {
      first_aid_kits: Math.max(1, Math.round(INITIAL_STOCKPILE.medical.first_aid_kits * supplyMult)),
      sterile_bandages: Math.round(INITIAL_STOCKPILE.medical.sterile_bandages * supplyMult),
      antibiotics: Math.max(1, Math.round(INITIAL_STOCKPILE.medical.antibiotics * supplyMult)),
      painkillers: Math.round(INITIAL_STOCKPILE.medical.painkillers * supplyMult),
    },
    fuel: {
      gasoline: Math.round(INITIAL_STOCKPILE.fuel.gasoline * supplyMult),
      diesel: Math.round(INITIAL_STOCKPILE.fuel.diesel * supplyMult),
      biofuel: 0,
    },
    ammo: {
      sharedPool: Math.round(INITIAL_STOCKPILE.ammo.sharedPool * supplyMult),
    },
    materials: {
      wood: Math.round(INITIAL_STOCKPILE.materials.wood * supplyMult),
      metal: Math.round(INITIAL_STOCKPILE.materials.metal * supplyMult),
      bricks: Math.round(INITIAL_STOCKPILE.materials.bricks * supplyMult),
    },
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
    isInitialized: false,
    hq: null,
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
    rivalHideouts: new Map(),
    zombieLairs: new Map(),
    deconstructionJobs: new Map(),
    demolishedBuildings: new Map(),
    armory: { weapons: [], armor: [] },
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
      wood: current.materials.wood + (delta.materials?.wood || 0),
      metal: current.materials.metal + (delta.materials?.metal || 0),
      bricks: current.materials.bricks + (delta.materials?.bricks || 0),
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
  return (
    stockpile.materials.wood >= cost.wood &&
    stockpile.materials.metal >= cost.metal &&
    stockpile.materials.bricks >= cost.bricks
  );
}

/**
 * Deducts materials from settlement stockpile
 */
export function deductCost(stockpile: SettlementStockpile, cost: ResourceCost): SettlementStockpile {
  return {
    ...stockpile,
    materials: {
      wood: Math.max(0, stockpile.materials.wood - cost.wood),
      metal: Math.max(0, stockpile.materials.metal - cost.metal),
      bricks: Math.max(0, stockpile.materials.bricks - cost.bricks),
    },
  };
}

/**
 * Total item units currently held across every stockpile category — the unit
 * that totalStorageCapacity is measured in (IFZ-style finite physical storage).
 */
export function getStockpileUnits(stockpile: SettlementStockpile): number {
  let units = 0;
  for (const category of Object.values(stockpile)) {
    for (const value of Object.values(category as Record<string, number>)) {
      if (typeof value === 'number') units += value;
    }
  }
  return units;
}

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
    },
  };
}

/**
 * Calculates aggregate settlement stats across all adapted & freestanding buildings
 */
export function recalculateSettlementStats(
  hq: SettlementHQ | null,
  adaptedBuildings: Map<string | number, AdaptedBuilding>,
  freestanding: AdaptedBuilding[]
) {
  let storageCap = 250; // Base baseline storage
  let livingCap = 0;
  let defenseRating = 0;
  // HQ provides the first 2 deployable squad slots; each built Squad Quarters
  // adds another from its building definition.
  let squadCapacity = 2;

  if (hq) {
    storageCap += Math.round(hq.footprintAreaM2 * 0.5);
    // HQ is the colony's primary shelter. Its functional capacity is computed
    // when it is established; use that value rather than a footprint-only
    // estimate so the warning and morale calculation agree with the HQ panel.
    livingCap += Math.max(2, hq.maxCapacity || Math.floor(hq.footprintAreaM2 / 20));
    defenseRating += hq.defenseRating;
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
    defenseRating += bldg.defenseRating;
    if (STORAGE_TYPES.includes(bldg.typeId)) {
      storageCap += bldg.maxCapacity;
    } else if (LIVING_TYPES.includes(bldg.typeId)) {
      livingCap += bldg.maxCapacity;
    }
    if (SQUAD_CAPACITY_TYPES.includes(bldg.typeId)) {
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
  const stats = calculateBuildingStats('shelter_bunkhouse', bldg, true);
  const hqStats: SettlementHQ = {
    buildingId: bldg.id,
    buildingName: bldg.name || `${bldg.type.toUpperCase()} COMMAND HQ`,
    establishedAt: Date.now(),
    footprintAreaM2: stats.footprintArea,
    levels: bldg.levels,
    center: bldg.center,
    defenseRating: stats.baseDefense + 50, // HQ fortified bonus
    maxCapacity: stats.maxCapacity,
  };

  const adaptedBuildings = new Map(state.adaptedBuildings);

  const { storageCap, livingCap, defenseRating, squadCapacity } = recalculateSettlementStats(
    hqStats,
    adaptedBuildings,
    state.freestandingBuildings
  );

  const intermediateState: SettlementState = {
    ...state,
    isInitialized: true,
    hq: hqStats,
    adaptedBuildings,
    totalStorageCapacity: storageCap,
    totalLivingCapacity: livingCap,
    totalDefenseRating: defenseRating,
    squadCapacity,
  };

  return recalculateLaborDistribution(intermediateState);
}

/**
 * Converts a real OSM building into an adapted functional structure (§7.1, §7.2)
 */
export function adaptBuilding(
  state: SettlementState,
  bldg: BuildingPolygon,
  typeId: FunctionalBuildingTypeId
): { success: boolean; newState: SettlementState; error?: string } {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS[typeId];
  if (!def) {
    return { success: false, newState: state, error: 'Unknown functional building type' };
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

  // IFZ rule: a real building must be scavenged/cleared before it can be
  // converted into a functional structure. You cannot adapt untouched loot.
  const searchState = state.buildingSearches?.get(bldg.id);
  if (!searchState?.searched) {
    return {
      success: false,
      newState: state,
      error: 'This building must be scavenged and cleared before it can be adapted.',
    };
  }

  const cost = getAdaptedCost(typeId, bldg.type);
  if (!canAffordCost(state.stockpile, cost)) {
    return {
      success: false,
      newState: state,
      error: `Insufficient construction materials (Requires: ${cost.wood}W / ${cost.metal}M / ${cost.bricks}B)`,
    };
  }

  const stats = calculateBuildingStats(typeId, bldg, true);
  const workerCount = Math.max(1, Math.min(3, state.generalPopulation.total || 1));

  const adapted: AdaptedBuilding = {
    buildingId: bldg.id,
    typeId: typeId,
    isHQ: false,
    name: def.name,
    category: def.category,
    adaptedAt: Date.now(),
    footprintAreaM2: stats.footprintArea,
    totalFloorAreaM2: stats.totalFloorArea,
    volumeM3: stats.volume,
    maxCapacity: stats.maxCapacity,
    currentUsage: 0,
    capacityUnit: stats.capacityUnit,
    maxDurability: stats.maxDurability,
    currentDurability: stats.maxDurability,
    defenseRating: stats.baseDefense,
    isFreestanding: false,
    position: bldg.center,
    height: bldg.height,
    levels: bldg.levels,
    polygon: bldg.polygon,
    constructionStatus: 'in_progress',
    constructionProgress: 0,
    constructionWorkRequired: 100,
    constructionWorkDone: 0,
    assignedWorkers: workerCount,
  };

  const newAdaptedMap = new Map(state.adaptedBuildings);
  newAdaptedMap.set(bldg.id, adapted);

  const constructionOrder: ConstructionWorkOrder = {
    id: `const_${bldg.id}_${Date.now()}`,
    buildingId: bldg.id,
    buildingName: def.name,
    workerCount,
    state: 'traveling',
    position: { ...(state.hq?.center || bldg.center) },
    targetPosition: { ...bldg.center },
    totalCost: cost,
    deductedCost: { wood: 0, metal: 0, bricks: 0 },
    progress: 0,
    createdAt: Date.now(),
  };

  const updatedOrders = [
    ...(state.constructionOrders || []).filter((o) => o.buildingId !== bldg.id),
    constructionOrder,
  ];

  const { storageCap, livingCap, defenseRating, squadCapacity } = recalculateSettlementStats(
    state.hq,
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
 * Builds a freestanding structure on open terrain (§7.1)
 */
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
  const workerCount = Math.max(1, Math.min(3, state.generalPopulation.total || 1));

  const freestandingObj: AdaptedBuilding = {
    buildingId: dummyBldg.id,
    typeId: typeId,
    isHQ: false,
    name: `Freestanding ${def.name}`,
    category: def.category,
    adaptedAt: Date.now(),
    footprintAreaM2: footprintArea,
    totalFloorAreaM2: footprintArea,
    volumeM3: footprintArea * customHeight,
    maxCapacity: Math.max(2, Math.floor(stats.maxCapacity * 0.7)),
    currentUsage: 0,
    capacityUnit: stats.capacityUnit,
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
    position: { ...(state.hq?.center || position) },
    targetPosition: { ...position },
    totalCost: cost,
    deductedCost: { wood: 0, metal: 0, bricks: 0 },
    progress: 0,
    createdAt: Date.now(),
  };

  const newFreestandingList = [...state.freestandingBuildings, freestandingObj];
  const updatedOrders = [
    ...(state.constructionOrders || []).filter((o) => o.buildingId !== dummyBldg.id),
    constructionOrder,
  ];

  const { storageCap, livingCap, defenseRating, squadCapacity } = recalculateSettlementStats(
    state.hq,
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

  if (state.hq && String(state.hq.buildingId) === String(buildingId)) {
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
