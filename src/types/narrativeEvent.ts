/**
 * Narrative event types + the lightweight game-event journal.
 *
 * The mission engine consumes events from this journal. Events are either
 * emitted by gameplay services (emitGameEvent) or derived by the mission
 * system itself from a persisted world snapshot (diff-based reconciliation —
 * the safety net that keeps triggers firing exactly once across save/load and
 * offline catch-up).
 */

export type GameEventType =
  // Buildings
  | 'HQ_ESTABLISHED'
  | 'BUILDING_CONSTRUCTED'
  | 'BUILDING_ADAPTED'
  | 'BUILDING_DECONSTRUCTED'
  | 'BUILDING_DESTROYED'
  | 'BUILDING_SCAVENGED'
  // Resources
  | 'RESOURCE_ACQUIRED'
  | 'RESOURCE_PRODUCED'
  | 'RESOURCE_CONSUMED'
  // Survivors
  | 'SURVIVOR_DISCOVERED'
  | 'SURVIVOR_RESCUED'
  | 'SURVIVOR_RECRUITED'
  | 'POPULATION_CHANGED'
  // Squads & Locations
  | 'SQUAD_FORMED'
  | 'SQUAD_CREATED'
  | 'SQUAD_TRAVEL_STARTED'
  | 'LOCATION_DISCOVERED'
  | 'LOCATION_REACHED'
  // Combat & Lairs
  | 'INFECTED_KILLED'
  | 'LAIR_DISCOVERED'
  | 'LAIR_CLEARED'
  | 'HORDE_DEFEATED'
  // Economy, Industry & Research
  | 'RESEARCH_COMPLETED'
  | 'ITEM_MANUFACTURED'
  | 'VEHICLE_RECOVERED'
  // Caravans
  | 'CARAVAN_DISPATCHED'
  | 'CARAVAN_ARRIVED'
  // Factions & Settlements
  | 'FACTION_CONTACTED'
  | 'SETTLEMENT_ESTABLISHED'
  | 'SETTLEMENT_LOST'
  | 'DAY_STARTED';

export interface BuildingConstructedPayload {
  buildingId: string | number;
  buildingType: string;
  settlementId?: string;
}

export interface BuildingAdaptedPayload {
  buildingId: string | number;
  buildingType: string;
  settlementId?: string;
}

export interface BuildingDeconstructedPayload {
  buildingId: string | number;
  buildingType?: string;
  settlementId?: string;
}

export interface BuildingScavengedPayload {
  buildingId: string | number;
  settlementId?: string;
  loot?: Record<string, number>;
  squadId?: string;
}

export interface ResourceAcquiredPayload {
  resourceType: string;
  amount: number;
  source: 'scavenge' | 'trade' | 'production' | 'caravan' | 'reward' | 'other';
  buildingId?: string | number;
  settlementId?: string;
}

export interface ResourceProducedPayload {
  resourceType: string;
  amount: number;
  facilityType?: string;
  settlementId?: string;
}

export interface ResourceConsumedPayload {
  resourceType: string;
  amount: number;
  reason?: string;
  settlementId?: string;
}

export interface SurvivorDiscoveredPayload {
  survivorGroupId?: string | number;
  buildingId?: string | number;
  settlementId?: string;
  count?: number;
}

export interface SurvivorRescuedPayload {
  survivorGroupId?: string | number;
  hideoutId?: string | number;
  buildingId?: string | number;
  count: number;
  settlementId?: string;
}

export interface SurvivorRecruitedPayload {
  survivorGroupId?: string | number;
  buildingId?: string | number;
  count: number;
  leaderName?: string;
  settlementId?: string;
}

export interface SquadCreatedPayload {
  squadId: string;
  settlementId?: string;
}

export interface SquadTravelStartedPayload {
  squadId: string;
  origin?: { x: number; z: number };
  destination: { x: number; z: number; buildingId?: string | number };
  settlementId?: string;
}

export interface LocationDiscoveredPayload {
  locationId: string | number;
  category?: string;
  buildingId?: string | number;
  settlementId?: string;
}

export interface LocationReachedPayload {
  squadId: string;
  buildingId?: string | number;
  locationId?: string | number;
  settlementId?: string;
}

export interface InfectedKilledPayload {
  count: number;
  source?: 'squad' | 'tower' | 'wire' | 'vehicle' | 'other';
  lairId?: string | number;
  settlementId?: string;
}

export interface LairClearedPayload {
  lairId: string | number;
  buildingId?: string | number;
  settlementId?: string;
}

export interface ResearchCompletedPayload {
  nodeId: string;
  settlementId?: string;
}

export interface ItemManufacturedPayload {
  resourceType: string;
  amount: number;
  /** Legacy aliases some older emissions used; the mission evaluator tolerates both spellings. */
  itemId?: string;
  quantity?: number;
  facilityType?: string;
  settlementId?: string;
}

export interface CaravanDispatchedPayload {
  caravanId: string;
  originSettlementId: string;
  destinationSettlementId: string;
  cargo?: Record<string, number>;
}

export interface CaravanArrivedPayload {
  caravanId: string;
  originSettlementId: string;
  destinationSettlementId: string;
  cargo?: Record<string, number>;
}

export interface FactionContactedPayload {
  factionId: string;
  settlementId?: string;
  method?: string;
}

export interface SettlementEstablishedPayload {
  settlementId: string;
  name: string;
}

export interface SettlementLostPayload {
  settlementId: string;
  reason?: string;
}

export interface GameEventPayloadMap {
  BUILDING_CONSTRUCTED: BuildingConstructedPayload;
  BUILDING_ADAPTED: BuildingAdaptedPayload;
  BUILDING_DECONSTRUCTED: BuildingDeconstructedPayload;
  BUILDING_DESTROYED: { buildingId: string | number; settlementId?: string };
  BUILDING_SCAVENGED: BuildingScavengedPayload;
  RESOURCE_ACQUIRED: ResourceAcquiredPayload;
  RESOURCE_PRODUCED: ResourceProducedPayload;
  RESOURCE_CONSUMED: ResourceConsumedPayload;
  SURVIVOR_DISCOVERED: SurvivorDiscoveredPayload;
  SURVIVOR_RESCUED: SurvivorRescuedPayload;
  SURVIVOR_RECRUITED: SurvivorRecruitedPayload;
  POPULATION_CHANGED: { population: number; settlementId?: string };
  HQ_ESTABLISHED: { buildingId?: string | number; settlementId?: string };
  SQUAD_FORMED: { squadCount?: number; settlementId?: string };
  SQUAD_CREATED: SquadCreatedPayload;
  SQUAD_TRAVEL_STARTED: SquadTravelStartedPayload;
  LOCATION_DISCOVERED: LocationDiscoveredPayload;
  LOCATION_REACHED: LocationReachedPayload;
  INFECTED_KILLED: InfectedKilledPayload;
  LAIR_DISCOVERED: { lairId: string | number; settlementId?: string };
  LAIR_CLEARED: LairClearedPayload;
  HORDE_DEFEATED: { waveNumber?: number; settlementId?: string };
  RESEARCH_COMPLETED: ResearchCompletedPayload;
  ITEM_MANUFACTURED: ItemManufacturedPayload;
  VEHICLE_RECOVERED: { vehicleId: string; settlementId?: string };
  CARAVAN_DISPATCHED: CaravanDispatchedPayload;
  CARAVAN_ARRIVED: CaravanArrivedPayload;
  FACTION_CONTACTED: FactionContactedPayload;
  SETTLEMENT_ESTABLISHED: SettlementEstablishedPayload;
  SETTLEMENT_LOST: SettlementLostPayload;
  DAY_STARTED: { day: number };
}

export interface GameEventRecord<T extends GameEventType = GameEventType> {
  id: number;
  type: T;
  timestamp: number;
  payload?: T extends keyof GameEventPayloadMap ? GameEventPayloadMap[T] : Record<string, unknown>;
}

export interface NarrativeEventDefinition {
  id: string;
  eventType: GameEventType;
  missionId?: string;
  transmissionId?: string;
}