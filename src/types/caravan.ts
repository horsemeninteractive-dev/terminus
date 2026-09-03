import { GeoPoint, MapData, Point2D, SettlementPlacement } from './map';
import { NamedSurvivor, Squad } from './population';
import { SettlementState, SettlementStockpile } from './settlement';
import { WorldVehicle } from './vehicle';

export type SettlementOperationalStatus = 'operational' | 'destroyed' | 'reclaiming';

export interface SettlementRecord {
  id: string;
  name: string;
  status: SettlementOperationalStatus;
  placement: SettlementPlacement;
  state: SettlementState;
  dayEstablished: number;
  overrunAtDay?: number | null;
  overrunReason?: string | null;
  fallenCountTotal?: number;
  cachedMapData?: MapData; // Cached map data for seamless world switching
  cachedZombies?: any[]; // Cached zombies
  lastSimulatedAt?: number; // Last timestamp used for inactive-colony simulation
}

export type CaravanStatus = 'traveling' | 'ambushed' | 'arrived' | 'destroyed';

export interface CaravanAmbushEvent {
  id: string;
  title: string;
  description: string;
  ambushPower: number;
  combatRounds: number;
  casualtiesNamed: string[];
  casualtiesGeneral: number;
  cargoLossPercent: number;
  vehicleDamageTaken: number;
  resolved: boolean;
  victory: boolean;
}

export interface TradeCaravan {
  id: string;
  name: string;
  originSettlementId: string;
  originSettlementName: string;
  originGeo: GeoPoint;
  destinationSettlementId: string;
  destinationSettlementName: string;
  destinationGeo: GeoPoint;
  
  // Assigned Assets (§7.5, §8)
  vehicle: WorldVehicle;
  escortSquad: Squad;
  transportedSurvivors: {
    named: NamedSurvivor[];
    generalCount: number;
  };
  cargo: SettlementStockpile;

  // Real-World Geographic Distance & Route Kinetics (§7.5)
  distanceKm: number;
  speedKmh: number;
  totalDurationSeconds: number;
  elapsedSeconds: number;
  progress: number; // 0.0 to 1.0
  currentGeoPoint: GeoPoint;

  // Status & Danger
  status: CaravanStatus;
  ambushRiskRating: 'Low' | 'Medium' | 'High' | 'Extreme';
  activeAmbush?: CaravanAmbushEvent | null;
  fuelConsumed: number;
  dispatchDay: number;
  createdAt: number;
  
  eventLog: Array<{
    timestamp: number;
    text: string;
    type: 'info' | 'warn' | 'success' | 'danger';
  }>;
}

export interface CaravanDispatchConfig {
  originSettlementId: string;
  destinationSettlementId: string;
  vehicleId: string;
  squadId: string;
  cargo: SettlementStockpile;
  transportNamedSurvivorIds: string[];
  transportGeneralCount: number;
}
