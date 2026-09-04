/**
 * Mission / Task / Trigger / Reward types for the Terminus campaign framework.
 *
 * Architecture rule: content (definitions) lives in src/data/, engine logic
 * lives in src/services/. A content designer must be able to author a mission
 * by adding data — never by editing the engine.
 */

export type MissionCategory =
  | 'campaign'
  | 'exploration'
  | 'settlement'
  | 'emergency'
  | 'faction'
  | 'survival'
  | 'discovery';

export type MissionPriority = 'critical' | 'high' | 'normal' | 'low';

export type MissionStatus =
  | 'pending' // briefing transmission sent, awaiting player response
  | 'active'
  | 'completed'
  | 'failed'
  | 'declined'
  | 'expired'
  | 'cancelled';

export type TaskStatus = 'pending' | 'active' | 'completed' | 'failed';

/**
 * Every task type the engine can evaluate. Evaluation is ALWAYS derived from
 * authoritative game state (buildings, lairs, research, stockpile, squads…),
 * never from fake quest-only counters.
 */
export type MissionTaskType =
  | 'establish_hq'
  | 'form_squad'
  | 'recruit_survivors'
  | 'rescue_survivors'
  | 'scavenge_building'
  | 'scavenge_resource'
  | 'build_facility'
  | 'adapt_building'
  | 'research_technology'
  | 'manufacture_item'
  | 'eliminate_infected'
  | 'clear_lair'
  | 'discover_location'
  | 'travel_to_location'
  | 'deliver_resources'
  | 'reach_population'
  | 'survive_duration'
  | 'survive_night'
  | 'maintain_resource'
  | 'contact_faction'
  | 'establish_settlement'
  | 'custom';

/**
 * A reference to a real game entity. `*Spec` fields are resolved at mission
 * creation time against the actual world (OSM buildings, lairs, settlements)
 * and stored on the task as `boundTargetId`.
 */
export interface TargetRefSpec {
  type: 'building' | 'lair' | 'squad' | 'settlement' | 'resource';
  /** Semantic OSM category to bind against (pharmacy, hospital, police, …). */
  buildingCategory?: string;
  lairRef?: 'nearest' | 'discovered' | 'any';
  settlementRef?: 'primary' | 'nearest' | 'any';
  squadRef?: 'any' | 'first';
  resourceType?: string;
}

export interface MissionTaskDefinition {
  id: string;
  type: MissionTaskType;
  title: string;
  description?: string;
  target?: TargetRefSpec;
  /** Threshold amount (kills, population, items…). */
  targetCount?: number;
  /** Stockpile resource key for manufacture/maintain/scavenge_resource. */
  resourceType?: string;
  /** Building type id for build/adapt tasks (functionalBuildings key). */
  buildingType?: string;
  /** Research node id for research_technology tasks. */
  researchId?: string;
  /** Explicit lair id (usually bound automatically instead). */
  lairId?: string;
  /** Target settlement id for deliver_resources / logistics tasks. */
  destinationSettlementId?: string;
  /** Origin settlement id for delivery tasks. */
  originSettlementId?: string;
  /** Specific faction id for contact_faction tasks. */
  factionId?: string;
  /** Optional FOCUS / LOCATE action surfaced in the quest tracker. */
  focusAction?: string;
  /** Task IDs that must be completed before this task becomes active. */
  dependsOn?: string[];
  /** 'action' requires doing the action after task start; 'state' allows existing conditions. */
  completionMode?: 'action' | 'state';
}

export interface MissionTaskState {
  id: string;
  type: MissionTaskType;
  title: string;
  description?: string;
  status: TaskStatus;
  current: number;
  target: number;
  /** Resolved real entity id (building/lair id) once the mission starts. */
  boundTargetId?: string | number;
  boundTargetLabel?: string;
  // Definition fields mirrored onto the runtime task so evaluation never needs
  // to re-read the definition (content may evolve between save and load).
  resourceType?: string;
  buildingType?: string;
  researchId?: string;
  lairId?: string;
  destinationSettlementId?: string;
  originSettlementId?: string;
  factionId?: string;
  boundCaravanId?: string;
  focusAction?: string;
  dependsOn?: string[];
  completionMode?: 'action' | 'state';
  /** Monotonic event journal id at task activation time. */
  startEventId?: number;
  /** Authoritative baseline metric (e.g. lifetime kills, inventory, game hours). */
  startProgressBaseline?: number;
  /** Internal evaluation state for day/night survival. */
  nightWitnessed?: boolean;
}

/** Persistent faction-relations shift applied when an option is chosen or a mission completes. */
export interface FactionEffect {
  /** Faction id registered in src/data/factions.ts. */
  factionId: string;
  /** Signed standing change (-100..100), clamped against faction bounds. */
  delta: number;
}

export interface MissionResponseOption {
  label: string;
  action: 'accept' | 'decline' | 'branch';
  /** Branch target: mission created when this option is chosen. */
  missionId?: string;
  /** Narrative flag written when the player chooses this option. */
  flag?: { key: string; value: string | number | boolean };
  /** Persistent faction-relations shifts applied when this option is chosen. */
  factionEffects?: FactionEffect[];
  responseNote?: string;
  followUpTransmissionId?: string;
  /** Explicitly marks contact established with this faction when selected. */
  contactFactionId?: string;
}

export interface MissionRewardDefinition {
  /** Stockpile resource grants — keys are the flat resource map used by the stockpile. */
  resources?: Record<string, number>;
  /** Extra ammo by ammo type (e.g. pistol, rifle). */
  ammo?: Record<string, number>;
  /** Extra medical supplies (e.g. first_aid, antibiotics). */
  medical?: Record<string, number>;
  /** Narrative flags set on completion. */
  narrativeFlags?: Record<string, string | number | boolean>;
  /** Persistent faction-relations shifts granted on completion. */
  factionEffects?: FactionEffect[];
  /** Human-readable reward summary shown in the tracker. */
  summary?: string;
}

/** Declarative condition evaluated against real game state. */
export type MissionCondition =
  | { kind: 'day'; min: number; max?: number }
  | { kind: 'survive_days'; min: number }
  | { kind: 'population'; min: number; max?: number }
  | { kind: 'research'; id: string }
  | { kind: 'hq_established'; value?: boolean }
  | { kind: 'squad_formed'; min?: number }
  | { kind: 'building'; buildingType: string; min?: number; adapted?: boolean }
  | { kind: 'lair_discovered'; min?: number }
  | { kind: 'lair_cleared'; min?: number }
  | { kind: 'flag'; key: string; value?: string | number | boolean }
  | { kind: 'settlement_count'; min?: number }
  | { kind: 'faction_contacted'; factionId?: string; min?: number }
  | { kind: 'caravan_arrived'; settlementId?: string }
  | { kind: 'resource'; resourceType: string; min?: number; max?: number }
  | { kind: 'faction_standing'; factionId: string; min?: number; max?: number }
  | { kind: 'mission_completed'; missionId: string }
  | { kind: 'mission_failed'; missionId: string }
  | { kind: 'mission_declined'; missionId: string }
  | { kind: 'mission_active'; missionId: string }
  | { kind: 'survive_night' };

/** Trigger tree: condition / event leaves, AND/OR/NOT combinators. */
export interface MissionTriggerDefinition {
  type: 'condition' | 'event' | 'and' | 'or' | 'not';
  condition?: MissionCondition;
  /** GameEventType id — see types/narrativeEvent.ts. */
  event?: string;
  children?: MissionTriggerDefinition[];
}

export interface MissionDefinition {
  id: string;
  code: string;
  title: string;
  description: string;
  /** Long-form briefing shown in the tracker after acceptance. */
  briefing?: string;
  category: MissionCategory;
  priority: MissionPriority;
  chapter?: number;
  isMainStory?: boolean;
  trigger: MissionTriggerDefinition;
  /** Transmission id that briefs this mission (TRIGGER → TRANSMISSION → RESPONSE → MISSION). */
  briefingTransmissionId: string;
  responseOptions: MissionResponseOption[];
  tasks: MissionTaskDefinition[];
  rewards?: MissionRewardDefinition;
  failureConditions?: MissionCondition[];
  completionTransmissionId?: string;
  failureTransmissionId?: string;
  prerequisites?: MissionCondition[];
  /** Authoritative mission progression: all must be completed for this mission to trigger. */
  requiresMissionsCompleted?: string[];
  mutuallyExclusiveWith?: string[];
  repeatable?: boolean;
  repeatCooldownDays?: number;
  /** Game-hours deadline; expires the mission if exceeded. */
  timeLimitHours?: number;
  /** World-aware hint text (e.g. "hospital ~700m east of the settlement"). */
  targetHint?: string;
}

export interface MissionRuntimeState {
  id: string;
  definitionId: string;
  status: MissionStatus;
  startedDay: number;
  /** Total game hours elapsed at start (day*24+hour) — basis for time limits. */
  startedGameHours: number;
  tasks: MissionTaskState[];
  completionTransmissionSent: boolean;
  failureTransmissionSent: boolean;
}

/** Snapshot of the world used to derive game events via diffing (dedupe-safe). */
export interface MissionLastSeenSnapshot {
  day: number;
  population: number;
  hqEstablished: boolean;
  squadCount: number;
  searchedCount: number;
  adaptedCount: number;
  constructedCount: number;
  discoveredHiddenGroups: number;
  recruitedHiddenGroups: number;
  unlockedResearchCount: number;
  lairStates: Record<string, { discovered: boolean; cleared: boolean; population: number }>;
  factionContacted: boolean;
  caravanArrivals: number;
  timeHours: number;
}

export interface MissionState {
  activeMissions: MissionRuntimeState[];
  /** Briefing sent but player hasn't responded yet. */
  pendingMissions: MissionRuntimeState[];
  completedMissionIds: string[];
  failedMissionIds: string[];
  declinedMissionIds: string[];
  expiredMissionIds: string[];
  /** Dedupe: `${eventType}|${missionId}` for event-triggered missions. */
  triggeredEventIds: string[];
  startedMissionIds: string[];
  /** Transmission ids already consumed by response handling. */
  processedTransmissionIds: string[];
  /** repeatable mission id → day number when it may trigger again. */
  repeatableCooldowns: Record<string, number>;
  narrativeFlags: Record<string, string | number | boolean>;
  /** Persistent faction standings: faction id → -100..100 (see data/factions.ts). */
  factionRelations: Record<string, number>;
  /** Faction IDs with which real contact has been established. */
  contactedFactionIds?: string[];
  /** Journal event cursor: id of the latest domain event processed by the mission engine. */
  lastProcessedEventId?: number;
  lastSeen: MissionLastSeenSnapshot | null;
}