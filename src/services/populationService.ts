import { BuildingPolygon } from '../types/map';
import { PathGrid, stepAlongPath } from './pathfindingService';
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
} from '../types/population';
import {
  AdaptedBuilding,
  ConstructionWorkOrder,
  FunctionalBuildingTypeId,
  FunctionalCategory,
  SettlementState,
  SettlementStockpile,
} from '../types/settlement';
import {
  FUNCTIONAL_BUILDING_DEFINITIONS,
  getBuildingWorkerSlots,
} from '../data/functionalBuildings';

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

  const squadMembers = (state.squads || []).reduce(
    (sum, sq) => sum + 1 + (sq.generalCount || 0),
    0
  );

  const totalWorkers = Math.max(0, totalCitizens - children - squadMembers - ill);
  const assignedMap = state.generalPopulation?.assignedWorkerJobs || ({} as Record<WorkerJobTypeId, number>);
  const totalAssigned = Object.values(assignedMap).reduce((sum, val) => sum + (val || 0), 0);
  const unemployed = Math.max(0, totalWorkers - totalAssigned);

  return {
    totalCitizens,
    children,
    homeless,
    ill,
    unemployed,
    totalWorkers,
    squadMembers,
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
  floodlight_tower: 'guard',
  guard_watchtower: 'guard',
  shooting_range: 'guard',
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
  expedition_center: 'scientist',
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
  if (b.category === 'defense' || b.category === 'defense_towers' || b.category === 'defense_walls') return 'guard';
  if (b.category === 'production') return 'factory';
  if (b.category === 'utility') return 'scientist';
  if (b.category === 'civilian') return 'nurse';
  return null;
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
  };

  if (!state.isInitialized || !state.hq) {
    return demand;
  }

  const adaptedArray = [
    ...Array.from(state.adaptedBuildings.values()),
    ...(state.freestandingBuildings || []),
  ];

  // 1. Builder Demand
  const inProgressBuildings = adaptedArray.filter(
    (b) => b.constructionStatus === 'in_progress' || b.constructionStatus === 'planned'
  );
  const deconstructionJobs = Array.from(state.deconstructionJobs?.values() || []);
  const damagedBuildings = adaptedArray.filter(
    (b) => b.currentDurability < (b.maxDurability || 100)
  );
  demand.builder = inProgressBuildings.length * 6 + deconstructionJobs.length * 4 + damagedBuildings.length * 2;
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
  if (state.hq) {
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
  };

  // If HQ is not established yet, all workers remain unassigned
  if (!state.isInitialized || !state.hq) {
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

  // Group jobs by priority level (4 = Urgent ^^, 3 = High ^, 2 = Normal =, 1 = Low v)
  // Priority 0 = Disabled
  let remainingWorkers = totalAvailableWorkers;

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

  // Update physical site assignments for construction
  const adaptedArray = [
    ...Array.from(state.adaptedBuildings.values()),
    ...(state.freestandingBuildings || []),
  ];
  const inProgressBuildings = adaptedArray.filter(
    (b) => b.constructionStatus === 'in_progress' || b.constructionStatus === 'planned'
  );
  const deconstructionJobs = Array.from(state.deconstructionJobs?.values() || []);
  const totalConstructionWorkers = assignedWorkerJobs.builder;

  const workSites: { assign: (workers: number) => void; cap: number }[] = [
    ...inProgressBuildings.map((b) => ({
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
  const completedSites = adaptedArray.filter((b) => b.constructionStatus === 'completed');
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
    other: assignedWorkerJobs.scientist + assignedWorkerJobs.scavenger,
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
  generalCount = 0
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

  const squadId = `squad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newSquad: Squad = {
    id: squadId,
    name: squadName.trim() || `Recon Squad ${cleanedState.squads.length + 1}`,
    // Empty leaderId = leaderless squad led by a generic field leader.
    leaderId: hasNamedLeader ? leader!.id : '',
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
    squadInventories: {
      ...(cleanedState.squadInventories || {}),
      [newSquad.id]: { capacity: squadPeople, used: 0, items: [] },
    },
  };

  return {
    success: true,
    newState: recalculateLaborDistribution(intermediate),
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
    newState: recalculateLaborDistribution(intermediate),
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
  isNight = false
): {
  newState: SettlementState;
  completedConstructions: string[];
  completedDeconstructions: CompletedDeconstruction[];
} {
  const completedConstructions: string[] = [];
  const completedDeconstructions: CompletedDeconstruction[] = [];

  let stateChanged = false;

  // 1. Advance Construction Work Orders & Sites (§4.6, §7.1)
  const activeOrders = state.constructionOrders ? [...state.constructionOrders] : [];
  const updatedOrders: ConstructionWorkOrder[] = [];
  const hqCenter = state.hq?.center || { x: 0, z: 0 };
  const moraleProductivity = state.morale?.modifiers.productivityMultiplier || 1.0;

  // Process existing orders
  for (const order of activeOrders) {
    // At night crews have returned to shelter/HQ — construction holds until dawn.
    if (isNight) {
      updatedOrders.push(order);
      continue;
    }

    const bldg =
      state.adaptedBuildings.get(order.buildingId) ||
      state.freestandingBuildings.find((f) => f.buildingId === order.buildingId);

    if (!bldg || bldg.constructionStatus === 'completed') {
      if (order.state !== 'returning') {
        order.state = 'returning';
      }
    }

    if (order.state === 'traveling') {
      // Construction crews path around obstacles (walls, towers, buildings)
      // instead of walking a straight line through new construction.
      const stepRes = stepAlongPath(
        grid, order.pathState, order.position.x, order.position.z,
        order.targetPosition.x, order.targetPosition.z, 6.0, deltaSeconds, 2.5
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
        bldg.constructionStatus = 'in_progress';
        const assignedWorkers = Math.max(1, order.workerCount || bldg.assignedWorkers || 1);

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
        const woodTarget = (order.totalCost.wood * targetProgress) / 100;
        const metalTarget = (order.totalCost.metal * targetProgress) / 100;
        const bricksTarget = (order.totalCost.bricks * targetProgress) / 100;

        const woodDelta = Math.max(0, woodTarget - order.deductedCost.wood);
        const metalDelta = Math.max(0, metalTarget - order.deductedCost.metal);
        const bricksDelta = Math.max(0, bricksTarget - order.deductedCost.bricks);

        const hasWood = state.stockpile.materials.wood >= woodDelta;
        const hasMetal = state.stockpile.materials.metal >= metalDelta;
        const hasBricks = state.stockpile.materials.bricks >= bricksDelta;

        if (hasWood && hasMetal && hasBricks) {
          // Deduct progressive resources from stockpile
          state.stockpile.materials.wood = Math.max(0, state.stockpile.materials.wood - woodDelta);
          state.stockpile.materials.metal = Math.max(0, state.stockpile.materials.metal - metalDelta);
          state.stockpile.materials.bricks = Math.max(0, state.stockpile.materials.bricks - bricksDelta);

          order.deductedCost.wood += woodDelta;
          order.deductedCost.metal += metalDelta;
          order.deductedCost.bricks += bricksDelta;

          bldg.constructionWorkDone = targetWork;
          bldg.constructionProgress = Math.round(targetProgress);
          order.progress = Math.round(targetProgress);
          order.state = 'constructing';

          if (bldg.constructionProgress >= 100) {
            bldg.constructionStatus = 'completed';
            completedConstructions.push(bldg.name);
            order.state = 'returning';
            stateChanged = true;
          }
        } else {
          // Insufficient resources in stockpile — pause until materials arrive
          order.state = 'paused_materials';
        }
      }
      updatedOrders.push(order);
    } else if (order.state === 'returning') {
      // Crew walks back to HQ around any player-built obstacles.
      const stepRes = stepAlongPath(
        grid, order.pathState, order.position.x, order.position.z,
        hqCenter.x, hqCenter.z, 6.0, deltaSeconds, 3.0
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
        workerCount: Math.max(1, bldg.assignedWorkers || 1),
        state: 'traveling',
        position: { ...hqCenter },
        targetPosition: { ...bldg.position },
        totalCost: cost,
        deductedCost: { wood: 0, metal: 0, bricks: 0 },
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

  if (!isNight) {
  for (const job of state.deconstructionJobs.values()) {
    const assignedWorkers = job.assignedWorkers || 0;
    let workDonePerSec = assignedWorkers * 2.5;
    workDonePerSec *= moraleProductivity;
    if (workDonePerSec === 0) workDonePerSec = 0.5 * moraleProductivity;

    job.workDone += workDonePerSec * deltaSeconds;
    job.progressPct = Math.min(100, Math.round((job.workDone / job.workRequired) * 100));

    if (job.progressPct >= 100) {
      completedDeconIds.push(job.buildingId);
    }
  }
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

      // Grant recovered materials to the stockpile (§7.2)
      state.stockpile.materials.wood += job.recoverWood;
      state.stockpile.materials.metal += job.recoverMetal;
      state.stockpile.materials.bricks += job.recoverBricks;

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

    const stats = (() => {
      let storageCap = 250;
      let livingCap = 0;
      let defenseRating = 0;
      let squadCapacity = 2;
      if (state.hq) {
        storageCap += Math.round(state.hq.footprintAreaM2 * 0.5);
        livingCap += Math.max(2, state.hq.maxCapacity || Math.floor(state.hq.footprintAreaM2 / 20));
        defenseRating += state.hq.defenseRating;
      }
      const all = [...Array.from(newAdapted.values()), ...newFreestanding];
      for (const b of all) {
        defenseRating += b.defenseRating;
        if (b.typeId === 'storage_depot') storageCap += b.maxCapacity;
        else if (b.typeId === 'shelter_bunkhouse') livingCap += b.maxCapacity;
        if (b.typeId === 'squad_quarters') {
          squadCapacity += FUNCTIONAL_BUILDING_DEFINITIONS[b.typeId]?.squadCapacity || 1;
        }
      }
      return { storageCap, livingCap, defenseRating, squadCapacity };
    })();

    state.totalStorageCapacity = stats.storageCap;
    state.totalLivingCapacity = stats.livingCap;
    state.totalDefenseRating = stats.defenseRating;
    state.squadCapacity = stats.squadCapacity;
  }

  // 1c. Building Production (§7.2) — completed buildings convert their inputs to
  // outputs over the in-game day, scaled by staffing (size-based slots) and input
  // availability. Day length = 600 sim-seconds (10 minutes at 1x), the same
  // convention as food consumption/morale, so a Field's 8 Grain/day offsets
  // citizens. At night workers return to shelter/HQ, so production holds.
  const dayFraction = deltaSeconds / 600;
  if (!isNight && dayFraction > 0) {
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
      fuel: ['fuel', 'gasoline'],
      ammo: ['ammo', 'sharedPool'],
    };
    const getRes = (res: string): number => {
      const p = RESOURCE_PATHS[res];
      if (!p) return 0;
      return (state.stockpile[p[0]] as any)[p[1]] ?? 0;
    };
    // Total item units currently held — the same unit totalStorageCapacity uses.
    // Defined locally to avoid a circular import with settlementService.
    const stockpileUnits = (): number => {
      let units = 0;
      for (const category of Object.values(state.stockpile)) {
        for (const value of Object.values(category as Record<string, number>)) {
          if (typeof value === 'number') units += value;
        }
      }
      return units;
    };
    const addRes = (res: string, amount: number) => {
      const p = RESOURCE_PATHS[res];
      if (!p) return;
      if (amount > 0) {
        // Finite physical storage: production gains stop at the capacity
        // ceiling. Inputs/consumption (negative amounts) always apply.
        const free = Math.max(0, state.totalStorageCapacity - stockpileUnits());
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
    ].filter((b) => b.constructionStatus === 'completed');

    for (const b of productionBuildings) {
      const def = FUNCTIONAL_BUILDING_DEFINITIONS[b.typeId];
      if (!def || !def.outputs || def.outputs.length === 0) continue;
      const slots = getBuildingWorkerSlots(b);
      const staff = Math.min(b.assignedWorkers ?? 0, slots);
      if (staff <= 0) continue;
      const staffRatio = staff / Math.max(1, slots);

      // Input availability limits output (e.g. a Barn needs Grain feed).
      let inputRatio = 1;
      for (const inp of def.inputs || []) {
        const need = inp.amountPerDay * dayFraction;
        if (need <= 0) continue;
        const avail = getRes(inp.resource);
        inputRatio = Math.min(inputRatio, avail / need);
      }
      const ratio = Math.max(0, Math.min(staffRatio, inputRatio));
      if (ratio <= 0) continue;

      for (const inp of def.inputs || []) {
        addRes(inp.resource, -inp.amountPerDay * dayFraction * ratio);
      }
      for (const out of def.outputs) {
        addRes(out.resource, out.amountPerDay * dayFraction * ratio);
      }
      stateChanged = true;
    }
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
