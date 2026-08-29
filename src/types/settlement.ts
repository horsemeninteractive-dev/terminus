import { Point2D } from './map';
import { BuildingLootRecord } from './loot';
import {
  BuildingOutbreakState,
  FallenHeroRecord,
  SurvivorInfection,
} from './infection';
import {
  GeneralPopulation,
  HiddenSurvivorGroup,
  JobSector,
  NamedSurvivor,
  Squad,
} from './population';
import { WorldVehicle } from './vehicle';
import { ArmorItemId, WeaponItemId, ZombieLair } from './combat';
import { RivalHideout } from './rivalFaction';
import { ResearchTreeState } from './research';
import { SettlementMoraleState } from './morale';
import { WeatherState } from './weather';
import { BuildingSearchState } from './scavenging';
import { SquadInventory } from './population';
import { ResourceWorkOrder } from './resourceGathering';
import { ColonyBannerConfig, GameScenarioSettings } from './saveGame';

// ==========================================
// 1. Itemized Resource Stockpile (§7.2)
// ==========================================

export interface FoodStockpile {
  canned_goods: number;
  mre_rations: number;
  dried_rations: number;
  fresh_harvest: number;
  grain?: number;
  raw_meat?: number;
}

export interface WaterStockpile {
  bottled_water: number;
  purified_water: number;
  rainwater: number;
}

export interface MedicalStockpile {
  first_aid_kits: number;
  sterile_bandages: number;
  antibiotics: number;
  painkillers: number;
}

export interface FuelStockpile {
  gasoline: number;
  diesel: number;
  biofuel: number;
}

export interface AmmunitionStockpile {
  sharedPool: number; // Shared ammunition pool per §7.2 prompt description
  crates?: number;
}

export interface MaterialsStockpile {
  wood: number;
  metal: number;
  bricks: number;
  tools?: number;
  fertilizer?: number;
  beer?: number;
  scientific_materials?: number;
  clay?: number;
}

export interface SettlementStockpile {
  food: FoodStockpile;
  water: WaterStockpile;
  medical: MedicalStockpile;
  fuel: FuelStockpile;
  ammo: AmmunitionStockpile;
  materials: MaterialsStockpile;
}

// Resource category keys
export type ResourceCategoryKey = 'food' | 'water' | 'medical' | 'fuel' | 'ammo' | 'materials';

// ==========================================
// 2. Building Classification & Functional Types (§7.1, §7.2)
// ==========================================

export type FunctionalCategory =
  | 'basic'
  | 'food'
  | 'production'
  | 'defense_walls'
  | 'defense_towers'
  | 'defense'
  | 'utility'
  | 'civilian'
  | 'decorative'
  | 'other';

export type FunctionalBuildingTypeId =
  // 1. Basic Buildings
  | 'headquarters'
  | 'squad_quarters'
  | 'warehouse'
  | 'shelter'
  | 'house'
  // 2. Food Production
  | 'field'
  | 'vast_field'
  | 'greenhouse'
  | 'barn'
  | 'cookhouse'
  | 'cannery'
  // 3. Production
  | 'foresters_hut'
  | 'sawmill'
  | 'tool_factory'
  | 'scrapyard'
  | 'arms_factory'
  | 'chemical_plant'
  | 'protective_gear_factory'
  | 'vehicle_workshop'
  | 'clay_pit'
  // 4. Defensive Walls
  | 'barbed_wire'
  | 'wooden_palisade'
  | 'wooden_gate'
  | 'metal_fence'
  | 'metal_gate'
  | 'brick_wall'
  | 'fortified_wall'
  | 'fortified_gate'
  // 5. Defensive Towers
  | 'wooden_tower'
  | 'metal_tower'
  | 'fortified_tower'
  | 'floodlight_tower'
  // 6. Communication / Utility
  | 'antenna'
  | 'research_center'
  | 'weather_center'
  | 'medbay'
  | 'hospital'
  | 'repairmen_shop'
  | 'shooting_range'
  | 'expedition_center'
  // 7. Civilian / Quality-of-Life
  | 'kindergarten'
  | 'bar'
  | 'gathering_place'
  // 8. Decorative / Misc
  | 'mast'
  // Legacy / Aliased IDs for backwards compatibility
  | 'shelter_bunkhouse'
  | 'storage_depot'
  | 'water_cistern'
  | 'greenhouse_hydro'
  | 'food_pantry'
  | 'workshop_forge'
  | 'timber_mill'
  | 'scrap_smelter'
  | 'guard_watchtower'
  | 'barricade_gatehouse'
  | 'armory_cache'
  | 'infirmary_clinic'
  | 'community_hall'
  | 'generator_station'
  | 'comms_relay'
  | 'research_lab';

export interface ResourceCost {
  wood: number;
  metal: number;
  bricks: number;
  tools?: number;
}

export interface BuildingDefenceProperties {
  baseDefense: number;
  coverBonus?: number;
  sentryCapacity?: number;
  attackRangeM?: number;
  slowsInfectedPct?: number;
  damageOnContact?: number;
  allowsFriendlyPassage?: boolean;
  hasSpotlight?: boolean;
}

export interface BuildingMedicalProperties {
  treatsWounded: boolean;
  treatsInfection: boolean;
  treatsSevereTrauma: boolean;
  producesFirstAid: boolean;
  bedCapacity: number;
  cureOddsBonusPct: number;
}

export interface BuildingCivilianProperties {
  childcareCapacity?: number;
  entertainmentMoraleBonus?: number;
  beerOutputPerCycle?: number;
  socialCapacity?: number;
}

export interface BuildingResourceFlow {
  resource: string;
  amountPerDay: number;
}

export interface FunctionalBuildingDefinition {
  id: FunctionalBuildingTypeId;
  name: string;
  category: FunctionalCategory;
  type?: FunctionalBuildingTypeId;
  description: string;
  researchRequirement?: string; // Research node ID
  adaptationAllowed: boolean;
  constructionAllowed: boolean;
  workerCapacity: number;
  resourceCosts: {
    adaptation: ResourceCost;
    freestanding: ResourceCost;
  };
  durability: {
    adaptationBase: number;
    freestandingBase: number;
  };
  functions: string[];
  inputs?: BuildingResourceFlow[];
  outputs?: BuildingResourceFlow[];
  storageCapacity?: number;
  housingCapacity?: number;
  squadCapacity?: number;
  defenceProperties?: BuildingDefenceProperties;
  medicalProperties?: BuildingMedicalProperties;
  civilianProperties?: BuildingCivilianProperties;
  // UI & Presentation
  iconName: string;
  badgeColor: string;
  capacityLabel: string;
  baseDefense: number;
  freestandingDefense: number;
  adaptationCost: ResourceCost;
  freestandingCost: ResourceCost;
  preferredOsmTypes?: string[];
}

// ==========================================
// 3. Adapted Building Instance in World
// ==========================================

export interface AdaptedBuilding {
  buildingId: string | number;
  typeId: FunctionalBuildingTypeId;
  isHQ: boolean;
  name: string;
  category: FunctionalCategory;
  adaptedAt: number;
  // Capacity calculated from real footprint (§7.1)
  footprintAreaM2: number;
  totalFloorAreaM2: number;
  volumeM3: number;
  maxCapacity: number;
  currentUsage: number;
  capacityUnit: string;
  // Structural Stats
  maxDurability: number;
  currentDurability: number;
  defenseRating: number;
  isFreestanding: boolean;
  position: Point2D;
  height: number;
  levels: number;
  polygon?: Point2D[];
  // Construction Progress & Labour (§4.6, §7.1)
  constructionStatus: 'planned' | 'in_progress' | 'completed';
  constructionProgress: number; // 0 to 100
  constructionWorkRequired: number; // in work units
  constructionWorkDone: number;
  assignedWorkers: number; // Auto-assigned general workers
  assignedHeadId?: string; // Appointed Named Survivor Building Head (§4.6)
  assignedHeadTitle?: string; // e.g. "Head Chef", "Head Doctor", "Head Foreman"
}

// ==========================================
// 4. Freestanding Building Instance
// ==========================================

export interface FreestandingPlacement {
  id: string;
  typeId: FunctionalBuildingTypeId;
  position: Point2D;
  rotationDeg: number;
  dimensions: { width: number; length: number; height: number };
}

// ==========================================
// 5. Settlement State
// ==========================================

export interface SettlementHQ {
  buildingId: string | number;
  buildingName: string;
  establishedAt: number;
  footprintAreaM2: number;
  levels: number;
  center: Point2D;
  defenseRating: number;
  maxCapacity: number;
}

export type LaborAllocation = Record<JobSector, number>;

// ==========================================
// 6. Building Construction & Deconstruction Jobs (§4.6, §7.1, §7.2)
// ==========================================

export interface ConstructionWorkOrder {
  id: string;
  buildingId: string | number;
  buildingName: string;
  workerCount: number;
  state: 'traveling' | 'constructing' | 'returning' | 'paused_materials';
  position: Point2D;
  targetPosition: Point2D;
  totalCost: ResourceCost;
  deductedCost: ResourceCost;
  progress: number; // 0 to 100
  createdAt: number;
}

export type DeconstructionSource = 'adapted' | 'freestanding' | 'osm';

export interface DeconstructionJob {
  buildingId: string | number;
  buildingName: string;
  source: DeconstructionSource;
  position: Point2D;
  // Materials recovered when the job completes
  recoverWood: number;
  recoverMetal: number;
  recoverBricks: number;
  // Progress tracked in work units (§4.6, §7.2)
  workRequired: number;
  workDone: number;
  assignedWorkers: number;
  maxWorkers: number;
  startedAt: number;
  progressPct: number; // 0 to 100
}

// ==========================================
// 7. Fog of War (§3.5)
// ==========================================

export interface FogOfWarState {
  cellSize: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  // Flattened row-major grid of 0/1 flags: 1 = explored ("last known"), 0 = unexplored
  explored: number[];
}

export interface SettlementState {
  name?: string;
  isInitialized: boolean;
  hq: SettlementHQ | null;
  stockpile: SettlementStockpile;
  adaptedBuildings: Map<string | number, AdaptedBuilding>;
  freestandingBuildings: AdaptedBuilding[];
  totalStorageCapacity: number;
  totalLivingCapacity: number;
  totalDefenseRating: number;
  // Population Model (§4.1, §4.3, §4.4, §4.6)
  namedSurvivors: NamedSurvivor[];
  generalPopulation: GeneralPopulation;
  squads: Squad[];
  squadCapacity: number;
  buildingSearches: Map<string | number, BuildingSearchState>;
  squadInventories: Record<string, SquadInventory>;
  resourceWorkOrders: ResourceWorkOrder[];
  constructionOrders?: ConstructionWorkOrder[];
  hiddenGroups: Map<string | number, HiddenSurvivorGroup>;
  jobPriorities: Record<JobSector, number>;
  // Infection & Outbreak System (§6.2, §6.3)
  infections: Map<string, SurvivorInfection>;
  outbreaks: Map<string | number, BuildingOutbreakState>;
  fallenHeroes: FallenHeroRecord[];
  // Vehicle System (§8)
  vehicles: WorldVehicle[];
  // Individual weapon & armor stockpile (§4.3, §7.2) — scavenged gear awaiting assignment
  armory?: { weapons: WeaponItemId[]; armor: ArmorItemId[] };
  // Research & Technology System (§10)
  research: ResearchTreeState;
  // Building Deconstruction Jobs (§7.2)
  deconstructionJobs: Map<string | number, DeconstructionJob>;
  demolishedBuildings: Map<string | number, true>;
  // Rival Human Factions & Zombie Lairs (§5.2)
  rivalHideouts: Map<string | number, RivalHideout>;
  zombieLairs: Map<string | number, ZombieLair>;
  // Fog of War (§3.5)
  fogOfWar?: FogOfWarState;
  // Morale & Population Growth System (§4.5)
  morale?: SettlementMoraleState;
  // Weather & Seasons System (§9)
  weather?: WeatherState;
  // Physical Scavenging & Building Loot Records
  searchedBuildings?: Map<string | number, BuildingLootRecord>;
  // Colony Banner & Scenario Configuration
  banner?: ColonyBannerConfig;
  scenarioSettings?: GameScenarioSettings;
}
