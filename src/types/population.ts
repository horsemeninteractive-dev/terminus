import { LootItem } from './loot';

export type StatTier = 'novice' | 'skilled' | 'expert';

export interface SurvivorStats {
  combat: StatTier;
  scavenging: StatTier;
  medical: StatTier;
  driving: StatTier;
  persuasion: StatTier;
  construction: StatTier;
  production: StatTier;
  fortification?: StatTier;
  engineering?: StatTier;
  farming?: StatTier;
  logistics?: StatTier;
}

export type NamedSurvivorRole =
  | { type: 'unassigned' }
  | { type: 'squad_leader'; squadId: string; squadName: string }
  | { type: 'building_head'; buildingId: string | number; title: string; facilityName: string };

export interface NamedSurvivor {
  id: string;
  name: string;
  avatarSeed?: string;
  background: string;
  stats: SurvivorStats;
  role: NamedSurvivorRole;
  morale: number; // 0 - 100
  recruitedAt: number;
}

export type JobSector = 'construction' | 'food' | 'defense' | 'production' | 'medical' | 'other';

export type WorkerJobTypeId =
  | 'builder'
  | 'scavenger'
  | 'farming'
  | 'food_prep'
  | 'guard'
  | 'factory'
  | 'scientist'
  | 'nurse';

export type WorkerPriorityLevel = 0 | 1 | 2 | 3 | 4; // 0: Disabled, 1: Low (v), 2: Normal (=), 3: High (^), 4: Urgent (^^)

export interface WorkerJobInfo {
  id: WorkerJobTypeId;
  name: string;
  category: string;
  iconName: string;
  assigned: number;
  maxDemand: number;
  priority: WorkerPriorityLevel;
  limit: number;
}

export interface CitizenBreakdownStats {
  totalCitizens: number;
  children: number;
  homeless: number;
  ill: number;
  unemployed: number;
  totalWorkers: number;
  squadMembers: number;
}

export interface ChildCitizen {
  id: string;
  age: number;
  bornAtDay: number;
}

export interface GeneralPopulation {
  total: number;
  /** Individually tracked non-worker citizens. Children age into the workforce. */
  children?: ChildCitizen[];
  inSquads: number;
  assignedJobs: Record<JobSector, number>;
  assignedWorkerJobs?: Record<WorkerJobTypeId, number>;
  workerPriorities?: Record<WorkerJobTypeId, WorkerPriorityLevel>;
  workerLimits?: Record<WorkerJobTypeId, number>;
  unassigned: number;
}

export type SquadPhysicalAction =
  | 'idle'
  | 'moving'
  | 'searching'
  | 'combat'
  | 'returning'
  | 'gathering'
  | 'boarding'
  | 'in_vehicle'
  | 'captured';

export interface SquadLootItem {
  id: string;
  kind: 'resource' | 'weapon' | 'armor';
  label: string;
  quantity: number;
  weight: number;
  itemId?: string;
}

export interface SquadInventory {
  capacity: number;
  used: number;
  items: SquadLootItem[];
}

export interface Squad {
  id: string;
  name: string;
  leaderId: string; // References NamedSurvivor ID (exactly 1)
  generalCount: number; // 0 to 3 general pop members (Total squad max = 4)
  status: SquadPhysicalAction;
  inventory: LootItem[];
  currentWeightKg: number;
  maxWeightKg: number;
  createdAt: number;
}

export type GroupDisposition = 'willing' | 'distrustful' | 'hostile';

export interface HiddenSurvivorGroup {
  id: string;
  buildingId: string | number;
  buildingName: string;
  hasSmokeClue: boolean;
  isDiscovered: boolean;
  isRecruited: boolean;
  isHostileResolved?: boolean;
  // Set once the player actually encounters the group (§4.4, §5.0). Before this the
  // group's disposition is unknown and must render as a neutral marker.
  encounteredDisposition?: GroupDisposition | null;
  leader: {
    name: string;
    background: string;
    stats: SurvivorStats;
  };
  generalCount: number; // Number of non-combatant/general survivors accompanying leader (2-8)
  disposition: GroupDisposition;
  dialogue: string;
  foodCostToBribe?: number;
}

