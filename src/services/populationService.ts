import { BuildingPolygon } from '../types/map';
import { PathGrid, stepAlongPath } from './pathfindingService';
import { ElevationGrid } from '../types/map';
import { terrainSlopeSpeedFactor } from './elevationService';
import {
  CitizenBreakdownStats,
  ChildCitizen,
  GeneralPopulation,
  GroupDisposition,
  HiddenSurvivorGroup,
  JobSector,
  NamedSurvivor,
  Squad,
  StatTier,
  SurvivorStats,
  WorkerJobInfo,
  WorkerJobTypeId,
  WorkerPriorityLevel,
  SquadWeaponLoadout,
  SquadArmorLoadout,
} from '../types/population';
import {
  AdaptedBuilding,
  AutomatedRepairConfig,
  ConstructionWorkOrder,
  FunctionalBuildingTypeId,
  FunctionalCategory,
  ProductionRecipe,
  SettlementState,
  SettlementStockpile,
} from '../types/settlement';
import { getPrimaryHQ, isBuildingOperational } from './buildingOperational';
import { getPoweredBuildingIds } from './powerService';
import { getActiveLaw } from './lawService';
import { bumpLifetimeStat, createInitialLifetimeStats, recalculateSettlementStats } from './settlementService';
import { depositWithinCapacity, getStockpileUnits } from './stockpileCapacity';
import { strandMaterialsAt } from './strandedLootService';
import { calculateCropYieldFactors } from './weatherService';
import {
  FUNCTIONAL_BUILDING_DEFINITIONS,
  getBuildingWorkerSlots,
} from '../data/functionalBuildings';
import { isResearchUnlocked } from './researchService';
import { ArmorItemId, WeaponItemId } from '../types/combat';

export type {
  WorkerJobTypeId,
  WorkerPriorityLevel,
  WorkerJobInfo,
  CitizenBreakdownStats,
} from '../types/population';

export const ALL_WORKER_JOB_TYPES: WorkerJobTypeId[] = [
  'builder',
  'scavenger',
  'farming',
  'food_prep',
  'guard',
  'factory',
  'scientist',
  'nurse',
  'trainer',
  'logistics',
];

export const DEFAULT_WORKER_PRIORITIES: Record<WorkerJobTypeId, WorkerPriorityLevel> = {
  builder: 3,
  scavenger: 2,
  farming: 3,
  food_prep: 2,
  guard: 2,
  factory: 2,
  scientist: 2,
  nurse: 3,
  trainer: 3,
  logistics: 2,
};

export const DEFAULT_WORKER_LIMITS: Record<WorkerJobTypeId, number> = {
  builder: 9999,
  scavenger: 9999,
  farming: 9999,
  food_prep: 9999,
  guard: 9999,
  factory: 9999,
  scientist: 9999,
  nurse: 9999,
  trainer: 9999,
  logistics: 9999,
};

export const WORKER_JOB_METADATA: Record<
  WorkerJobTypeId,
  { name: string; iconName: string; category: string }
> = {
  builder: { name: 'BUILDER', iconName: 'Hammer', category: 'Construction' },
  scavenger: { name: 'SCAVENGER', iconName: 'Pickaxe', category: 'Gathering' },
  farming: { name: 'FARMING', iconName: 'Sprout', category: 'Food' },
  food_prep: { name: 'FOOD PREPARATION', iconName: 'Soup', category: 'Food' },
  guard: { name: 'GUARD', iconName: 'Shield', category: 'Defense' },
  factory: { name: 'FACTORY WORKER', iconName: 'Factory', category: 'Industry' },
  scientist: { name: 'SCIENTIST', iconName: 'FlaskConical', category: 'Research' },
  nurse: { name: 'NURSE', iconName: 'HeartPulse', category: 'Medical' },
  trainer: { name: 'RANGE OFFICER', iconName: 'Crosshair', category: 'Military' },
  // §Terminus: Expedition Center staff are planners/coordinators — convoy,
  // caravan and migration logistics — NOT scientists. Their own category.
  logistics: { name: 'LOGISTICS', iconName: 'Truck', category: 'Logistics' },
};

/**
 * Calculates demographic breakdown of colony citizens
 */
export function calculateCitizenBreakdownStats(state: SettlementState): CitizenBreakdownStats {
  const totalGeneral = state.generalPopulation?.total || 0;
  const namedCount = state.namedSurvivors?.length || 0;
  const totalCitizens = totalGeneral + namedCount;

  // Children are tracked records. Legacy saves without records are treated as
  // having no children rather than inventing a percentage of the population.
  const children = (state.generalPopulation?.children || []).filter((child) => child.age < 16).length;
  const homeless = Math.max(0, totalCitizens - (state.totalLivingCapacity || 0));
  const ill = Math.max(0, state.infections?.size || 0);

  // Adult/child work rules (§IFZ Major Update #5): the Child Labour Permitted
  // law lets children join the general labour pool; otherwise they are fully
  // excluded from work (baseline Terminus rule).
  const childLabor = getActiveLaw(state).childLaborAllowed;

  const squadMembers = (state.squads || []).reduce(
    (sum, sq) => sum + 1 + (sq.generalCount || 0),
    0
  );
  const committedWorkers = (state.resourceWorkOrders || []).reduce((sum, order) => sum + Math.max(0, order.workerCount || 0), 0)
    + Array.from(state.deconstructionJobs?.values() || []).reduce((sum, job) => sum + Math.max(0, job.assignedWorkers || 0), 0)
    + (state.constructionOrders || []).reduce((sum, order) => sum + Math.max(0, order.workerCount || 0), 0);

  const totalWorkers = Math.max(0, totalCitizens - (childLabor ? 0 : children) - squadMembers - ill);
  const assignedMap = state.generalPopulation?.assignedWorkerJobs || ({} as Record<WorkerJobTypeId, number>);
  const totalAssigned = Object.values(assignedMap).reduce((sum, val) => sum + (val || 0), 0);
  const unemployed = Math.max(0, totalWorkers - totalAssigned - committedWorkers);

  return {
    totalCitizens,
    children,
    homeless,
    ill,
    unemployed,
    totalWorkers,
    squadMembers,
    committedWorkers,
  };
}

/**
 * Computes the maximum worker capacity / demand for each of the 8 job types
 */
/**
 * Which worker job a completed building draws its staff from. Explicit map first
 * (mirrors the historical demand switch), then a category fallback so Terminus
 * extras still slot into a sensible job.
 */
const BUILDING_JOB_MAP: Partial<Record<FunctionalBuildingTypeId, WorkerJobTypeId>> = {
  // Farming
  field: 'farming',
  vast_field: 'farming',
  greenhouse: 'farming',
  greenhouse_hydro: 'farming',
  barn: 'farming',
  // Food Preparation
  cookhouse: 'food_prep',
  cannery: 'food_prep',
  food_pantry: 'food_prep',
  // Guard / Defence
  wooden_tower: 'guard',
  metal_tower: 'guard',
  fortified_tower: 'guard',
  // NB: floodlight_tower intentionally absent — it is powered illumination,
  // not a garrison, so it falls through to the guardable gate below (null).
  guard_watchtower: 'guard',
  // §IFZ Shooting Range — staff are RANGE OFFICERS running training lanes, not
  // guards manning a firing post. The range's workers open training lanes and
  // accelerate courses (see trainingService).
  shooting_range: 'trainer',
  wooden_gate: 'guard',
  metal_gate: 'guard',
  fortified_gate: 'guard',
  barricade_gatehouse: 'guard',
  // Factory / Industry
  foresters_hut: 'factory',
  sawmill: 'factory',
  timber_mill: 'factory',
  tool_factory: 'factory',
  workshop_forge: 'factory',
  scrapyard: 'factory',
  scrap_smelter: 'factory',
  arms_factory: 'factory',
  armory_cache: 'factory',
  chemical_plant: 'factory',
  protective_gear_factory: 'factory',
  vehicle_workshop: 'factory',
  clay_pit: 'factory',
  generator_station: 'factory',
  // Science / Research
  research_center: 'scientist',
  research_lab: 'scientist',
  weather_center: 'scientist',
  antenna: 'scientist',
  comms_relay: 'scientist',
  // Logistics / Administration (§Terminus): Expedition Center staff plan and
  // coordinate caravans, convoys and migration — a planning role, not science.
  expedition_center: 'logistics',
  // Nurse / Medical
  medbay: 'nurse',
  hospital: 'nurse',
  infirmary_clinic: 'nurse',
};

export function getBuildingJobForType(b: {
  typeId: FunctionalBuildingTypeId;
  category: FunctionalCategory;
}): WorkerJobTypeId | null {
  const explicit = BUILDING_JOB_MAP[b.typeId];
  if (explicit) return explicit;
  if (b.category === 'food') return 'farming';
  // §IFZ: only mannable defences create guard posts. Passive barriers (walls,
  // fences, barbed wire) share the defense categories but are not firing
  // positions — they never attract guard labour, so the colony's guards man
  // towers and gatehouses instead of standing on a palisade run.
  if (b.category === 'defense' || b.category === 'defense_towers' || b.category === 'defense_walls') {
    return FUNCTIONAL_BUILDING_DEFINITIONS[b.typeId]?.guardable ? 'guard' : null;
  }
  if (b.category === 'production') return 'factory';
  if (b.category === 'utility') return 'scientist';
  if (b.category === 'civilian') return 'nurse';
  return null;
}

/**
 * How many construction sites may draw workers/materials simultaneously. Sites
 * beyond this window wait in the construction queue so scarce materials and
 * labour finish one structure before the next one starts draining them.
 */
export const MAX_ACTIVE_CONSTRUCTION_SITES = 3;

/**
 * Sort key for one construction site. An explicit player-set queue index wins;
 * otherwise the order falls back to placement time (earliest first).
 */
export function constructionSitePriorityKey(b: { constructionPriority?: number; adaptedAt?: number }): number {
  if (typeof b.constructionPriority === 'number') return b.constructionPriority;
  return b.adaptedAt || 0;
}

/**
 * All in-progress/planned construction sites ordered by construction priority
 * (earliest first - the construction queue order) plus the active window of
 * the first {@link MAX_ACTIVE_CONSTRUCTION_SITES} of them.
 */
export function getPrioritizedConstructionSites(state: SettlementState): {
  all: AdaptedBuilding[];
  active: AdaptedBuilding[];
} {
  const all = [
    ...Array.from(state.adaptedBuildings.values()),
    ...(state.freestandingBuildings || []),
  ]
    .filter((b) => b.constructionStatus === 'in_progress' || b.constructionStatus === 'planned')
    // Stable sort: ties keep insertion order.
    .sort((a, b) => constructionSitePriorityKey(a) - constructionSitePriorityKey(b));
  return { all, active: all.slice(0, MAX_ACTIVE_CONSTRUCTION_SITES) };
}

/**
 * Promotes or demotes a queued construction site, rewriting the explicit
 * priority of every in-progress site so the new order sticks. Labour is
 * recalculated so builders and materials reflow to the new active window.
 */
export function reorderConstructionQueue(
  state: SettlementState,
  buildingId: string | number,
  direction: 'up' | 'down'
): { success: boolean; newState: SettlementState } {
  const sites = getPrioritizedConstructionSites(state).all;
  const idx = sites.findIndex((b) => String(b.buildingId) === String(buildingId));
  if (idx === -1) return { success: false, newState: state };
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sites.length) return { success: false, newState: state };
  [sites[idx], sites[swapIdx]] = [sites[swapIdx], sites[idx]];
  for (let i = 0; i < sites.length; i++) {
    sites[i].constructionPriority = i;
  }
  return { success: true, newState: recalculateLaborDistribution(state) };
}

/** Default Repairmen Shop behaviour — every maintenance band enabled, which is
 *  also what legacy saves (no `automatedRepairConfig`) behave as. */
export const DEFAULT_AUTOMATED_REPAIR_CONFIG: AutomatedRepairConfig = {
  emergency: true,
  high: true,
  normal: true,
  low: true,
};

/** Resolves the settlement's Repairmen Shop band config (legacy saves = all on). */
export function getAutomatedRepairConfig(
  state: Pick<SettlementState, 'automatedRepairConfig'> | null | undefined
): AutomatedRepairConfig {
  return state?.automatedRepairConfig ?? DEFAULT_AUTOMATED_REPAIR_CONFIG;
}

export function getWorkerJobDemand(state: SettlementState): Record<WorkerJobTypeId, number> {
  const demand: Record<WorkerJobTypeId, number> = {
    builder: 0,
    scavenger: 0,
    farming: 0,
    food_prep: 0,
    guard: 0,
    factory: 0,
    scientist: 0,
    nurse: 0,
    trainer: 0,
    logistics: 0,
  };

  if (!state.isInitialized || !getPrimaryHQ(state)) {
    return demand;
  }

  const adaptedArray = [
    ...Array.from(state.adaptedBuildings.values()),
    ...(state.freestandingBuildings || []),
  ];

  // 1. Builder Demand — staff only the active construction window. Sites
  // queued behind it don't consume builder labour until they become active.
  const constructionQueue = getPrioritizedConstructionSites(state);
  const deconstructionJobs = Array.from(state.deconstructionJobs?.values() || []);
  const damagedBuildings = adaptedArray.filter(
    (b) => b.currentDurability < (b.maxDurability || 100)
  );
  demand.builder = constructionQueue.active.length * 6 + deconstructionJobs.length * 4 + damagedBuildings.length * 2;
  // If no projects active, provide nominal capacity if headquarters is active
  if (demand.builder === 0 && adaptedArray.length > 0) {
    demand.builder = 10;
  }

  // 2. Scavenger Demand
  const resourceOrders = state.resourceWorkOrders || [];
  demand.scavenger = Math.max(0, resourceOrders.length * 6);
  // Also count searchable buildings if any
  const searchCount = state.buildingSearches ? state.buildingSearches.size : 0;
  demand.scavenger += searchCount * 4;
  if (demand.scavenger === 0) {
    demand.scavenger = 20; // Ready standby scavenging pool
  }

  // 3-8. Building-specific Capacities — worker slots scale with physical size
  // (IFZ-style), so a bigger building demands (and can staff) more workers.
  for (const b of adaptedArray) {
    if (b.constructionStatus !== 'completed') continue;
    const job = getBuildingJobForType(b);
    if (!job) continue;
    demand[job] += getBuildingWorkerSlots(b);
  }

  // Basic HQ baseline capacity for small colonies
  if (getPrimaryHQ(state)) {
    demand.guard = Math.max(demand.guard, 2);
    demand.builder = Math.max(demand.builder, 4);
    demand.scavenger = Math.max(demand.scavenger, 6);
  }

  return demand;
}

// Starter named specialist survivors pool
export const STARTER_NAMED_SURVIVORS_POOL: NamedSurvivor[] = [
  {
    id: 'starter_marcus_vance',
    name: 'Capt. Marcus Vance',
    avatarSeed: 'marcus_vance',
    background: 'Former tactical squad captain with years of perimeter defense and combat scout leadership experience.',
    stats: {
      combat: 'expert' as StatTier,
      scavenging: 'skilled' as StatTier,
      medical: 'novice' as StatTier,
      driving: 'expert' as StatTier,
      persuasion: 'skilled' as StatTier,
      construction: 'skilled' as StatTier,
      production: 'novice' as StatTier,
    },
    role: { type: 'unassigned' },
    morale: 85,
    recruitedAt: 0,
  },
  {
    id: 'starter_vera_chen',
    name: 'Vera "Sparks" Chen',
    avatarSeed: 'vera_chen',
    background: 'Civil and electrical engineer specialized in workshop logistics, power grids, and fortifications.',
    stats: {
      combat: 'novice' as StatTier,
      scavenging: 'skilled' as StatTier,
      medical: 'novice' as StatTier,
      driving: 'skilled' as StatTier,
      persuasion: 'skilled' as StatTier,
      construction: 'expert' as StatTier,
      production: 'expert' as StatTier,
    },
    role: { type: 'unassigned' },
    morale: 85,
    recruitedAt: 0,
  },
  {
    id: 'starter_sarah_keller',
    name: 'Dr. Sarah Keller',
    avatarSeed: 'sarah_keller',
    background: 'Trauma surgeon and emergency triage specialist dedicated to colony hygiene, botanicals, and medicine.',
    stats: {
      combat: 'novice' as StatTier,
      scavenging: 'skilled' as StatTier,
      medical: 'expert' as StatTier,
      driving: 'novice' as StatTier,
      persuasion: 'expert' as StatTier,
      construction: 'novice' as StatTier,
      production: 'skilled' as StatTier,
    },
    role: { type: 'unassigned' },
    morale: 85,
    recruitedAt: 0,
  },
];

/**
 * Returns starter named survivors based on people setting
 * Low = 1 (Capt. Marcus Vance), Medium = 2 (Vance + Chen), High = 3 (Vance + Chen + Dr. Keller)
 */
export function getStarterNamedSurvivors(count: number): NamedSurvivor[] {
  const effectiveCount = Math.max(1, Math.min(count, STARTER_NAMED_SURVIVORS_POOL.length));
  return STARTER_NAMED_SURVIVORS_POOL.slice(0, effectiveCount).map((s) => ({
    ...s,
    recruitedAt: Date.now(),
  }));
}

// Default starter named survivors (Medium: 2 named specialists)
export const INITIAL_NAMED_SURVIVORS: NamedSurvivor[] = getStarterNamedSurvivors(2);

// Default general population (Medium: 24 general workers)
export const INITIAL_GENERAL_POPULATION: GeneralPopulation = {
  total: 24,
  children: [],
  inSquads: 0,
  assignedJobs: { construction: 0, food: 0, defense: 0, production: 0, medical: 0, other: 0 },
  unassigned: 24,
};

export const DEFAULT_JOB_PRIORITIES: Record<JobSector, number> = {
  construction: 1, // Highest priority
  food: 2,
  defense: 3,
  production: 4,
  medical: 5,
  other: 6,
};

/**
 * Returns head title matching building category/type
 */
export function getDefaultHeadTitle(typeId: FunctionalBuildingTypeId): string {
  switch (typeId) {
    case 'cookhouse':
      return 'Head Chef';
    case 'greenhouse_hydro':
      return 'Master Botanist';
    case 'food_pantry':
      return 'Pantry Quartermaster';
    case 'infirmary_clinic':
      return 'Chief Medical Officer';
    case 'workshop_forge':
      return 'Master Blacksmith';
    case 'timber_mill':
    case 'scrap_smelter':
      return 'Production Supervisor';
    case 'guard_watchtower':
      return 'Chief Sentry';
    case 'barricade_gatehouse':
      return 'Gate Commander';
    case 'armory_cache':
      return 'Armorer';
    case 'shelter_bunkhouse':
      return 'Warden';
    case 'storage_depot':
      return 'Logistics Coordinator';
    case 'water_cistern':
      return 'Hydrology Supervisor';
    case 'generator_station':
    case 'comms_relay':
      return 'Chief Engineer';
    case 'community_hall':
      return 'Council Delegate';
    default:
      return 'Facility Supervisor';
  }
}

/**
 * Generates procedural hidden survivor groups inside real OSM buildings
 */
export function generateHiddenGroupsForMap(
  buildings: BuildingPolygon[],
  hqBuildingId: string | number | null = null
): Map<string | number, HiddenSurvivorGroup> {
  const map = new Map<string | number, HiddenSurvivorGroup>();
  if (!buildings || buildings.length === 0) return map;

  // Filter valid candidate buildings (not HQ, decent area > 80m2)
  const candidates = buildings.filter(
    (b) => String(b.id) !== String(hqBuildingId) && (b.levels || 1) >= 1
  );

  if (candidates.length === 0) return map;

  // Shuffle and pick 4 to 8 buildings
  const shuffled = [...candidates].sort(() => 0.5 - Math.random());
  const count = Math.min(shuffled.length, Math.floor(Math.random() * 4) + 4);

  const groupTemplates = [
    {
      name: 'Nora Hayes',
      bg: 'Former high school biology teacher and community botanist.',
      disposition: 'willing' as GroupDisposition,
      dialogue: '"We saw your outpost flag from the rooftop! We have families, children, and few supplies left. Please, let us join your settlement."',
      stats: {
        combat: 'novice' as StatTier,
        scavenging: 'skilled' as StatTier,
        medical: 'skilled' as StatTier,
        driving: 'novice' as StatTier,
        persuasion: 'expert' as StatTier,
        construction: 'novice' as StatTier,
        production: 'expert' as StatTier,
      },
      generalCount: 4,
      hasSmoke: true,
    },
    {
      name: 'Garrison Miller',
      bg: 'Retired highway patrol officer, guarded a grocery basement with barricades.',
      disposition: 'distrustful' as GroupDisposition,
      dialogue: '"Keep your hands where I can see them. We’ve had marauders try to sweet-talk us before. If you want our people, you’d better prove you can feed us and keep your word."',
      stats: {
        combat: 'expert' as StatTier,
        scavenging: 'skilled' as StatTier,
        medical: 'novice' as StatTier,
        driving: 'expert' as StatTier,
        persuasion: 'novice' as StatTier,
        construction: 'skilled' as StatTier,
        production: 'novice' as StatTier,
      },
      generalCount: 3,
      hasSmoke: true,
      foodCost: 25,
    },
    {
      name: 'Vera "Sparks" Chen',
      bg: 'Electrical engineer and amateur radio operator holding out in an attic.',
      disposition: 'willing' as GroupDisposition,
      dialogue: '"You guys have a power grid setup? Thank god. My battery bank died yesterday. I have tools and two technicians with me ready to work."',
      stats: {
        combat: 'novice' as StatTier,
        scavenging: 'skilled' as StatTier,
        medical: 'novice' as StatTier,
        driving: 'novice' as StatTier,
        persuasion: 'skilled' as StatTier,
        construction: 'skilled' as StatTier,
        production: 'expert' as StatTier,
      },
      generalCount: 3,
      hasSmoke: true,
    },
    {
      name: 'Darius Thorne',
      bg: 'Fiercely territorial scavenger gang leader holed up with weapons.',
      disposition: 'hostile' as GroupDisposition,
      dialogue: '"Step off, colonist! This street belongs to the Iron Vultures. One more step toward our barricade and we open fire!"',
      stats: {
        combat: 'expert' as StatTier,
        scavenging: 'expert' as StatTier,
        medical: 'novice' as StatTier,
        driving: 'skilled' as StatTier,
        persuasion: 'novice' as StatTier,
        construction: 'novice' as StatTier,
        production: 'novice' as StatTier,
      },
      generalCount: 5,
      hasSmoke: false,
    },
    {
      name: 'Father Thomas Bailey',
      bg: 'Parish priest sheltering injured refugees in a reinforced cellar.',
      disposition: 'distrustful' as GroupDisposition,
      dialogue: '"We have sick and wounded here. I cannot let outsiders in unless you have genuine medical supplies and peaceful intentions."',
      stats: {
        combat: 'novice' as StatTier,
        scavenging: 'novice' as StatTier,
        medical: 'skilled' as StatTier,
        driving: 'novice' as StatTier,
        persuasion: 'expert' as StatTier,
        construction: 'novice' as StatTier,
        production: 'skilled' as StatTier,
      },
      generalCount: 5,
      hasSmoke: true,
      foodCost: 15,
    },
    {
      name: 'Reese Callahan',
      bg: 'Automotive mechanic and machinist who fortified a service bay.',
      disposition: 'willing' as GroupDisposition,
      dialogue: '"Look at this place—we’re down to our last can of peaches. If you’ve got a secure perimeter and a warm forge, count us in."',
      stats: {
        combat: 'skilled' as StatTier,
        scavenging: 'skilled' as StatTier,
        medical: 'novice' as StatTier,
        driving: 'expert' as StatTier,
        persuasion: 'novice' as StatTier,
        construction: 'skilled' as StatTier,
        production: 'expert' as StatTier,
      },
      generalCount: 3,
      hasSmoke: false,
    },
  ];

  for (let i = 0; i < count; i++) {
    const bldg = shuffled[i];
    const template = groupTemplates[i % groupTemplates.length];
    const groupId = `hidden_group_${bldg.id}`;

    map.set(bldg.id, {
      id: groupId,
      buildingId: bldg.id,
      buildingName: bldg.name || `Building #${bldg.id}`,
      hasSmokeClue: template.hasSmoke,
      isDiscovered: false,
      isRecruited: false,
      leader: {
        name: template.name,
        background: template.bg,
        stats: template.stats,
      },
      generalCount: template.generalCount,
      disposition: template.disposition,
      dialogue: template.dialogue,
      foodCostToBribe: template.foodCost,
    });
  }

  return map;
}

/**
 * Recalculates and auto-distributes general workforce based on job demand and priorities (§4.6)
 */
export function recalculateLaborDistribution(state: SettlementState): SettlementState {
  const currentGeneral = state.generalPopulation || {
    total: 24,
    children: [],
    inSquads: 0,
    assignedJobs: { construction: 0, food: 0, defense: 0, production: 0, medical: 0, other: 0 },
    unassigned: 24,
  };

  // 1. Calculate general workers locked in squads & illness
  let totalInSquads = 0;
  for (const squad of state.squads || []) {
    totalInSquads += squad.generalCount || 0;
  }

  const breakdown = calculateCitizenBreakdownStats(state);
  const totalAvailableWorkers = breakdown.totalWorkers;

  // Retrieve current priority map and limit map (or assign defaults)
  const workerPriorities: Record<WorkerJobTypeId, WorkerPriorityLevel> = {
    ...DEFAULT_WORKER_PRIORITIES,
    ...(currentGeneral.workerPriorities || {}),
  };

  const workerLimits: Record<WorkerJobTypeId, number> = {
    ...DEFAULT_WORKER_LIMITS,
    ...(currentGeneral.workerLimits || {}),
  };

  // Calculate maximum demand per job type
  const demand = getWorkerJobDemand(state);

  // Initialize assigned count per job
  const assignedWorkerJobs: Record<WorkerJobTypeId, number> = {
    builder: 0,
    scavenger: 0,
    farming: 0,
    food_prep: 0,
    guard: 0,
    factory: 0,
    scientist: 0,
    nurse: 0,
    trainer: 0,
    logistics: 0,
  };

  // If HQ is not established yet, all workers remain unassigned
  if (!state.isInitialized || !getPrimaryHQ(state)) {
    return {
      ...state,
      generalPopulation: {
        total: currentGeneral.total,
        children: currentGeneral.children || [],
        inSquads: totalInSquads,
        assignedJobs: { construction: 0, food: 0, defense: 0, production: 0, medical: 0, other: 0 },
        assignedWorkerJobs,
        workerPriorities,
        workerLimits,
        unassigned: totalAvailableWorkers,
      },
    };
  }

  // Resource-gathering orders reserve citizens before normal base labour
  // allocation. They are explicit commitments, not a base job priority.
  const committedWorkers = (state.resourceWorkOrders || []).reduce(
    (sum, order) => sum + Math.max(0, order.workerCount || 0),
    0
  );

  // Group jobs by priority level (4 = Urgent ^^, 3 = High ^, 2 = Normal =, 1 = Low v)
  // Priority 0 = Disabled
  let remainingWorkers = Math.max(0, totalAvailableWorkers - committedWorkers);

  for (let priorityLevel = 4; priorityLevel >= 1; priorityLevel--) {
    if (remainingWorkers <= 0) break;

    const tierJobs = ALL_WORKER_JOB_TYPES.filter(
      (jobId) => workerPriorities[jobId] === priorityLevel && (workerLimits[jobId] ?? 9999) > 0
    );

    if (tierJobs.length === 0) continue;

    // Calculate total unfilled need for this priority tier
    const tierNeeds: { id: WorkerJobTypeId; needed: number }[] = tierJobs.map((id) => {
      const maxAllowed = Math.min(demand[id], workerLimits[id] ?? 9999);
      const needed = Math.max(0, maxAllowed - assignedWorkerJobs[id]);
      return { id, needed };
    });

    const totalTierNeeded = tierNeeds.reduce((sum, item) => sum + item.needed, 0);

    if (totalTierNeeded <= 0) continue;

    if (remainingWorkers >= totalTierNeeded) {
      // Allocate fully to all jobs in this tier
      for (const item of tierNeeds) {
        assignedWorkerJobs[item.id] += item.needed;
        remainingWorkers -= item.needed;
      }
    } else {
      // Proportional / round-robin allocation among jobs in this tier
      for (const item of tierNeeds) {
        if (item.needed <= 0) continue;
        const share = Math.min(
          item.needed,
          Math.floor((remainingWorkers * item.needed) / totalTierNeeded)
        );
        assignedWorkerJobs[item.id] += share;
        remainingWorkers -= share;
      }

      // Distribute any remainder 1 by 1
      for (const item of tierNeeds) {
        if (remainingWorkers <= 0) break;
        const maxAllowed = Math.min(demand[item.id], workerLimits[item.id] ?? 9999);
        if (assignedWorkerJobs[item.id] < maxAllowed) {
          assignedWorkerJobs[item.id] += 1;
          remainingWorkers -= 1;
        }
      }
      break;
    }
  }

  // Update physical site assignments for construction — builders are assigned
  // only to sites inside the active construction window. Sites queued behind
  // the window are cleared to zero workers and hold until they become active.
  const adaptedArray = [
    ...Array.from(state.adaptedBuildings.values()),
    ...(state.freestandingBuildings || []),
  ];
  const constructionQueue = getPrioritizedConstructionSites(state);
  const activeConstructionIds = new Set(constructionQueue.active.map((b) => String(b.buildingId)));
  for (const b of constructionQueue.all) {
    if (!activeConstructionIds.has(String(b.buildingId))) b.assignedWorkers = 0;
  }
  const deconstructionJobs = Array.from(state.deconstructionJobs?.values() || []);
  const totalConstructionWorkers = assignedWorkerJobs.builder;

  const workSites: { assign: (workers: number) => void; cap: number }[] = [
    ...constructionQueue.active.map((b) => ({
      assign: (w: number) => {
        b.assignedWorkers = w;
      },
      cap: Infinity,
    })),
    ...deconstructionJobs.map((j) => ({
      assign: (w: number) => {
        j.assignedWorkers = w;
      },
      cap: j.maxWorkers || 3,
    })),
  ];

  if (workSites.length > 0) {
    const workersPerSite = Math.floor(totalConstructionWorkers / workSites.length);
    let remainder = totalConstructionWorkers % workSites.length;

    for (const site of workSites) {
      const wanted = workersPerSite + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      site.assign(Math.min(wanted, site.cap));
    }
  }

  // Staff completed production/defence buildings: the workers allocated to each
  // job (above) are spread across that job's buildings, each capped at its
  // size-based worker slots. This is what makes "workers go to buildings" — a
  // field with slots but no farming labour produces nothing.
  const completedSites = adaptedArray.filter((b) => isBuildingOperational(b));
  const jobSites = new Map<WorkerJobTypeId, AdaptedBuilding[]>();
  for (const b of completedSites) {
    const job = getBuildingJobForType(b);
    if (!job) continue;
    if (!jobSites.has(job)) jobSites.set(job, []);
    jobSites.get(job)!.push(b);
  }
  for (const job of ALL_WORKER_JOB_TYPES) {
    let pool = assignedWorkerJobs[job];
    const sites = jobSites.get(job) || [];
    for (const b of sites) {
      const slots = getBuildingWorkerSlots(b);
      b.assignedWorkers = Math.min(slots, pool);
      pool = Math.max(0, pool - slots);
    }
  }
  for (const b of completedSites) {
    if (b.assignedWorkers === undefined) b.assignedWorkers = 0;
  }

  // Map to legacy JobSector for backwards compatibility
  const legacyAssignedJobs: Record<JobSector, number> = {
    construction: assignedWorkerJobs.builder,
    food: assignedWorkerJobs.farming + assignedWorkerJobs.food_prep,
    defense: assignedWorkerJobs.guard,
    production: assignedWorkerJobs.factory,
    medical: assignedWorkerJobs.nurse,
    other: assignedWorkerJobs.scientist + assignedWorkerJobs.scavenger + assignedWorkerJobs.logistics,
  };

  const updatedGeneral: GeneralPopulation = {
    total: currentGeneral.total,
    children: currentGeneral.children || [],
    inSquads: totalInSquads,
    assignedJobs: legacyAssignedJobs,
    assignedWorkerJobs,
    workerPriorities,
    workerLimits,
    unassigned: Math.max(0, remainingWorkers),
  };

  return {
    ...state,
    adaptedBuildings: new Map(state.adaptedBuildings),
    freestandingBuildings: [...(state.freestandingBuildings || [])],
    generalPopulation: updatedGeneral,
  };
}

/**
 * Updates priority level for a specific worker job type
 */
export function updateWorkerJobPriority(
  state: SettlementState,
  jobId: WorkerJobTypeId,
  priority: WorkerPriorityLevel
): SettlementState {
  const currentGeneral = state.generalPopulation;
  const currentPriorities = currentGeneral?.workerPriorities || DEFAULT_WORKER_PRIORITIES;
  const updatedPriorities = { ...currentPriorities, [jobId]: priority };

  const intermediate: SettlementState = {
    ...state,
    generalPopulation: {
      ...currentGeneral,
      workerPriorities: updatedPriorities,
    },
  };
  return recalculateLaborDistribution(intermediate);
}

/**
 * Updates worker limit for a specific worker job type
 */
export function updateWorkerJobLimit(
  state: SettlementState,
  jobId: WorkerJobTypeId,
  limit: number
): SettlementState {
  const currentGeneral = state.generalPopulation;
  const currentLimits = currentGeneral?.workerLimits || DEFAULT_WORKER_LIMITS;
  const updatedLimits = { ...currentLimits, [jobId]: Math.max(0, limit) };

  const intermediate: SettlementState = {
    ...state,
    generalPopulation: {
      ...currentGeneral,
      workerLimits: updatedLimits,
    },
  };
  return recalculateLaborDistribution(intermediate);
}

/**
 * Sets worker job limit to 0 (pausing job)
 */
export function setWorkerJobToZero(
  state: SettlementState,
  jobId: WorkerJobTypeId
): SettlementState {
  return updateWorkerJobLimit(state, jobId, 0);
}

/**
 * Sets worker job limit to max capacity
 */
export function setWorkerJobToMax(
  state: SettlementState,
  jobId: WorkerJobTypeId
): SettlementState {
  return updateWorkerJobLimit(state, jobId, 9999);
}

/**
 * Updates sector labor priorities and triggers immediate labor re-balancing (§4.6)
 */
export function updateJobPriorities(
  state: SettlementState,
  newPriorities: Record<JobSector, number>
): SettlementState {
  const intermediate: SettlementState = {
    ...state,
    jobPriorities: newPriorities,
  };
  return recalculateLaborDistribution(intermediate);
}

/**
 * Appoints a named survivor as a Building Head (§4.6)
 * Vacates their previous role immediately.
 */
export function appointBuildingHead(
  state: SettlementState,
  survivorId: string,
  buildingId: string | number,
  customTitle?: string
): SettlementState {
  const survivor = state.namedSurvivors.find((s) => s.id === survivorId);
  if (!survivor) return state;

  // Find target building in adapted or freestanding
  const bldg =
    state.adaptedBuildings.get(buildingId) ||
    state.freestandingBuildings.find((b) => String(b.buildingId) === String(buildingId));

  if (!bldg) return state;

  // 1. Vacate survivor's old role (if in squad, remove from squad; if at another building, vacate that building)
  let updatedSquads = [...state.squads];
  if (survivor.role.type === 'squad_leader') {
    const squadId = survivor.role.squadId;
    updatedSquads = updatedSquads.filter((sq) => sq.id !== squadId);
  } else if (survivor.role.type === 'building_head') {
    const prevBldgId = survivor.role.buildingId;
    const prevBldg =
      state.adaptedBuildings.get(prevBldgId) ||
      state.freestandingBuildings.find((b) => String(b.buildingId) === String(prevBldgId));
    if (prevBldg) {
      prevBldg.assignedHeadId = undefined;
      prevBldg.assignedHeadTitle = undefined;
    }
  }

  // 2. If building already had a different head, vacate that survivor's role
  const updatedSurvivors = state.namedSurvivors.map((s) => {
    if (s.id === survivorId) {
      const title = customTitle || getDefaultHeadTitle(bldg.typeId);
      return {
        ...s,
        role: {
          type: 'building_head' as const,
          buildingId: bldg.buildingId,
          title,
          facilityName: bldg.name,
        },
      };
    }
    if (s.role.type === 'building_head' && String(s.role.buildingId) === String(buildingId)) {
      return {
        ...s,
        role: { type: 'unassigned' as const },
      };
    }
    return s;
  });

  // 3. Assign to building
  bldg.assignedHeadId = survivor.id;
  bldg.assignedHeadTitle = customTitle || getDefaultHeadTitle(bldg.typeId);

  const intermediateState: SettlementState = {
    ...state,
    namedSurvivors: updatedSurvivors,
    squads: updatedSquads,
  };

  return recalculateLaborDistribution(intermediateState);
}

/**
 * Vacates any role currently held by a named survivor (§4.6)
 */
export function vacateSurvivorRole(state: SettlementState, survivorId: string): SettlementState {
  const survivor = state.namedSurvivors.find((s) => s.id === survivorId);
  if (!survivor || survivor.role.type === 'unassigned') return state;

  let updatedSquads = [...state.squads];

  if (survivor.role.type === 'squad_leader') {
    const squadId = survivor.role.squadId;
    updatedSquads = updatedSquads.filter((sq) => sq.id !== squadId);
  } else if (survivor.role.type === 'building_head') {
    const bldgId = survivor.role.buildingId;
    const bldg =
      state.adaptedBuildings.get(bldgId) ||
      state.freestandingBuildings.find((b) => String(b.buildingId) === String(bldgId));
    if (bldg) {
      bldg.assignedHeadId = undefined;
      bldg.assignedHeadTitle = undefined;
    }
  }

  const updatedSurvivors = state.namedSurvivors.map((s) =>
    s.id === survivorId ? { ...s, role: { type: 'unassigned' as const } } : s
  );

  const intermediate: SettlementState = {
    ...state,
    namedSurvivors: updatedSurvivors,
    squads: updatedSquads,
  };

  return recalculateLaborDistribution(intermediate);
}

/**
 * Creates a new squad (§4.3)
 * Exactly 1 named squad leader + 0 to 3 general population members (max squad total 4).
 */
export function createSquad(
  state: SettlementState,
  squadName: string,
  leaderId: string,
  generalCount = 0,
  weaponLoadout: SquadWeaponLoadout = 'knife',
  armorLoadout: SquadArmorLoadout = 'none'
): { success: boolean; newState: SettlementState; error?: string } {
  // Check squad capacity limit
  if (state.squads.length >= state.squadCapacity) {
    return {
      success: false,
      newState: state,
      error: `Maximum squad capacity reached (${state.squadCapacity}). Adapt armories or gatehouses to support more squads.`,
    };
  }

  // An empty leaderId is an explicit request for a LEADERLESS squad: all 4
  // members are generic recruits. A non-empty leaderId that doesn't resolve
  // falls back to the old behaviour (any free named survivor, then any survivor).
  let leader = state.namedSurvivors.find((s) => s.id === leaderId) || null;
  if (!leader && leaderId) {
    leader =
      state.namedSurvivors.find((s) => s.role?.type !== 'squad_leader') ||
      state.namedSurvivors[0] ||
      null;
  }
  const hasNamedLeader = !!leader;

  // Validate general members availability. A named leader is one of the 4 people;
  // without one, all 4 members come from the general population (leaderless
  // squad must draw one extra citizen from the pool to fill the leader's slot).
  const currentGeneralInSquads = state.squads.reduce((acc, sq) => acc + (sq.generalCount || 0), 0);
  const freeGeneral = Math.max(0, state.generalPopulation.total - currentGeneralInSquads);
  const maxGeneral = hasNamedLeader ? 3 : 4;
  const clampedGeneral = Math.max(0, Math.min(maxGeneral, Math.min(generalCount, freeGeneral)));

  // If a named leader was previously a building Head or leading another squad, vacate that first
  let cleanedState = hasNamedLeader ? vacateSurvivorRole(state, leader!.id) : state;

  // People in the squad: the named leader + generals, or 100% generals when
  // leaderless. maxWeightKg mirrors the old 1 + generalCount convention (slot
  // per person), so leaderless squads carry exactly their member count.
  const squadPeople = (hasNamedLeader ? 1 : 0) + clampedGeneral;

  // §4.3 Gear deduction: for any non-default loadout, pull one item per squad
  // member from the colony armory. Knives (weapon) and no-armor are the free
  // defaults — no deduction for those.
  let updatedArmory = cleanedState.armory || { weapons: [], armor: [] };
  if (weaponLoadout !== 'knife') {
    const available = updatedArmory.weapons.filter((w) => w === weaponLoadout);
    if (available.length < squadPeople) {
      return {
        success: false,
        newState: state,
        error: `Not enough ${weaponLoadout.replace('_', ' ')}s in the armory (need ${squadPeople}, have ${available.length}).`,
      };
    }
    // Remove exactly squadPeople copies of the chosen weapon from the armory.
    let toRemove = squadPeople;
    const remainingWeapons = updatedArmory.weapons.filter((w) => {
      if (w === weaponLoadout && toRemove > 0) {
        toRemove--;
        return false;
      }
      return true;
    });
    updatedArmory = { ...updatedArmory, weapons: remainingWeapons };
  }
  // Armor deduction mirrors the weapon path; 'none' issues no gear.
  if (armorLoadout !== 'none') {
    const available = updatedArmory.armor.filter((a) => a === armorLoadout);
    if (available.length < squadPeople) {
      return {
        success: false,
        newState: state,
        error: `Not enough ${armorLoadout.replace('_', ' ')}s in the armory (need ${squadPeople}, have ${available.length}).`,
      };
    }
    let toRemove = squadPeople;
    const remainingArmor = updatedArmory.armor.filter((a) => {
      if (a === armorLoadout && toRemove > 0) {
        toRemove--;
        return false;
      }
      return true;
    });
    updatedArmory = { ...updatedArmory, armor: remainingArmor };
  }

  const squadId = `squad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newSquad: Squad = {
    id: squadId,
    name: squadName.trim() || `Recon Squad ${cleanedState.squads.length + 1}`,
    // Empty leaderId = leaderless squad led by a generic field leader.
    leaderId: hasNamedLeader ? leader!.id : '',
    weaponLoadout,
    armorLoadout,
    generalCount: clampedGeneral,
    status: 'idle',
    inventory: [],
    currentWeightKg: 0,
    maxWeightKg: Math.max(1, squadPeople),
    createdAt: Date.now(),
  };

  // Update leader's role (no-op for leaderless squads)
  const updatedSurvivors = hasNamedLeader
    ? cleanedState.namedSurvivors.map((s) =>
        s.id === leader!.id
          ? {
              ...s,
              role: {
                type: 'squad_leader' as const,
                squadId: newSquad.id,
                squadName: newSquad.name,
              },
            }
          : s
      )
    : cleanedState.namedSurvivors;

  const intermediate: SettlementState = {
    ...cleanedState,
    namedSurvivors: updatedSurvivors,
    squads: [...cleanedState.squads, newSquad],
    armory: updatedArmory,
    squadInventories: {
      ...(cleanedState.squadInventories || {}),
      [newSquad.id]: { capacity: squadPeople, used: 0, items: [] },
    },
  };

  return {
    success: true,
    newState: bumpLifetimeStat(recalculateLaborDistribution(intermediate), 'squadsFormed'),
  };
}

/**
 * Modifies general member count in an existing squad
 */
export function modifySquadGeneralMembers(
  state: SettlementState,
  squadId: string,
  newGeneralCount: number
): { success: boolean; newState: SettlementState; error?: string } {
  const squad = state.squads.find((s) => s.id === squadId);
  if (!squad) return { success: false, newState: state, error: 'Squad not found.' };

  const clamped = Math.max(0, Math.min(3, newGeneralCount));
  const diff = clamped - squad.generalCount;

  const currentGeneralInSquads = state.squads.reduce((acc, sq) => acc + sq.generalCount, 0);
  const freeGeneral = state.generalPopulation.total - currentGeneralInSquads;

  if (diff > 0 && diff > freeGeneral) {
    return {
      success: false,
      newState: state,
      error: `Not enough free general population (${freeGeneral} available).`,
    };
  }

  const updatedSquads = state.squads.map((sq) =>
    sq.id === squadId ? { ...sq, generalCount: clamped } : sq
  );

  const intermediate: SettlementState = {
    ...state,
    squads: updatedSquads,
  };

  return {
    success: true,
    newState: recalculateLaborDistribution(intermediate),
  };
}

/**
 * Disbands a squad, returning the leader to unassigned and members to general pool
 */
export function disbandSquad(
  state: SettlementState,
  squadId: string
): { success: boolean; newState: SettlementState } {
  const squad = state.squads.find((s) => s.id === squadId);
  if (!squad) return { success: false, newState: state };

  const updatedSurvivors = state.namedSurvivors.map((s) =>
    s.id === squad.leaderId ? { ...s, role: { type: 'unassigned' as const } } : s
  );

  const updatedSquads = state.squads.filter((sq) => sq.id !== squadId);

  const intermediate: SettlementState = {
    ...state,
    namedSurvivors: updatedSurvivors,
    squads: updatedSquads,
  };

  return {
    success: true,
    newState: recalculateLaborDistribution(intermediate),
  };
}

/**
 * Recruits a hidden survivor group into the colony (§4.4)
 */
export function recruitHiddenGroup(
  state: SettlementState,
  buildingId: string | number,
  persuasionLeaderId?: string
): { success: boolean; newState: SettlementState; error?: string; recruitedName?: string; count?: number } {
  const group = state.hiddenGroups.get(buildingId);
  if (!group) {
    return { success: false, newState: state, error: 'No survivor group located in this structure.' };
  }

  if (group.isRecruited) {
    return { success: false, newState: state, error: 'Group has already been recruited.' };
  }

  // Check Persuasion or Bribe if Distrustful
  if (group.disposition === 'distrustful') {
    const leader = persuasionLeaderId
      ? state.namedSurvivors.find((s) => s.id === persuasionLeaderId)
      : null;

    const hasPersuasion = leader && (leader.stats.persuasion === 'expert' || leader.stats.persuasion === 'skilled');
    const foodCost = group.foodCostToBribe || 20;
    const canPayFood = state.stockpile.food.canned_goods + state.stockpile.food.mre_rations >= foodCost;

    if (!hasPersuasion && !canPayFood) {
      return {
        success: false,
        newState: state,
        error: `The group distrusts outsiders. Send a survivor with high Persuasion or offer ${foodCost} food rations to gain their trust.`,
      };
    }

    // Deduct food if needed
    if (!hasPersuasion && canPayFood) {
      let remainingCost = foodCost;
      const canned = Math.min(state.stockpile.food.canned_goods, remainingCost);
      state.stockpile.food.canned_goods -= canned;
      remainingCost -= canned;
      if (remainingCost > 0) {
        state.stockpile.food.mre_rations = Math.max(0, state.stockpile.food.mre_rations - remainingCost);
      }
    }
  }

  // 1. Create new Named Survivor from leader
  const newNamedSurvivor: NamedSurvivor = {
    id: `survivor_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: group.leader.name,
    avatarSeed: group.leader.name.toLowerCase().replace(/\s+/g, '_'),
    background: group.leader.background,
    stats: group.leader.stats,
    role: { type: 'unassigned' },
    morale: 90,
    recruitedAt: Date.now(),
  };

  // 2. Add civilians to general population — keep the unassigned pool in sync
  // so recruited civilians aren't invisible to the worker accounting.
  const addedGeneral = group.generalCount;
  const updatedGeneralPop: GeneralPopulation = {
    ...state.generalPopulation,
    total: state.generalPopulation.total + addedGeneral,
    unassigned: (state.generalPopulation.unassigned || 0) + addedGeneral,
  };

  // 3. Mark group as recruited
  const updatedGroups = new Map(state.hiddenGroups);
  updatedGroups.set(buildingId, {
    ...group,
    isDiscovered: true,
    isRecruited: true,
  });

  const intermediate: SettlementState = {
    ...state,
    namedSurvivors: [...state.namedSurvivors, newNamedSurvivor],
    generalPopulation: updatedGeneralPop,
    hiddenGroups: updatedGroups,
  };

  return {
    success: true,
    newState: bumpLifetimeStat(recalculateLaborDistribution(intermediate), 'survivorsRecruited', addedGeneral + 1),
    recruitedName: group.leader.name,
    count: addedGeneral + 1,
  };
}

export interface CompletedDeconstruction {
  buildingId: string | number;
  name: string;
  wood: number;
  metal: number;
  bricks: number;
}

/**
 * Advances settlement simulation ticks (construction progress, deconstruction, squad missions)
 */
export function tickSettlementSimulation(
  state: SettlementState,
  deltaSeconds: number,
  grid?: PathGrid | null,
  isNight = false,
  elevationGrid?: ElevationGrid | null
): {
  newState: SettlementState;
  completedConstructions: string[];
  completedDeconstructions: CompletedDeconstruction[];
} {
  const completedConstructions: string[] = [];
  const completedDeconstructions: CompletedDeconstruction[] = [];

  let stateChanged = false;

  // 1. Advance Construction Work Orders & Sites (§4.6, §7.1)
  const allBuildings = [...state.adaptedBuildings.values(), ...(state.freestandingBuildings || [])];
  // Construction queue: only the active window of sites (earliest-placed
  // first) draws labour and materials this tick. Scarcity therefore completes
  // one structure before the next one starts draining the shared stockpile.
  const constructionQueue = getPrioritizedConstructionSites(state);
  const activeConstructionIds = new Set(constructionQueue.active.map((b) => String(b.buildingId)));
  // Process orders in construction-queue order so material grants go to the
  // highest-priority project first within each tick.
  const bldgPriority = new Map<
    string,
    number
  >();
  for (const b of allBuildings) bldgPriority.set(String(b.buildingId), constructionSitePriorityKey(b));
  const activeOrders = (state.constructionOrders ? [...state.constructionOrders] : []).sort(
    (a, b) => (bldgPriority.get(String(a.buildingId)) || 0) - (bldgPriority.get(String(b.buildingId)) || 0)
  );
  const updatedOrders: ConstructionWorkOrder[] = [];
  // Each operational, staffed Repairmen Shop contributes a finite automated
  // repair crew. Crews are assigned deterministically to the most damaged
  // structures first and do not consume ordinary building labour.
  const repairCrewCapacity = allBuildings
    .filter((b) => b.typeId === 'repairmen_shop' && isBuildingOperational(b))
    .reduce((sum, shop) => sum + Math.max(0, shop.assignedWorkers || 0), 0);
  if (repairCrewCapacity > 0) {
    // Maintenance priority (§Terminus Repairmen network): crews choose jobs by
    // structural importance FIRST — Emergency (HQ, gates, towers, generators,
    // hospitals) → High (warehouse, water) → Normal (production) → Low
    // (housing) — and the most damaged structure within each band next.
    const maintenanceBand = (b: { typeId: string }): number => {
      const t = b.typeId;
      if (['headquarters', 'wooden_gate', 'metal_gate', 'fortified_gate', 'wooden_tower', 'metal_tower', 'fortified_tower', 'floodlight_tower', 'generator_station', 'hospital'].includes(t)) return 0;
      if (['warehouse', 'water_cistern', 'medbay', 'research_center', 'antenna', 'weather_center'].includes(t)) return 1;
      if (['field', 'greenhouse', 'barn', 'cookhouse', 'cannery', 'tool_factory', 'sawmill', 'scrapyard', 'clay_pit', 'arms_factory', 'chemical_plant', 'vehicle_workshop', 'repairmen_shop'].includes(t)) return 2;
      return 3;
    };
    // §IFZ Repairmen Shop player control: crews only repair the bands the
    // player enables. A disabled band's buildings are skipped even when
    // damaged (absent config on legacy saves = everything enabled).
    const repairConfig = getAutomatedRepairConfig(state);
    const bandEnabled = (b: { typeId: string }): boolean => {
      const band = maintenanceBand(b);
      if (band === 0) return repairConfig.emergency;
      if (band === 1) return repairConfig.high;
      if (band === 2) return repairConfig.normal;
      return repairConfig.low;
    };
    const automaticTargets = allBuildings
      .filter((b) => b.typeId !== 'repairmen_shop' && b.currentDurability < b.maxDurability && !b.isUnderRepair && bandEnabled(b))
      .sort((a, b) => {
        const bandDiff = maintenanceBand(a) - maintenanceBand(b);
        if (bandDiff !== 0) return bandDiff;
        return (a.currentDurability / Math.max(1, a.maxDurability)) - (b.currentDurability / Math.max(1, b.maxDurability));
      })
      .slice(0, repairCrewCapacity);
    for (const building of automaticTargets) {
      const cost = {
        woodCost: Math.max(2, Math.round(15 * ((building.maxDurability - building.currentDurability) / building.maxDurability))),
        metalCost: Math.max(1, Math.round(10 * ((building.maxDurability - building.currentDurability) / building.maxDurability))),
        bricksCost: Math.max(1, Math.round(8 * ((building.maxDurability - building.currentDurability) / building.maxDurability))),
      };
      const stock = state.stockpile.materials;
      if (stock.wood < cost.woodCost || stock.metal < cost.metalCost || stock.bricks < cost.bricksCost) continue;
      stock.wood -= cost.woodCost;
      stock.metal -= cost.metalCost;
      stock.bricks -= cost.bricksCost;
      building.isUnderRepair = true;
      building.repairProgress = 0;
      building.repairWorkRequired = Math.max(20, building.maxDurability - building.currentDurability);
      building.repairWorkDone = 0;
    }
  }
  const hqCenter = getPrimaryHQ(state)?.center || { x: 0, z: 0 };
  const moraleProductivity = state.morale?.modifiers.productivityMultiplier || 1.0;

  // Set once a higher-priority project could not be fully supplied this tick:
  // the remaining stockpile is reserved for it, so later projects hold.
  let materialsReserved = false;

  // Process existing orders — in construction-queue order (earliest first), so
  // scarce materials complete one structure before the next begins draining.
  for (const order of activeOrders) {
    // At night crews have returned to shelter/HQ — construction holds until dawn.
    if (isNight) {
      updatedOrders.push(order);
      continue;
    }

    const bldg =
      state.adaptedBuildings.get(order.buildingId) ||
      state.freestandingBuildings.find((f) => f.buildingId === order.buildingId);

    // A construction crew only abandons the site when the structure is gone,
    // destroyed, or under repair. In-progress/planned sites must NOT be sent
    // home — otherwise construction can never advance (the order would bounce
    // between returning and traveling without ever reaching 'constructing').
    const siteWorkable = Boolean(
      bldg &&
      bldg.currentDurability > 0 &&
      !bldg.isUnderRepair &&
      (bldg.constructionStatus === 'in_progress' ||
        bldg.constructionStatus === 'planned' ||
        bldg.constructionStatus === 'completed')
    );
    if (!siteWorkable) {
      if (order.state !== 'returning') {
        order.state = 'returning';
      }
    }

    if (order.state === 'traveling') {
      // Construction crews path around obstacles (walls, towers, buildings)
      // instead of walking a straight line through new construction.
      const stepRes = stepAlongPath(
        grid, order.pathState, order.position.x, order.position.z,
        order.targetPosition.x, order.targetPosition.z,
        6.0 * (elevationGrid ? terrainSlopeSpeedFactor(elevationGrid, order.position.x, order.position.z) : 1),
        deltaSeconds, 2.5
      );
      order.position.x = stepRes.x;
      order.position.z = stepRes.z;
      order.pathState = stepRes.state;
      if (stepRes.arrived) {
        order.position = { ...order.targetPosition };
        order.state = 'constructing';
      }
      updatedOrders.push(order);
    } else if (order.state === 'constructing' || order.state === 'paused_materials') {
      if (bldg && (bldg.constructionStatus === 'in_progress' || bldg.constructionStatus === 'planned')) {
        bldg.constructionStatus = 'in_progress';        // Construction labour is controlled by the live labour distribution.
        // Never fall back to the order's creation-time worker count or force one
        // worker: zero assigned builders must pause the project.
        const assignedWorkers = Math.max(0, bldg.assignedWorkers || 0);
        if (assignedWorkers <= 0) {
          order.state = 'paused_materials';
          updatedOrders.push(order);
          continue;
        }
        let workDonePerSec = assignedWorkers * 3.0;
        if (bldg.assignedHeadId) {
          const head = state.namedSurvivors.find((s) => s.id === bldg.assignedHeadId);
          if (head) {
            const tier = head.stats.construction;
            const bonusMult = tier === 'expert' ? 1.75 : tier === 'skilled' ? 1.35 : 1.15;
            workDonePerSec *= bonusMult;
          }
        }
        workDonePerSec *= moraleProductivity;

        const totalReq = bldg.constructionWorkRequired || 100;
        const currentWork = bldg.constructionWorkDone || 0;
        const targetWork = Math.min(totalReq, currentWork + workDonePerSec * deltaSeconds);
        const targetProgress = Math.min(100, (targetWork / totalReq) * 100);

        // Calculate material cost required for this delta step
        const costTargets = {
          wood: (order.totalCost.wood * targetProgress) / 100,
          metal: (order.totalCost.metal * targetProgress) / 100,
          bricks: (order.totalCost.bricks * targetProgress) / 100,
          tools: ((order.totalCost.tools || 0) * targetProgress) / 100,
          scientific_materials:
            ((order.totalCost.scientific_materials || 0) * targetProgress) / 100,
        };
        const deducted = order.deductedCost;
        const deltas = {
          wood: Math.max(0, costTargets.wood - (deducted.wood || 0)),
          metal: Math.max(0, costTargets.metal - (deducted.metal || 0)),
          bricks: Math.max(0, costTargets.bricks - (deducted.bricks || 0)),
          tools: Math.max(0, costTargets.tools - (deducted.tools || 0)),
          scientific_materials: Math.max(
            0,
            costTargets.scientific_materials - (deducted.scientific_materials || 0)
          ),
        };
        // Only the active construction window draws labour/materials this
        // tick; queued structures hold. A higher-priority project that is
        // short on materials also reserves the remaining stockpile so scarce
        // resources never spread across several half-built structures.
        if (!activeConstructionIds.has(String(bldg.buildingId)) || materialsReserved) {
          order.state = 'paused_materials';
          updatedOrders.push(order);
          continue;
        }

        // Grant materials in priority order. The project receives as much of
        // its delta as the stockpile can currently cover; if that is short of
        // its full need, the remaining stock is reserved for it and work
        // advances only by the granted share.
        const grantKeys = ['wood', 'metal', 'bricks', 'tools', 'scientific_materials'] as const;
        const granted: Record<string, number> = {
          wood: 0,
          metal: 0,
          bricks: 0,
          tools: 0,
          scientific_materials: 0,
        };
        let materialShort = false;
        for (const key of grantKeys) {
          const need = deltas[key] || 0;
          if (need <= 0) continue;
          const have = state.stockpile.materials[key] || 0;
          granted[key] = Math.max(0, Math.min(need, have));
          if (granted[key] < need - 1e-9) materialShort = true;
        }
        // Under scarcity, the earliest unfinished structure owns the available
        // stockpile: if it cannot be finished from current stock, later
        // projects hold entirely so materials accumulate until it completes
        // (IFZ-style — a crew carries materials to one building at a time).
        const remainingCost = {
          wood: Math.max(0, (order.totalCost.wood || 0) - (order.deductedCost.wood || 0)),
          metal: Math.max(0, (order.totalCost.metal || 0) - (order.deductedCost.metal || 0)),
          bricks: Math.max(0, (order.totalCost.bricks || 0) - (order.deductedCost.bricks || 0)),
          tools: Math.max(0, (order.totalCost.tools || 0) - (order.deductedCost.tools || 0)),
          scientific_materials: Math.max(
            0,
            (order.totalCost.scientific_materials || 0) -
              (order.deductedCost.scientific_materials || 0)
          ),
        };
        let scarcityHeld = false;
        for (const key of grantKeys) {
          const stillNeeded = remainingCost[key];
          if (stillNeeded <= 0) continue;
          if ((state.stockpile.materials[key] || 0) < stillNeeded) {
            scarcityHeld = true;
            break;
          }
        }
        if (materialShort || scarcityHeld) materialsReserved = true;

        let ratio = 1;
        for (const key of grantKeys) {
          const need = deltas[key] || 0;
          if (need <= 0) continue;
          ratio = Math.min(ratio, granted[key] / need);
        }
        ratio = Math.max(0, ratio);
        if (ratio <= 0) {
          order.state = 'paused_materials';
          updatedOrders.push(order);
          continue;
        }

        // Deduct exactly what was granted; work advances by the granted share.
        for (const key of grantKeys) {
          const g = granted[key] || 0;
          if (g <= 0) continue;
          state.stockpile.materials[key] = Math.max(0, (state.stockpile.materials[key] || 0) - g);
          order.deductedCost[key] = (order.deductedCost[key] || 0) + g;
        }

        bldg.constructionWorkDone = Math.min(totalReq, currentWork + workDonePerSec * deltaSeconds * ratio);
        bldg.constructionProgress = Math.round(Math.min(100, (bldg.constructionWorkDone / totalReq) * 100));
        order.progress = bldg.constructionProgress;
        order.state = 'constructing';

        if (bldg.constructionProgress >= 100) {
          bldg.constructionStatus = 'completed';
          completedConstructions.push(bldg.name);
          order.state = 'returning';
          stateChanged = true;
          // The completion mutates records IN PLACE; hand the caller a fresh
          // Map/array so React sees a changed reference and the renderer's
          // updateAdaptedStates() refresh actually runs (it keys its effect on
          // `settlement.adaptedBuildings`/`freestandingBuildings` identity).
          // Without this, a finished building keeps its under-construction
          // amber marker, orange edges and blueprint tint forever — the sim
          // knows it is done, the screen does not.
          state.adaptedBuildings = new Map(state.adaptedBuildings);
          state.freestandingBuildings = [...(state.freestandingBuildings || [])];
        }
      }
      updatedOrders.push(order);
    } else if (order.state === 'returning') {
      // Crew walks back to HQ around any player-built obstacles.
      const stepRes = stepAlongPath(
        grid, order.pathState, order.position.x, order.position.z,
        hqCenter.x, hqCenter.z,
        6.0 * (elevationGrid ? terrainSlopeSpeedFactor(elevationGrid, order.position.x, order.position.z) : 1),
        deltaSeconds, 3.0
      );
      order.position.x = stepRes.x;
      order.position.z = stepRes.z;
      order.pathState = stepRes.state;
      if (stepRes.arrived) {
        // Returned to HQ, construction mission completed!
      } else {
        updatedOrders.push(order);
      }
    }
  }

  // Also safeguard any in-progress buildings that might not have an order yet
  const ensureOrder = (bldg: AdaptedBuilding) => {
    if (
      (bldg.constructionStatus === 'in_progress' || bldg.constructionStatus === 'planned') &&
      !updatedOrders.some((o) => o.buildingId === bldg.buildingId)
    ) {
      const def = FUNCTIONAL_BUILDING_DEFINITIONS[bldg.typeId];
      const cost = def ? def.freestandingCost : { wood: 20, metal: 10, bricks: 10 };
      const newOrder: ConstructionWorkOrder = {
        id: `const_${bldg.buildingId}_${Date.now()}`,
        buildingId: bldg.buildingId,
        buildingName: bldg.name,
        workerCount: Math.max(0, bldg.assignedWorkers || 0),
        state: 'traveling',
        position: { ...hqCenter },
        targetPosition: { ...bldg.position },
        totalCost: cost,
        deductedCost: { wood: 0, metal: 0, bricks: 0, tools: 0 },
        progress: bldg.constructionProgress || 0,
        createdAt: Date.now(),
      };
      updatedOrders.push(newOrder);
    }
  };

  state.adaptedBuildings.forEach(ensureOrder);
  state.freestandingBuildings.forEach(ensureOrder);

  state.constructionOrders = updatedOrders;

  // 1b. Advance Deconstruction Jobs (§7.2) — mirrors construction, but recovers
  // materials. Holds at night while workers are sheltered.
  const completedDeconIds: (string | number)[] = [];
  // Recovered materials that could not fit because the storage ceiling was full.
  let deconOverflowAccrued = 0;
  let deconFieldLootPiles = state.fieldLootPiles || [];

  if (!isNight) {
  for (const job of state.deconstructionJobs.values()) {
    const assignedWorkers = job.assignedWorkers || 0;
    if (job.state === 'returning') {
      const stepRes = stepAlongPath(
        grid, (job as any).pathState, job.position.x, job.position.z,
        hqCenter.x, hqCenter.z,
        6.0 * (elevationGrid ? terrainSlopeSpeedFactor(elevationGrid, job.position.x, job.position.z) : 1),
        deltaSeconds, 3.0
      );
      job.position = { x: stepRes.x, z: stepRes.z };
      (job as any).pathState = stepRes.state;
      if (stepRes.arrived) {
        // Finite stockpile: deposit only what fits. If the ceiling blocks part
        // of the load, the crew keeps it at HQ and the job stays 'returning',
        // retrying each tick as capacity frees — nothing is dumped past STO.
        const load = {
          wood: job.carriedMaterials?.wood || 0,
          metal: job.carriedMaterials?.metal || 0,
          bricks: job.carriedMaterials?.bricks || 0,
        };
        const { overflow } = depositWithinCapacity(
          state.stockpile,
          state.totalStorageCapacity ?? Infinity,
          { materials: load }
        );
        const ovf = (overflow as any)?.materials as Partial<{ wood: number; metal: number; bricks: number }> | undefined;
        const overflowUnits = (ovf?.wood || 0) + (ovf?.metal || 0) + (ovf?.bricks || 0);
        if (overflowUnits > 0) {
          if (!job.depositBlocked) {
            job.depositBlocked = true;
            deconOverflowAccrued += overflowUnits;
          }
          job.carriedMaterials = {
            wood: ovf?.wood || 0,
            metal: ovf?.metal || 0,
            bricks: ovf?.bricks || 0,
          };
        } else {
          job.depositBlocked = false;
          job.carriedMaterials = undefined;
          completedDeconIds.push(job.buildingId);
        }
      }
      continue;
    }
    const workDonePerSec = assignedWorkers * 2.5 * moraleProductivity;
    // Deconstruction is fully labour-controlled: an unstaffed job must not
    // advance or complete by itself.
    if (workDonePerSec <= 0) continue;

    job.workDone += workDonePerSec * deltaSeconds;
    job.progressPct = Math.min(100, Math.round((job.workDone / job.workRequired) * 100));

    if (job.progressPct >= 100) {
      // Deposit the recovered load capacity-aware right at the worksite: what
      // fits enters the stockpile now, anything past the ceiling is stranded
      // as a recoverable field-loot pile at the demolition site and the crew
      // is done (no HQ return needed for stranded material).
      const load = {
        wood: job.recoverWood,
        metal: job.recoverMetal,
        bricks: job.recoverBricks,
      };
      const { overflow } = depositWithinCapacity(state.stockpile, state.totalStorageCapacity ?? Infinity, { materials: load });
      const ovf = (overflow as any)?.materials as Partial<{ wood: number; metal: number; bricks: number }> | undefined;
      const overflowUnits = (ovf?.wood || 0) + (ovf?.metal || 0) + (ovf?.bricks || 0);
      if (overflowUnits > 0) {
        deconFieldLootPiles = strandMaterialsAt(
          deconFieldLootPiles,
          { x: job.position.x, z: job.position.z },
          { wood: ovf?.wood || 0, metal: ovf?.metal || 0, bricks: ovf?.bricks || 0 },
          'deconstruction'
        );
        deconOverflowAccrued += overflowUnits;
      }
      job.state = undefined;
      job.carriedMaterials = undefined;
      (job as any).pathState = undefined;
      completedDeconIds.push(job.buildingId);
    }
  }
  }
  // Recovered materials that a full storage ceiling blocks surface as
  // overflow even when no job completed this tick (blocked crews hold on).
  if (deconOverflowAccrued > 0) {
    state.overflowLootUnits = (state.overflowLootUnits || 0) + deconOverflowAccrued;
  }

  if (completedDeconIds.length > 0) {
    stateChanged = true;
    const newAdapted = new Map(state.adaptedBuildings);
    const newFreestanding = [...state.freestandingBuildings];
    const newJobs = new Map(state.deconstructionJobs);
    const newDemolished = new Map(state.demolishedBuildings || new Map());

    for (const id of completedDeconIds) {
      const job = state.deconstructionJobs.get(id);
      if (!job) continue;

      completedDeconstructions.push({
        buildingId: id,
        name: job.buildingName,
        wood: job.recoverWood,
        metal: job.recoverMetal,
        bricks: job.recoverBricks,
      });

      // Materials are deposited when the crew reaches HQ, not when dismantling
      // finishes. The returning phase removes this job after physical delivery.
      newJobs.delete(id);
      newDemolished.set(id, true);

      if (job.source === 'adapted') {
        newAdapted.delete(id);
      } else if (job.source === 'freestanding') {
        const idx = newFreestanding.findIndex((f) => f.buildingId === id);
        if (idx !== -1) newFreestanding.splice(idx, 1);
      }
      // 'osm' buildings are removed from the 3D scene via demolishedBuildings
    }

    state.adaptedBuildings = newAdapted;
    state.freestandingBuildings = newFreestanding;
    state.deconstructionJobs = newJobs;
    state.demolishedBuildings = newDemolished;
    if (deconFieldLootPiles.length > 0) state.fieldLootPiles = deconFieldLootPiles;

    // ONE authoritative settlement-stat calculation — the same
    // recalculateSettlementStats() every construction/adaptation path uses.
    // The inline copy kept here previously only recognised a handful of
    // building types (storage_depot / shelter_bunkhouse / squad_quarters), so
    // demolishing any building could silently drop Warehouses, Shelters,
    // Houses, extra HQs and non-operational defense from the totals.
    const stats = recalculateSettlementStats(
      state.headquarters,
      state.primaryHQId,
      newAdapted,
      newFreestanding
    );

    state.totalStorageCapacity = stats.storageCap;
    state.totalLivingCapacity = stats.livingCap;
    state.totalDefenseRating = stats.defenseRating;
    state.squadCapacity = stats.squadCapacity;
  }

  // 1c. Medbay production and treatment. Medical buildings require assigned
  // nurses and consume sterile bandages to manufacture first-aid kits.
  if (!isNight) {
    for (const building of allBuildings) {
      if (!isBuildingOperational(building) || !['medbay', 'infirmary_clinic', 'hospital'].includes(building.typeId)) continue;
      const staff = Math.max(0, building.assignedWorkers || 0);
      if (staff <= 0) continue;
      const producedKits = staff * (building.typeId === 'hospital' ? 0.5 : 0.35) * (deltaSeconds / 600);
      const bandagesNeeded = producedKits * 2;
      // Storage pre-check: don't burn bandages unless the finished kits fit —
      // consuming inputs for output that can't be stored is an economic sink.
      const free = Math.max(0, (state.totalStorageCapacity ?? Infinity) - getStockpileUnits(state.stockpile));
      if ((state.stockpile.medical.sterile_bandages || 0) >= bandagesNeeded && free >= producedKits) {
        state.stockpile.medical.sterile_bandages -= bandagesNeeded;
        state.stockpile.medical.first_aid_kits += producedKits;
        if (!state.lifetimeStats) state.lifetimeStats = createInitialLifetimeStats();
        if (!state.lifetimeStats.itemsProduced) state.lifetimeStats.itemsProduced = {};
        state.lifetimeStats.itemsProduced.first_aid_kits =
          (state.lifetimeStats.itemsProduced.first_aid_kits || 0) + producedKits;
        stateChanged = true;
      }
    }
  }

  // 1d. Advance manual building repairs. Repair work is governed by the same
  // live builder assignment used by construction; zero builders means no work.
  // Iterates BOTH adapted and freestanding structures — a damaged Watchtower
  // or Wall receives manual repair exactly like an adapted Warehouse.
  if (!isNight) {
    for (const building of allBuildings) {
      if (!building.isUnderRepair) continue;
      const required = building.repairWorkRequired || Math.max(20, building.maxDurability - building.currentDurability);
      const workers = building.isUnderRepair && repairCrewCapacity > 0 && (building.assignedWorkers || 0) <= 0
        ? 1
        : Math.max(0, building.assignedWorkers || 0);
      if (workers <= 0) continue;
      const work = workers * 3 * moraleProductivity * deltaSeconds;
      building.repairWorkDone = Math.min(required, (building.repairWorkDone || 0) + work);
      building.repairProgress = Math.round((building.repairWorkDone / required) * 100);
      if (building.repairWorkDone >= required) {
        building.currentDurability = building.maxDurability;
        building.isUnderRepair = false;
        building.repairProgress = 100;
        stateChanged = true;
      } else {
        stateChanged = true;
      }
    }
  }

  // 1c. Building Production (§7.2) — completed buildings convert their inputs to
  // outputs over the in-game day, scaled by staffing (size-based slots) and input
  // availability. Day length = 600 sim-seconds (10 minutes at 1x), the same
  // convention as food consumption/morale, so a Field's 8 Grain/day offsets
  // citizens. At night workers return to shelter/HQ, so production holds.
  const dayFraction = deltaSeconds / 600;
  if (!isNight && dayFraction > 0) {
    // Authoritative cumulative production counter: grows ONLY when a line
    // actually delivers output, so mission "manufacture N" objectives measure
    // real post-acceptance production instead of current possession (stock
    // gained by scavenging/trade/rewards — or merely held before the mission
    // — never counts, and consumption never erases progress).
    if (!state.lifetimeStats) state.lifetimeStats = createInitialLifetimeStats();
    if (!state.lifetimeStats.itemsProduced) state.lifetimeStats.itemsProduced = {};
    const tallyProduced = (key: string, amount: number) => {
      state.lifetimeStats!.itemsProduced![key] = (state.lifetimeStats!.itemsProduced![key] || 0) + amount;
    };
    const RESOURCE_PATHS: Record<string, [keyof SettlementStockpile, string]> = {
      grain: ['food', 'grain'],
      fresh_harvest: ['food', 'fresh_harvest'],
      raw_meat: ['food', 'raw_meat'],
      mre_rations: ['food', 'mre_rations'],
      canned_goods: ['food', 'canned_goods'],
      wood: ['materials', 'wood'],
      metal: ['materials', 'metal'],
      bricks: ['materials', 'bricks'],
      tools: ['materials', 'tools'],
      fertilizer: ['materials', 'fertilizer'],
      beer: ['materials', 'beer'],
      scientific_materials: ['materials', 'scientific_materials'],
      clay: ['materials', 'clay'],
      logs: ['materials', 'logs'],
      scrap: ['materials', 'scrap'],
      fuel: ['fuel', 'gasoline'],
      ammo: ['ammo', 'sharedPool'],
    };
    const getRes = (res: string): number => {
      const p = RESOURCE_PATHS[res];
      if (!p) return 0;
      return (state.stockpile[p[0]] as any)[p[1]] ?? 0;
    };
    // Total item units currently held — the same unit totalStorageCapacity uses.
    const addRes = (res: string, amount: number) => {
      const p = RESOURCE_PATHS[res];
      if (!p) return;
      if (amount > 0) {
        // Belt-and-braces clamp on top of the pre-consumption capacity check
        // below (production gains never push past the ceiling).
        const free = Math.max(0, state.totalStorageCapacity - getStockpileUnits(state.stockpile));
        amount = Math.min(amount, free);
        if (amount <= 0) return;
      }
      (state.stockpile[p[0]] as any)[p[1]] = Math.max(
        0,
        ((state.stockpile[p[0]] as any)[p[1]] ?? 0) + amount
      );
    };

    const productionBuildings = [
      ...Array.from(state.adaptedBuildings.values()),
      ...(state.freestandingBuildings || []),
    ].filter((b) => isBuildingOperational(b));
    // §Terminus power grid: powered facilities run their machines 25% harder.
    const poweredIds = getPoweredBuildingIds(state);

    for (const b of productionBuildings) {
      const def = FUNCTIONAL_BUILDING_DEFINITIONS[b.typeId];
      const recipes = def?.recipes?.length ? def.recipes : (def?.outputs?.length ? [{ id: 'default', name: 'Default', inputs: def.inputs || [], outputs: def.outputs }] : []);
      if (!def || recipes.length === 0) continue;
      const slots = getBuildingWorkerSlots(b);
      const staff = Math.min(b.assignedWorkers ?? 0, slots);
      if (staff <= 0) continue;
      const staffRatio = staff / Math.max(1, slots);

      // Recipe selection is the player's choice, persisted per building in
      // `selectedRecipeId`. A single-recipe facility always runs its one
      // recipe. With an explicit choice the crew runs ONLY that recipe — if
      // its inputs are short the building idles rather than silently swapping
      // to something else. WITHOUT a choice (multi-recipe building) the crew
      // IDLES and the panel shows "Choose Production" — production NEVER
      // auto-selects an arbitrary line, so an Arms Factory can't silently
      // switch to another line when its preferred inputs run dry. (Legacy
      // saves that predate recipe selection are stamped to their first recipe
      // on load, so nothing that was running before this rule stops.)
      // §IFZ gear lines: a production line is gated by its own research node
      // (e.g. each Arms Factory firearm sits behind the weapon's research), so
      // research genuinely unlocks what the factory can manufacture — a locked
      // line never runs, even if a legacy save somehow had it selected.
      const researchOk = (r: ProductionRecipe) =>
        !r.researchRequirement || isResearchUnlocked(state, r.researchRequirement);
      let recipe: ProductionRecipe | null;
      if (recipes.length === 1) {
        recipe = researchOk(recipes[0]) ? recipes[0] : null;
      } else if (b.selectedRecipeId) {
        const chosen = recipes.find((r) => r.id === b.selectedRecipeId);
        recipe =
          chosen &&
          researchOk(chosen) &&
          chosen.inputs.every((inp) => getRes(inp.resource) >= inp.amountPerDay * dayFraction)
            ? chosen
            : null;
      } else {
        // No player choice → no production. "Choose Production" in the panel.
        recipe = null;
      }
      if (!recipe) continue;
      let inputRatio = 1;
      for (const inp of recipe.inputs) {
        const need = inp.amountPerDay * dayFraction;
        if (need <= 0) continue;
        const avail = getRes(inp.resource);
        inputRatio = Math.min(inputRatio, avail / need);
      }
      const isAgriculture = b.typeId === 'field' || b.typeId === 'vast_field' || b.typeId === 'greenhouse' || b.typeId === 'greenhouse_hydro';
      const weatherMultiplier = isAgriculture && b.typeId !== 'greenhouse' && b.typeId !== 'greenhouse_hydro'
        ? calculateCropYieldFactors(
            state.weather?.currentSeason || 'summer',
            state.weather?.currentWeather || 'clear',
            state
          ).outdoorMultiplier
        : 1;
      // Fertilizer is CONSUMED, not a permanent aura: a plot only enjoys the
      // ×1.75 yield when the player toggled fertilization on AND the whole
      // day's allotment is in the stockpile. Short supply = an unfertilized
      // cycle (no consumption, no bonus). One Barn's daily 1 Fertilizer keeps
      // two standard plots fed. Consumption happens only after the cycle is
      // confirmed to run, so a blocked cycle never wastes fertilizer.
      const FERTILIZER_PER_DAY = 0.5;
      const wantsFertilizer = isAgriculture && (b as AdaptedBuilding).isFertilized === true;
      const fertNeed = FERTILIZER_PER_DAY * dayFraction;
      const canFertilize =
        wantsFertilizer &&
        fertNeed > 0 &&
        (state.stockpile.materials.fertilizer || 0) >= fertNeed;
      const fertilizerBonus = canFertilize ? 1.75 : 1;
      const ratio = Math.max(0, Math.min(staffRatio, inputRatio));
      if (ratio <= 0) continue;

      // Gear line (§IFZ Arms Factory / Protective Gear Factory): the crew
      // consumes the material flows continuously, and each full unit of work
      // lands ONE real weapon/armor item in the colony armory (armory gear has
      // no stockpile ceiling — items are assigned to squads/towers from there).
      // Progress is tracked per line id on the building, so switching recipes
      // preserves each line's partial work instead of discarding it.
      if (recipe.gear) {
        for (const inp of recipe.inputs) {
          addRes(inp.resource, -inp.amountPerDay * dayFraction * ratio);
        }
        const gearMultiplier =
          moraleProductivity * (poweredIds.has(String(b.buildingId)) ? 1.25 : 1);
        const progress = (b.craftProgress && b.craftProgress[recipe.id]) || 0;
        const nextProgress = progress + 1 * dayFraction * ratio * gearMultiplier;
        const completed = Math.floor(nextProgress + 1e-9);
        if (completed >= 1) {
          if (!state.armory) state.armory = { weapons: [], armor: [] };
          for (let i = 0; i < completed; i++) {
            if (recipe.gear.kind === 'weapon') {
              state.armory.weapons.push(recipe.gear.itemId as WeaponItemId);
            } else {
              state.armory.armor.push(recipe.gear.itemId as ArmorItemId);
            }
          }
          stateChanged = true;
        }
        if (recipe.gear && completed >= 1) {
          tallyProduced(recipe.gear.itemId, completed);
        }
        b.craftProgress = {
          ...(b.craftProgress || {}),
          [recipe.id]: Math.max(0, nextProgress - completed),
        };
        continue;
      }

      // Storage pre-check BEFORE consuming anything: if this cycle's full
      // scaled output cannot fit in the stockpile, skip it entirely. Running
      // the cycle would consume inputs for output that gets truncated to zero
      // (an economic sink) — better to keep the inputs and idle the building.
      const poweredBonus = poweredIds.has(String(b.buildingId)) ? 1.25 : 1;
      const outputMultiplier = (isAgriculture ? weatherMultiplier * fertilizerBonus : 1) * moraleProductivity * poweredBonus;
      let outputUnits = 0;
      for (const out of recipe.outputs) {
        const amount = out.amountPerDay * dayFraction * ratio * outputMultiplier;
        if (amount > 0) outputUnits += amount;
      }
      if (outputUnits > 0) {
        const free = Math.max(0, (state.totalStorageCapacity ?? Infinity) - getStockpileUnits(state.stockpile));
        if (outputUnits > free) continue;
      }

      for (const inp of recipe.inputs) {
        addRes(inp.resource, -inp.amountPerDay * dayFraction * ratio);
      }
      if (canFertilize) {
        addRes('fertilizer', -fertNeed);
      }
      for (const out of recipe.outputs) {
        // All production follows the same efficiency chain: recipe output,
        // staffing, colony morale, then any agriculture-specific modifiers.
        const produced = out.amountPerDay * dayFraction * ratio * outputMultiplier;
        addRes(out.resource, produced);
        tallyProduced(out.resource, produced);
      }
      // Alternate-unit line meters (recipe.tallies): accrue into the
      // production tally without touching the stockpile (see ProductionRecipe).
      if (recipe.tallies) {
        for (const meter of recipe.tallies) {
          tallyProduced(meter.resource, meter.amountPerDay * dayFraction * ratio * outputMultiplier);
        }
      }
      stateChanged = true;
    }
  }


  // Operational state is the single authority for settlement stats: recompute
  // them EVERY tick so a building destroyed/breached in combat (its durability
  // lands in the shared objects a pipeline pass earlier), stalled in repair, or
  // just completed construction stops or starts contributing defense, storage,
  // living and squad capacity immediately — not just on the next player build
  // or demolition action. recalculateSettlementStats is cheap (one pass over
  // the building list), so this is not a hot path.
  const freshStats = recalculateSettlementStats(
    state.headquarters,
    state.primaryHQId,
    state.adaptedBuildings,
    state.freestandingBuildings
  );
  if (
    freshStats.storageCap !== state.totalStorageCapacity ||
    freshStats.livingCap !== state.totalLivingCapacity ||
    freshStats.defenseRating !== state.totalDefenseRating ||
    freshStats.squadCapacity !== state.squadCapacity
  ) {
    state.totalStorageCapacity = freshStats.storageCap;
    state.totalLivingCapacity = freshStats.livingCap;
    state.totalDefenseRating = freshStats.defenseRating;
    state.squadCapacity = freshStats.squadCapacity;
    stateChanged = true;
  }

  if (stateChanged) {
    const intermediate: SettlementState = {
      ...state,
    };
    return {
      newState: recalculateLaborDistribution(intermediate),
      completedConstructions,
        completedDeconstructions,
    };
  }

  return {
    newState: state,
    completedConstructions,
    completedDeconstructions,
  };
}
