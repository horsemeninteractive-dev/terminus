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
import { VehicleWorkshopOrder, WorldVehicle } from './vehicle';
import { LawsState } from './laws';
import { ExpeditionState } from './expedition';
import { OccupationState } from './occupation';
import { ArmorItemId, WeaponItemId, ZombieLair } from './combat';
import { RivalHideout } from './rivalFaction';
import { ResearchTreeState } from './research';
import { SettlementMoraleState } from './morale';
import { WeatherState } from './weather';
import { BuildingSearchState } from './scavenging';
import { SquadInventory, SquadLootItem } from './population';
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
  tools: number;
  fertilizer?: number;
  beer?: number;
  scientific_materials?: number;
  clay?: number;
  logs?: number;
  scrap?: number;
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
  | 'generator_station'
  | 'battery_bank'
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
  /** One-time flat surcharges in stockpile-materials pools (e.g. the 1
   *  Scientific Material IFZ requires to establish a Research Center).
   *  Never volume- or percentage-scaled. */
  scientific_materials?: number;
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

export interface ProductionRecipe {
  id: string;
  name: string;
  inputs: BuildingResourceFlow[];
  /** Stockpile output of the line. Absent on armory gear lines, whose product
   *  is a real item pushed to the settlement armory via `gear`. */
  outputs?: BuildingResourceFlow[];
  cycleSeconds?: number;
  /**
   * Research node that gates THIS production line (deeper in the tree than the
   * facility's own unlock, e.g. each Arms Factory firearm). Locked lines never
   * run in the sim and render disabled with their required research in the
   * recipe picker.
   */
  researchRequirement?: string;
  /**
   * Armory gear the line manufactures (Arms Factory firearms, Protective Gear
   * Factory armor). While the line runs its material inputs are consumed
   * continuously; when one full unit of work accrues a single real item is
   * pushed to the settlement armory for squad/tower assignment.
   */
  gear?: { kind: 'weapon' | 'armor'; itemId: string };
}

export interface FunctionalBuildingDefinition {
  id: FunctionalBuildingTypeId;
  /**
   * Explicit §7.1 defensive classification — the simulation reads these
   * booleans directly instead of inferring behaviour from the type id string.
   * - `blocksMovement`: hard obstacle for enemy pathing (gates still block
   *   enemies even though friendlies may pass through them)
   * - `allowsFriendlyPassage`: portal — friendly units may path through
   * - `guardable`: can be staffed by guards (defensive labour attaches here)
   * - `weaponMountable`: can carry an equipped weapon (towers)
   *
   * Defs without the block default to all-false (no defensive behaviour).
   */
  blocksMovement?: boolean;
  allowsFriendlyPassage?: boolean;
  guardable?: boolean;
  weaponMountable?: boolean;
  /** §7.1 Hazard: the structure does NOT block pathing — it slows infected
   *  crossing it by this percentage (0-100) and bleeds them per second
   *  (Barbed Wire). Friendlies pass freely at normal cost. */
  slowsInfectedPct?: number;
  damageOnContact?: number;
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
  recipes?: ProductionRecipe[];
  /** Generator Station specs — output kW, radius, fuel burn, buffer capacity. */
  powerProperties?: {
    powerOutputKw: number;
    powerRadiusM: number;
    fuelPerHour: number;
    fuelCapacity: number;
  };
  /** Battery Bank specs — kWh storage, charge/discharge rate, reach. */
  batteryProperties?: {
    capacityKwh: number;
    chargeKw: number;
    dischargeKw: number;
    powerRadiusM: number;
  };
  /** One-time flat establishment surcharge (per facility, never size-scaled).
   *  §Research Center: 1 Scientific Material required to build. */
  constructionSurcharge?: ResourceCost;
  storageCapacity?: number;
  housingCapacity?: number;
  squadCapacity?: number;
  defenceProperties?: BuildingDefenceProperties;
  weaponSlots?: number;
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

/**
 * Player-facing Repairmen Shop control (§IFZ): which structural-importance
 * bands the automated maintenance crews may repair. Each flag maps to one
 * band of the internal priority hierarchy (Emergency → High → Normal → Low).
 * When a band is disabled its buildings are ignored, even when damaged.
 */
export interface AutomatedRepairConfig {
  emergency: boolean;
  high: boolean;
  normal: boolean;
  low: boolean;
}

export interface AdaptedBuilding {
  buildingId: string | number;
  typeId: FunctionalBuildingTypeId;
  isHQ: boolean;
  name: string;
  category: FunctionalCategory;
  adaptedAt: number;
  // Capacity calculated from real footprint (§7.1)
  footprintAreaM2: number;
  /** Portion of the real structure currently converted to this function. */
  adaptedAreaM2: number;
  /** 0..100 coverage of the source building converted to this function. */
  adaptationPercentage: number;
  /**
   * Physical sub-region of the source footprint actually converted (§7.1
   * IFZ-style drag adaptation). When set, the player selected this exact area
   * by dragging across the building; the percentage is derived from its area.
   * Absent on whole-building / percentage-based conversions and on legacy
   * saves, meaning the entire footprint is the converted region.
   */
  adaptedPolygon?: Point2D[];
  /**
   * For split sections: the id of the real (OSM) building this section was
   * carved from. The map key is the section id (`<bldgId>::s<N>`); the parent
   * structure is found through this reference. Absent on primary adaptations.
   */
  sourceBuildingId?: string | number;
  totalFloorAreaM2: number;
  volumeM3: number;
  /** Functional capacity at FULL (100%) adaptation of the source structure.
   *  `maxCapacity` is this value scaled by `adaptationPercentage` for partial
   *  conversions; the full value is kept for expansion previews / tooltips. */
  fullCapacity?: number;
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
  rotationDeg?: number;
  // Rendered footprint applied to freestanding structures. Fence/wall segments
  // store their true per-segment run length so consecutive segments butt
  // end-to-end with no gaps; defaults fall back to the type's canonical dims.
  width?: number;
  length?: number;
  // Construction Progress & Labour (§4.6, §7.1)
  constructionStatus: 'planned' | 'in_progress' | 'completed';
  constructionProgress: number; // 0 to 100
  constructionWorkRequired: number; // in work units
  constructionWorkDone: number;
  /**
   * Explicit construction-queue index (0 = first to build). Set when the
   * player reorders the queue; absent sites fall back to placement order
   * (adaptedAt). Lower values build first.
   */
  constructionPriority?: number;
  assignedWorkers: number; // Auto-assigned general workers
  assignedHeadId?: string; // Appointed Named Survivor Building Head (§4.6)
  assignedHeadTitle?: string; // e.g. "Head Chef", "Head Doctor", "Head Foreman"
  isUnderRepair?: boolean;
  repairProgress?: number;
  repairWorkRequired?: number;
  repairWorkDone?: number;
  equippedWeaponId?: WeaponItemId;
  ammoPerShot?: number;
  /**
   * Which production recipe this facility runs. Buildings with several
   * selectable recipes (Cookhouse, Chemical Plant) persist the player's choice
   * here; single-recipe buildings need no value. Absent on legacy saves:
   * the sim falls back to the only recipe / first affordable one.
   */
  selectedRecipeId?: string | null;
  /**
   * Fractional manufacturing progress per gear production line id (§IFZ Arms
   * Factory / Protective Gear Factory). Materials are consumed continuously
   * while a line runs; at 1.0 a real weapon/armor item lands in the armory.
   * Progress is kept per recipe id, so switching lines preserves each line's
   * partial work instead of discarding it.
   */
  craftProgress?: Record<string, number>;
  /**
   * Player's choice to fertilize this agriculture plot. While ON the field
   * yields ×1.75 but consumes Fertilizer from the stockpile each crop cycle
   * (0.5/day); an empty fertilizer stock simply runs the cycle unfertilized.
   * Absent/undefined = unfertilized (never consume, no bonus).
   */
  isFertilized?: boolean;
}

// ==========================================
// 3b. Split Building Sections (§7.1 IFZ splitting)
// ==========================================

/**
 * One independently-adaptable section of a real building footprint, produced
 * by splitting a large structure. Each section keeps its own polygon so it can
 * be converted to a different facility type and adapted independently.
 */
export interface BuildingSection {
  /** Section id used as the adaptedBuildings map key once this section is
   *  adapted (format `<sourceId>::s<N>`). */
  id: string;
  /** Id of the real (OSM) building this section belongs to. */
  sourceBuildingId: string | number;
  /** 0-based index within the parent building's section list. */
  index: number;
  /** Physical footprint polygon of this section. */
  polygon: Point2D[];
  center: Point2D;
  footprintAreaM2: number;
  /** Bricks charged to cut this section off from its neighbours (paid once at
   *  split time). */
  splitBrickCost: number;
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
  /** Structural integrity of the command center. When this reaches 0 the
   *  settlement is lost (status → 'destroyed') but the campaign continues. */
  maxDurability: number;
  currentDurability: number;
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
  // Cached A* path state so construction crews route around obstacles (walls,
  // towers, buildings) instead of walking straight through them. Structurally
  // matches PathState from services/pathfindingService.
  pathState?: { path: Point2D[]; index: number; goalKey: string };
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
  state?: 'dismantling' | 'returning';
  carriedMaterials?: ResourceCost;
  /** True while the storage ceiling blocks depositing the recovered load;
   *  set once per blocked episode so the overflow warning counts each
   *  pile once, cleared when the deposit succeeds. */
  depositBlocked?: boolean;
}

// ==========================================
// 7. Fog of War (§3.5)
// ==========================================

export interface FieldLootPile {
  id: string;
  position: Point2D;
  wood: number;
  metal: number;
  bricks: number;
  /** Non-material backpack stacks (food, water, fuel, ammo, meds, tools,
   *  weapons, armor) stranded alongside materials — e.g. a fallen squad's
   *  leftover inventory. Collected back into a squad backpack one slot per
   *  stack, exactly like scavenged loot. */
  items?: SquadLootItem[];
  /** Origin: 'gatherer' | 'deconstruction' | 'caravan' | 'fallen_squad' (future). */
  source?: string;
  createdAt: number;
}

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
  /** Command centers established in this settlement. This array is the
   *  authoritative HQ collection — the primary (command) HQ is the entry
   *  whose buildingId matches `primaryHQId` (or the first entry on saves
   *  predating `primaryHQId`). A destroyed HQ remains recorded here but
   *  contributes no stats until re-established. */
  headquarters: SettlementHQ[];
  /** Id of the settlement's current primary command HQ. Establishing or
   *  selecting a new HQ promotes that facility to primary, even after the
   *  previous primary was breached. */
  primaryHQId: string | number | null;
  stockpile: SettlementStockpile;
  adaptedBuildings: Map<string | number, AdaptedBuilding>;
  /**
   * IFZ-style footprint splitting: sections each source building has been
   * divided into. Keyed by the real building id; each entry is independently
   * adaptable into any facility type. Absent = the building is unsplit.
   */
  buildingSections?: Map<string | number, BuildingSection[]>;
  freestandingBuildings: AdaptedBuilding[];
  totalStorageCapacity: number;
  /** Units that could not be stored because the settlement stockpile was full.
   *  The goods themselves are never deleted and never pushed past the ceiling:
   *  they are held by the carrying squad / vehicle / crew (and auto-deposited
   *  once space frees) or stranded at the destination of a full caravan
   *  arrival. This counter reports how much has piled up outside storage and
   *  is cumulative for warning purposes. */
  overflowLootUnits?: number;
  /**
   * Stranded field loot physically left in the world when a gatherer or
   * demolition crew could not fit its harvest into a full stockpile at the
   * worksite. Each pile sits at world coordinates, is rendered as a marker,
   * and a squad can be dispatched to it to collect the materials into its
   * backpack (then deposit normally). Nothing here is lost or held past the
   * storage ceiling.
   */
  fieldLootPiles?: FieldLootPile[];
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
  // Vehicle Workshop orders (§8) — fabrication / time-repair / dismantling jobs.
  vehicleWorkshopOrders?: VehicleWorkshopOrder[];
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
  // Water Cistern economy (§Terminus-original): per-cistern buffers whose
  // roof-area-scaled capacity caps the settlement's rainwater storage.
  waterState?: import('./water').WaterState;
  // Local power grid (§Terminus extension): fuel-burning generators power a
  // radius; priority-allocated consumers shut down when demand exceeds supply.
  powerState?: import('./power').PowerState;
  // Shooting Range training: ammo-into-proficiency sessions per squad.
  trainingState?: import('./training').TrainingState;
  // Morale & Population Growth System (§4.5)
  morale?: SettlementMoraleState;
  // Laws & Policy System (§IFZ Major Update #5) — enacted via the Gathering Place
  laws?: LawsState;
  // Repairmen Shop (§IFZ): which maintenance bands the automated repair crews
  // may service. Absent on legacy saves = every band enabled (the original
  // automatic priority behaviour).
  automatedRepairConfig?: AutomatedRepairConfig;
  // Expeditions (§IFZ) — off-map scavenging areas revealed through the Antenna
  expeditions?: ExpeditionState;
  // Building Occupations (§IFZ) — infected take over UNADAPTED structures
  occupiedBuildings?: OccupationState;
  // Weather & Seasons System (§9)
  weather?: WeatherState;
  // Physical Scavenging & Building Loot Records
  searchedBuildings?: Map<string | number, BuildingLootRecord>;
  // Colony Banner & Scenario Configuration
  banner?: ColonyBannerConfig;
  scenarioSettings?: GameScenarioSettings;
  /** Multiplier applied when generating new building loot (0.5 / 1 / 1.8). */
  scavengingResourceMultiplier?: number;
}
