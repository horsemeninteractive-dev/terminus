import { Point2D } from './map';

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
  hasMountedTurret: boolean;
  turretDamage?: number;
  turretFireRate?: number;
  turretRange?: number;
  repairMetalCost: number;
  repairPartsCost?: number;
  soundRadius: number; // acoustic radius in meters when running
}

export const VEHICLE_DEFINITIONS: Record<VehicleType, VehicleDefinition> = {
  car: {
    type: 'car',
    name: 'Civilian Sedan / SUV',
    description: 'Nimble civilian vehicle. High road cruising speed and fuel efficiency, perfect for rapid recon, scouting, and swift squad relocation.',
    fuelType: 'gasoline',
    maxFuel: 50,
    fuelConsumptionPer100m: 0.8, // 0.8 L per 100m
    maxHp: 220,
    speedMps: 18.0, // ~65 km/h
    cargoBonus: 25,
    crewCapacity: 4,
    hasMountedTurret: false,
    repairMetalCost: 20,
    soundRadius: 35,
  },
  armed_truck: {
    type: 'armed_truck',
    name: 'Tactical Armed Truck',
    description: 'Reinforced 4x4 pickup equipped with a mounted .50 cal heavy machine gun turret. Heavy armor and overwhelming fire support against hordes and brutes.',
    fuelType: 'diesel',
    maxFuel: 75,
    fuelConsumptionPer100m: 1.4, // 1.4 L per 100m
    maxHp: 520,
    speedMps: 14.5, // ~52 km/h
    cargoBonus: 50,
    crewCapacity: 4,
    hasMountedTurret: true,
    turretDamage: 38,
    turretFireRate: 0.35, // 0.35s between high-caliber rounds
    turretRange: 36, // 36 meters range
    repairMetalCost: 35,
    soundRadius: 75,
  },
  cargo_van: {
    type: 'cargo_van',
    name: 'Scavenger Cargo Van',
    description: 'Heavy panel van outfitted with reinforced suspension and high-volume cargo racks. Substantially increases scavenging loot yield from expeditions.',
    fuelType: 'diesel',
    maxFuel: 70,
    fuelConsumptionPer100m: 1.1,
    maxHp: 360,
    speedMps: 13.0, // ~47 km/h
    cargoBonus: 140, // High payload capacity!
    crewCapacity: 4,
    hasMountedTurret: false,
    repairMetalCost: 25,
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
}

// Scavenged Fuel Node / Canister
export interface ScavengeFuelLoot {
  gasoline: number;
  diesel: number;
  sourceLabel: string;
}
