import { Point2D } from './map';
import { SquadLootItem } from './population';

// ==========================================
// 1. Vehicle Archetypes & Classifications (§8)
// ==========================================

export type VehicleType = 'car' | 'armed_truck' | 'cargo_van';

export type VehicleCondition = 'salvageable' | 'operational' | 'wrecked';

export type VehicleFuelType = 'gasoline' | 'diesel';

export interface VehicleDefinition {
  type: VehicleType;
  name: string;
  description: string;
  fuelType: VehicleFuelType;
  maxFuel: number; // liters (e.g. 45 - 75 L)
  fuelConsumptionPer100m: number; // fuel consumed per 100m driven on roads
  maxHp: number; // Durability / Armor
  speedMps: number; // Speed in meters/sec on road (14 - 22 m/s)
  cargoBonus: number; // Hauling / loot capacity bonus
  crewCapacity: number; // max squad size (4)
  inventoryCapacity: number; // number of physical loot slots in the cargo bay
  hasMountedTurret: boolean;
  turretDamage?: number;
  turretFireRate?: number;
  turretRange?: number;
  repairMetalCost: number;
  repairPartsCost?: number;
  /** Metal consumed to fabricate this model at a Vehicle Workshop (§8). */
  fabricationMetalCost: number;
  /** Metal recovered when the chassis is dismantled at a Vehicle Workshop (§8). */
  scrapMetalYield: number;
  soundRadius: number; // acoustic radius in meters when running
}

export const VEHICLE_DEFINITIONS: Record<VehicleType, VehicleDefinition> = {
  car: {
    type: 'car',
    name: 'Civilian Sedan / SUV',
    description: 'Nimble civilian vehicle. High road cruising speed and fuel efficiency, perfect for rapid recon, scouting, and swift squad relocation.',
    fuelType: 'gasoline',
    maxFuel: 50,
    // Real-world-scale economy (~8 L/100 km). The previous 0.8 L/100m was 10x
    // reality: a tank lasted one or two cross-map drives, draining the whole
    // motor pool within a game day. 0.08 gives ~60 km per tank — several
    // expeditions before a refuel run is needed.
    fuelConsumptionPer100m: 0.08, // 8 L per 100 km
    maxHp: 220,
    speedMps: 18.0, // ~65 km/h
    cargoBonus: 25,
    crewCapacity: 4,
    inventoryCapacity: 12,
    hasMountedTurret: false,
    repairMetalCost: 20,
    fabricationMetalCost: 70,
    scrapMetalYield: 35,
    soundRadius: 35,
  },
  armed_truck: {
    type: 'armed_truck',
    name: 'Tactical Armed Truck',
    description: 'Reinforced 4x4 pickup equipped with a mounted .50 cal heavy machine gun turret. Heavy armor and overwhelming fire support against hordes and brutes.',
    fuelType: 'diesel',
    maxFuel: 75,
    fuelConsumptionPer100m: 0.14, // 14 L per 100 km (heavy 4x4)
    maxHp: 520,
    speedMps: 14.5, // ~52 km/h
    cargoBonus: 50,
    crewCapacity: 4,
    inventoryCapacity: 16,
    hasMountedTurret: true,
    turretDamage: 38,
    turretFireRate: 0.35, // 0.35s between high-caliber rounds
    turretRange: 36, // 36 meters range
    repairMetalCost: 35,
    fabricationMetalCost: 160,
    scrapMetalYield: 90,
    soundRadius: 75,
  },
  cargo_van: {
    type: 'cargo_van',
    name: 'Scavenger Cargo Van',
    description: 'Heavy panel van outfitted with reinforced suspension and high-volume cargo racks. Substantially increases scavenging loot yield from expeditions.',
    fuelType: 'diesel',
    maxFuel: 70,
    fuelConsumptionPer100m: 0.11, // 11 L per 100 km (loaded panel van)
    maxHp: 360,
    speedMps: 13.0, // ~47 km/h
    cargoBonus: 140, // High payload capacity!
    crewCapacity: 4,
    inventoryCapacity: 25,
    hasMountedTurret: false,
    repairMetalCost: 25,
    fabricationMetalCost: 100,
    scrapMetalYield: 55,
    soundRadius: 40,
  },
};

// ==========================================
// 2. World Vehicle Instance (§8)
// ==========================================

export interface VehicleTurretState {
  mountType: 'hmg_50cal';
  rotation: number;
  fireRate: number;
  lastFireTime: number;
  damage: number;
  range: number;
  targetZombieId: string | null;
}

export interface WorldVehicle {
  id: string;
  type: VehicleType;
  name: string;
  condition: VehicleCondition;
  position: Point2D;
  rotation: number;
  y: number;
  currentHp: number;
  maxHp: number;
  fuelType: VehicleFuelType;
  currentFuel: number;
  maxFuel: number;
  fuelConsumptionPer100m: number;
  assignedSquadId: string | null;
  assignedSquadName?: string;
  turret?: VehicleTurretState;
  
  // Navigation along real OSM Road geometry (§8)
  isMoving: boolean;
  roadPathWaypoints: Point2D[];
  currentWaypointIndex: number;
  targetPos: Point2D | null;
  pathState?: { path: Point2D[]; index: number; goalKey: string };
  speed: number;
  
  // Scavenge & Siphoning state
  isDiscovered: boolean;
  isSiphoned: boolean;
  isParkedAtHQ: boolean;
  totalDistanceDriven: number;
  killCount: number;
  osmRoadId?: string | number;
  autoScavengeBuildingId?: string | number | null;
  autoScavengeBuildingName?: string | null;

  // Cargo bay: physical loot slots shared by the mounted squad. The squad
  // deposits scavenged items here before continuing to the next building, and
  // the whole bay is emptied at HQ/storage when the squad returns to deposit.
  inventory?: SquadLootItem[];

  // Set when the mounted squad finishes a run with the cargo bay full (or an
  // overflow backpack): after the squad boards again the vehicle drives home to
  // HQ/storage to deposit both the squad and vehicle inventories.
  autoDepotReturn?: boolean;

  // Obstacle revision the current roadPathWaypoints were computed against. If
  // freestanding construction is placed/removed, this no longer matches the
  // grid's revision and the vehicle re-routes immediately instead of driving a
  // stale route into new walls.
  routeRevision?: number;

  // Length (metres) of the final leg of the current route that runs OFF the
  // road network, from the last road waypoint to targetPos. Vehicles drive it
  // at a reduced speed and never enter building/water footprints.
  offRoadLegDistance?: number;

  // True when the vehicle stopped short of its ordered destination because the
  // last off-road step was blocked by a building/water footprint (e.g. an HQ or
  // depot right-click, whose target point lies inside the building). The vehicle
  // has reached the nearest drivable point and should be treated as PARKED so
  // downstream logic (deposit, dismount, queue-dispatch) can take over instead
  // of waiting forever for it to reach an unreachable targetPos.
  reachBlocked?: boolean;

  // Set while the vehicle sits in a Vehicle Workshop bay on a repair or
  // dismantle order. A vehicle being dismantled cannot be mounted/driven.
  workshopJobId?: string | null;
}

// ==========================================
// 3. Vehicle Workshop Orders (§8)
// ==========================================

export type VehicleWorkshopOrderType = 'fabricate' | 'repair' | 'dismantle';

/**
 * A job queued on a Vehicle Workshop (adapt `vehicle_workshop`):
 * - `fabricate` consumes metal over time and spawns a new operational vehicle
 * - `repair` restores chassis HP over time, consuming metal per HP healed
 * - `dismantle` recovers scrap metal from a parked chassis over time
 *
 * Progress is measured in mechanic-hours; the workshop's assigned workers are
 * split across its active orders every tick (one bay per order).
 */
export interface VehicleWorkshopOrder {
  id: string;
  workshopId: string | number;
  workshopName: string;
  type: VehicleWorkshopOrderType;
  /** Vehicle under repair / being dismantled. */
  vehicleId?: string | null;
  /** Model being fabricated. */
  vehicleType?: VehicleType;
  label: string;
  mechanicHoursDone: number;
  mechanicHoursRequired: number;
  /** Metal still owed for a fabrication, deducted as work advances. */
  pendingMetal?: number;
  createdAt: number;
}


// Scavenged Fuel Node / Canister
export interface ScavengeFuelLoot {
  gasoline: number;
  diesel: number;
  sourceLabel: string;
}
