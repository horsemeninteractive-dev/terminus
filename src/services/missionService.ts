/**
 * Mission engine — the Terminus campaign framework.
 *
 * Core flow (spec §1): TRIGGER → TRANSMISSION → PLAYER RESPONSE → MISSION
 * CREATED → TASKS → OUTCOME → FOLLOW-UP TRANSMISSION.
 *
 * Invariants enforced here:
 *  - Triggers NEVER create missions directly. They queue a briefing
 *    transmission; the mission is only created when the player responds.
 *  - Task progress is DERIVED from authoritative game state every tick
 *    (buildings, lairs, research, stockpile, squads, population, caravans) —
 *    never from fake quest-only counters.
 *  - Dedupe is persistent: triggeredEventIds / startedMissionIds /
 *    processedTransmissionIds survive save/load, so a simulation tick or an
 *    offline catch-up can never double-fire content.
 *  - Event triggers use a world-snapshot diff (lastSeen) so systems that
 *    don't emit events still drive narrative, exactly once.
 */
import {
  MissionCondition,
  MissionDefinition,
  MissionLastSeenSnapshot,
  MissionResponseOption,
  MissionRuntimeState,
  MissionState,
  MissionTaskDefinition,
  MissionTaskState,
  MissionTriggerDefinition,
  TargetRefSpec,
  TaskStatus,
} from '../types/mission';
import { GameEventRecord, GameEventType } from '../types/narrativeEvent';
import {
  RadioResponseOption,
  RadioTransmission,
  TransmissionDefinition,
} from '../types/radioDirective';
import { SettlementState } from '../types/settlement';
import { GameClockState } from '../types/combat';
import { MapData, BuildingPolygon } from '../types/map';
import { TradeCaravan } from '../types/caravan';
import { FactionEffect } from '../types/mission';
import {
  clampFactionStanding,
  factionCutoffFlag,
  getFactionDefaultStanding,
  getFactionDefinition,
  FACTION_DEFINITIONS,
} from '../data/factions';
import { getPrimaryHQ } from './buildingOperational';
import { buildTransmission, enqueueTransmission } from './transmissionService';
import { getLatestEventId, readGameEventsSince, emitGameEvent } from './eventBus';
import { isSquadInsideBuilding } from './scavengingService';

export interface MissionContext {
  mapData?: MapData;
  caravans?: TradeCaravan[];
  /** All known settlements (for multi-settlement content). */
  settlements?: Array<{ id: string; name: string }>;
}

const MISSION_DEFINITIONS: MissionDefinition[] = [];
export function registerMissionDefinitions(defs: MissionDefinition[]): void {
  MISSION_DEFINITIONS.push(...defs);
}
export function getRegisteredMissionDefinitions(): MissionDefinition[] {
  return [...MISSION_DEFINITIONS];
}

const TRANSMISSION_DEFINITIONS: TransmissionDefinition[] = [];
export function registerTransmissionDefinitions(defs: TransmissionDefinition[]): void {
  TRANSMISSION_DEFINITIONS.push(...defs);
}
export function getRegisteredTransmissionDefinitions(): TransmissionDefinition[] {
  return [...TRANSMISSION_DEFINITIONS];
}
export function findTransmissionDefinition(id: string): TransmissionDefinition | undefined {
  return TRANSMISSION_DEFINITIONS.find((d) => d.id === id);
}
export function findMissionDefinition(id: string): MissionDefinition | undefined {
  return MISSION_DEFINITIONS.find((d) => d.id === id);
}

/** Authoritative population: named survivors + general population. */
export function getSettlementPopulation(s: SettlementState): number {
  return (s.generalPopulation?.total ?? 0) + (s.namedSurvivors?.length ?? 0);
}

function totalGameHours(clock: GameClockState): number {
  return (clock.day - 1) * 24 + clock.hour + (clock.minute || 0) / 60;
}

export function getInitialMissionState(): MissionState {
  const factionRelations: Record<string, number> = {};
  for (const f of FACTION_DEFINITIONS) factionRelations[f.id] = f.defaultStanding;
  return {
    activeMissions: [],
    pendingMissions: [],
    completedMissionIds: [],
    failedMissionIds: [],
    declinedMissionIds: [],
    expiredMissionIds: [],
    triggeredEventIds: [],
    startedMissionIds: [],
    processedTransmissionIds: [],
    repeatableCooldowns: {},
    narrativeFlags: {},
    factionRelations,
    contactedFactionIds: [],
    lastProcessedEventId: 0,
    lastSeen: null,
  };
}

// ---------------------------------------------------------------------------
// Faction standings
// ---------------------------------------------------------------------------

/** Standing of a faction, falling back to its registered default. */
export function factionStandingOf(relations: Record<string, number> | undefined, factionId: string): number {
  const v = relations?.[factionId];
  return v === undefined ? getFactionDefaultStanding(factionId) : v;
}

/**
 * Apply signed standing deltas for one or more factions.
 *
 * Cutoff behaviour: crossing AT/BELOW a faction's cutoffThreshold queues its
 * contactLostTransmissionId exactly once (guarded by the persistent narrative
 * flag `faction_relations_lost_<id>`); recovering above the threshold later
 * clears the flag and queues contactRestoredTransmissionId. This is what makes
 * a single refusal escalate into a permanently altered relationship.
 */
export function applyFactionEffects(
  relations: Record<string, number>,
  effects: FactionEffect[] | undefined,
  flags: Record<string, string | number | boolean>,
  ts: string
): {
  relations: Record<string, number>;
  flags: Record<string, string | number | boolean>;
  transmissions: RadioTransmission[];
} {
  let nextRelations = { ...relations };
  let nextFlags = { ...flags };
  const transmissions: RadioTransmission[] = [];
  if (!effects || effects.length === 0) return { relations: nextRelations, flags: nextFlags, transmissions };

  for (const effect of effects) {
    const def = getFactionDefinition(effect.factionId);
    const oldStanding = factionStandingOf(nextRelations, effect.factionId);
    const newStanding = clampFactionStanding(oldStanding + effect.delta);
    nextRelations = { ...nextRelations, [effect.factionId]: newStanding };

    const cutoff = def?.cutoffThreshold;
    if (def && cutoff !== undefined) {
      const marker = factionCutoffFlag(def.id);
      const wasCut = Boolean(nextFlags[marker]);
      const nowCut = newStanding <= cutoff;
      if (!wasCut && nowCut) {
        nextFlags = { ...nextFlags, [marker]: true };
        const lostTx = buildFollowUp(def.contactLostTransmissionId, ts);
        if (lostTx) transmissions.push(lostTx);
      } else if (wasCut && !nowCut) {
        nextFlags = { ...nextFlags, [marker]: false };
        const restoredTx = buildFollowUp(def.contactRestoredTransmissionId, ts);
        if (restoredTx) transmissions.push(restoredTx);
      }
    }
  }
  return { relations: nextRelations, flags: nextFlags, transmissions };
}

// ---------------------------------------------------------------------------
// World snapshot + derived events
// ---------------------------------------------------------------------------

function hiddenGroupsList(settlement: SettlementState): any[] {
  const hg = settlement.hiddenGroups;
  if (hg instanceof Map) return Array.from(hg.values());
  if (hg && typeof hg === 'object') return Object.values(hg);
  return [];
}

function lairStatesOf(settlement: SettlementState): Record<string, { discovered: boolean; cleared: boolean; population: number }> {
  const lairs = settlement.zombieLairs;
  const out: Record<string, { discovered: boolean; cleared: boolean; population: number }> = {};
  if (lairs instanceof Map) {
    for (const [, l] of lairs) {
      out[String(l.id)] = { discovered: Boolean(l.isDiscovered), cleared: Boolean(l.isCleared), population: l.population || 0 };
    }
  } else if (lairs && typeof lairs === 'object') {
    for (const k of Object.keys(lairs)) {
      const l = (lairs as any)[k];
      out[String(l?.id ?? k)] = { discovered: Boolean(l?.isDiscovered), cleared: Boolean(l?.isCleared), population: l?.population || 0 };
    }
  }
  return out;
}

function countSearched(settlement: SettlementState): number {
  const bs = settlement.buildingSearches;
  if (bs instanceof Map) return Array.from(bs.values()).filter((b: any) => b && b.searched).length;
  if (bs && typeof bs === 'object') return Object.values(bs).filter((b: any) => b && b.searched).length;
  return 0;
}

function buildSnapshot(settlement: SettlementState, clock: GameClockState, ctx: MissionContext): MissionLastSeenSnapshot {
  const hidden = hiddenGroupsList(settlement);
  const caravanArrivals = (ctx.caravans || []).filter((c) => c.status === 'arrived').length;
  return {
    day: clock.day,
    population: getSettlementPopulation(settlement),
    hqEstablished: Boolean(getPrimaryHQ(settlement)),
    squadCount: settlement.squads?.length || 0,
    searchedCount: countSearched(settlement),
    adaptedCount: settlement.adaptedBuildings ? settlement.adaptedBuildings.size : 0,
    constructedCount: settlement.freestandingBuildings?.length || 0,
    discoveredHiddenGroups: hidden.filter((g) => g.isDiscovered || g.isRecruited).length,
    recruitedHiddenGroups: hidden.filter((g) => g.isRecruited).length,
    unlockedResearchCount: settlement.research?.unlockedNodes?.length || 0,
    lairStates: lairStatesOf(settlement),
    factionContacted: (ctx.settlements?.length || 0) >= 2,
    caravanArrivals,
    timeHours: totalGameHours(clock),
  };
}

/** Diff two snapshots into a set of derived game events. */
function deriveEvents(
  prev: MissionLastSeenSnapshot,
  next: MissionLastSeenSnapshot
): GameEventType[] {
  const events: GameEventType[] = [];
  if (!prev.hqEstablished && next.hqEstablished) events.push('HQ_ESTABLISHED');
  if (prev.squadCount === 0 && next.squadCount > 0) events.push('SQUAD_FORMED');
  if (next.adaptedCount > prev.adaptedCount) events.push('BUILDING_ADAPTED');
  if (next.constructedCount > prev.constructedCount) events.push('BUILDING_CONSTRUCTED');
  if (next.searchedCount > prev.searchedCount) events.push('BUILDING_SCAVENGED');
  if (next.discoveredHiddenGroups > prev.discoveredHiddenGroups) events.push('SURVIVOR_RECRUITED');
  if (next.recruitedHiddenGroups > prev.recruitedHiddenGroups) events.push('SURVIVOR_RECRUITED');
  if (next.unlockedResearchCount > prev.unlockedResearchCount) events.push('RESEARCH_COMPLETED');
  if (next.population !== prev.population) events.push('POPULATION_CHANGED');
  if (next.day !== prev.day) events.push('DAY_STARTED');
  if (!prev.factionContacted && next.factionContacted) events.push('FACTION_CONTACTED');
  if (next.caravanArrivals > prev.caravanArrivals) events.push('CARAVAN_ARRIVED');
  for (const id of Object.keys(next.lairStates)) {
    const p = prev.lairStates[id];
    const n = next.lairStates[id];
    if (n) {
      if (!p) {
        if (n.discovered) events.push('LAIR_DISCOVERED');
      } else {
        if (!p.discovered && n.discovered) events.push('LAIR_DISCOVERED');
        if (!p.cleared && n.cleared) events.push('LAIR_CLEARED');
        if (p.population > 0 && n.population <= 0) events.push('LAIR_CLEARED');
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Condition + trigger evaluation
// ---------------------------------------------------------------------------

export function evaluateMissionCondition(
  cond: MissionCondition,
  settlement: SettlementState,
  clock: GameClockState,
  ctx: MissionContext,
  flags: Record<string, string | number | boolean>,
  relations: Record<string, number> = {},
  state?: MissionState
): boolean {
  switch (cond.kind) {
    case 'day':
      return clock.day >= cond.min && (cond.max === undefined || clock.day <= cond.max);
    case 'survive_days':
      return clock.day > cond.min || (clock.day === cond.min && clock.hour >= 6);
    case 'survive_night':
      return clock.day > 1 || (clock.day === 1 && clock.hour >= 6 && clock.phase === 'day');
    case 'population': {
      const pop = getSettlementPopulation(settlement);
      return pop >= cond.min && (cond.max === undefined || pop <= cond.max);
    }
    case 'research':
      return (settlement.research?.unlockedNodes || []).includes(cond.id);
    case 'hq_established':
      return Boolean(getPrimaryHQ(settlement)) === (cond.value !== false);
    case 'squad_formed':
      return (settlement.squads?.length || 0) >= (cond.min || 1);
    case 'building': {
      if (cond.adapted) {
        const adapted = settlement.adaptedBuildings;
        const count = adapted instanceof Map
          ? Array.from(adapted.values()).filter((b: any) => b && b.type === cond.buildingType).length
          : 0;
        return count >= (cond.min || 1);
      }
      const constructed = (settlement.freestandingBuildings || []).filter(
        (b: any) => b && b.type === cond.buildingType
      ).length;
      return constructed >= (cond.min || 1);
    }
    case 'lair_discovered': {
      const states = Object.values(lairStatesOf(settlement));
      return states.filter((s) => s.discovered).length >= (cond.min || 1);
    }
    case 'lair_cleared': {
      const states = Object.values(lairStatesOf(settlement));
      return states.filter((s) => s.cleared).length >= (cond.min || 1);
    }
    case 'flag':
      if (!(cond.key in flags)) return false;
      if (cond.value === undefined) return Boolean(flags[cond.key]);
      return flags[cond.key] === cond.value;
    case 'settlement_count':
      return (ctx.settlements?.length || 1) >= (cond.min || 2);
    case 'faction_contacted': {
      if (cond.factionId) {
        return Boolean(state?.contactedFactionIds?.includes(cond.factionId));
      }
      return (state?.contactedFactionIds?.length || 0) >= (cond.min || 1);
    }
    case 'caravan_arrived': {
      const arrivals = (ctx.caravans || []).filter(
        (c) => c.status === 'arrived' && (!cond.settlementId || c.destinationSettlementId === cond.settlementId)
      );
      return arrivals.length >= 1;
    }
    case 'resource': {
      const have = readResource(settlement, cond.resourceType);
      const aboveMin = cond.min === undefined || have >= cond.min;
      const belowMax = cond.max === undefined || have <= cond.max;
      return aboveMin && belowMax;
    }
    case 'faction_standing': {
      const standing = factionStandingOf(relations, cond.factionId);
      const aboveMin = cond.min === undefined || standing >= cond.min;
      const belowMax = cond.max === undefined || standing <= cond.max;
      return aboveMin && belowMax;
    }
    case 'mission_completed':
      return Boolean(state?.completedMissionIds?.includes(cond.missionId));
    case 'mission_failed':
      return Boolean(state?.failedMissionIds?.includes(cond.missionId));
    case 'mission_declined':
      return Boolean(state?.declinedMissionIds?.includes(cond.missionId));
    case 'mission_active':
      return Boolean(state?.activeMissions?.some((m) => m.definitionId === cond.missionId));
    default:
      return false;
  }
}

export function evaluateMissionTrigger(
  trigger: MissionTriggerDefinition,
  settlement: SettlementState,
  clock: GameClockState,
  ctx: MissionContext,
  flags: Record<string, string | number | boolean>,
  events: Set<string>,
  relations: Record<string, number> = {},
  state?: MissionState
): boolean {
  switch (trigger.type) {
    case 'condition':
      return trigger.condition
        ? evaluateMissionCondition(trigger.condition, settlement, clock, ctx, flags, relations, state)
        : false;
    case 'event':
      return trigger.event ? events.has(trigger.event) : false;
    case 'and':
      return (trigger.children || []).every((c) =>
        evaluateMissionTrigger(c, settlement, clock, ctx, flags, events, relations, state)
      );
    case 'or':
      return (trigger.children || []).some((c) =>
        evaluateMissionTrigger(c, settlement, clock, ctx, flags, events, relations, state)
      );
    case 'not':
      return !(trigger.children || []).every((c) =>
        evaluateMissionTrigger(c, settlement, clock, ctx, flags, events, relations, state)
      );
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Resource reads / reward application
// ---------------------------------------------------------------------------

/** Read a flat resource key from the stockpile (materials, food, ammo, …). */
export function readResource(settlement: SettlementState, key: string): number {
  const s = settlement.stockpile;
  if (!s) return 0;
  const sections = [s.materials, s.food, s.medical, s.fuel, s.ammo, s.water] as any[];
  for (const sec of sections) {
    if (sec && typeof sec === 'object' && key in sec) {
      return Number(sec[key]) || 0;
    }
  }
  return 0;
}

function addToSection(section: any, key: string, amount: number): any {
  return { ...section, [key]: ((section?.[key] as number) || 0) + amount };
}

export function applyMissionRewards(settlement: SettlementState, resources: Record<string, number>): SettlementState {
  if (!resources || Object.keys(resources).length === 0) return settlement;
  const stockpile = settlement.stockpile;
  const flat = { ...resources };
  const RESOURCE_SECTIONS = {
    materials: ['wood', 'metal', 'bricks', 'tools', 'fertilizer', 'beer', 'scientific_materials', 'clay', 'logs', 'scrap'],
    food: ['canned_goods', 'mre_rations', 'dried_rations', 'fresh_harvest', 'grain', 'raw_meat'],
    medical: ['first_aid_kits', 'sterile_bandages', 'antibiotics', 'painkillers'],
    fuel: ['gasoline', 'diesel', 'biofuel'],
    water: ['bottled_water', 'purified_water', 'rainwater'],
    ammo: ['sharedPool', 'crates'],
  } as const;
  let nextStockpile = stockpile;
  for (const [sectionName, keys] of Object.entries(RESOURCE_SECTIONS)) {
    const sectionKey = sectionName as keyof typeof nextStockpile;
    const section = nextStockpile[sectionKey] as any;
    let mutated = false;
    let nextSection = section;
    for (const key of keys) {
      if (key in flat && flat[key] !== 0) {
        nextSection = addToSection(nextSection, key, flat[key]);
        mutated = true;
        delete flat[key];
      }
    }
    if (mutated) {
      nextStockpile = { ...nextStockpile, [sectionKey]: nextSection } as typeof nextStockpile;
    }
  }
  // Any unrecognised keys fall back to materials for forward-compat.
  if (Object.keys(flat).length > 0) {
    nextStockpile = {
      ...nextStockpile,
      materials: addToSection(nextStockpile.materials, Object.keys(flat)[0], (flat as any)[Object.keys(flat)[0]]),
    };
  }
  return { ...settlement, stockpile: nextStockpile };
}

// ---------------------------------------------------------------------------
// Target binding
// ---------------------------------------------------------------------------

export function resolveBuildingTarget(
  mapData: MapData | undefined,
  category: string | undefined,
  settlement?: SettlementState,
  usedTargetIds?: Set<string | number>
): BuildingPolygon | undefined {
  if (!mapData || !category) return undefined;
  const cat = category.toLowerCase().trim();

  // Primary HQ location for distance sorting
  const hq = settlement ? getPrimaryHQ(settlement) : null;
  const hqCenter = hq?.center || (mapData.center ? { x: 0, z: 0 } : undefined);

  // Set of destroyed building IDs
  const destroyedIds = new Set<string | number>();
  if (settlement?.demolishedBuildings) {
    for (const id of settlement.demolishedBuildings.keys()) {
      destroyedIds.add(id);
    }
  }
  const rawDestroyed = (settlement as any)?.destroyedBuildings;
  if (rawDestroyed) {
    if (rawDestroyed instanceof Set || rawDestroyed instanceof Map) {
      rawDestroyed.forEach((_: any, id: any) => destroyedIds.add(id));
    } else if (Array.isArray(rawDestroyed)) {
      rawDestroyed.forEach((id: any) => destroyedIds.add(id));
    }
  }

  // Filter candidates
  const candidates = (mapData.buildings || []).filter((b) => {
    if (!b) return false;
    if (destroyedIds.has(b.id)) return false;
    if (usedTargetIds && usedTargetIds.has(b.id)) return false;

    // Check canonical BuildingCategory
    const bType = String(b.type || '').toLowerCase();
    if (bType === cat) return true;

    // Check specific authoritative semantic tags
    const tags = b.tags || {};
    const amenity = String(tags.amenity || '').toLowerCase();
    const healthcare = String(tags.healthcare || '').toLowerCase();
    const shop = String(tags.shop || '').toLowerCase();
    const buildingTag = String(tags.building || '').toLowerCase();
    const office = String(tags.office || '').toLowerCase();

    if (cat === 'hospital') {
      return (
        bType === 'hospital' ||
        amenity === 'hospital' ||
        amenity === 'clinic' ||
        healthcare === 'hospital' ||
        healthcare === 'clinic'
      );
    }
    if (cat === 'pharmacy') {
      return (
        bType === 'pharmacy' ||
        amenity === 'pharmacy' ||
        healthcare === 'pharmacy' ||
        shop === 'chemist' ||
        shop === 'pharmacy'
      );
    }
    if (cat === 'police') {
      return bType === 'police' || amenity === 'police' || office === 'police';
    }
    if (cat === 'warehouse' || cat === 'industrial') {
      return (
        bType === 'warehouse' ||
        bType === 'industrial' ||
        buildingTag === 'warehouse' ||
        buildingTag === 'industrial' ||
        tags.industrial !== undefined
      );
    }
    if (cat === 'supermarket' || cat === 'commercial') {
      return (
        bType === 'supermarket' ||
        bType === 'commercial' ||
        shop === 'supermarket' ||
        shop === 'convenience' ||
        shop === 'grocery'
      );
    }
    if (cat === 'school') {
      return bType === 'school' || amenity === 'school' || amenity === 'college' || amenity === 'university';
    }
    if (cat === 'gas_station') {
      return bType === 'gas_station' || amenity === 'fuel';
    }

    // Exact rawType match
    const raw = String(b.rawType || '').toLowerCase();
    if (raw === cat || raw === `amenity=${cat}` || raw === `shop=${cat}` || raw === `building=${cat}`) {
      return true;
    }

    return false;
  });

  if (candidates.length === 0) return undefined;

  // Sort by proximity to HQ/settlement center if position available
  if (hqCenter) {
    candidates.sort((a, b) => {
      const distA = Math.hypot((a.center?.x ?? 0) - hqCenter.x, (a.center?.z ?? 0) - hqCenter.z);
      const distB = Math.hypot((b.center?.x ?? 0) - hqCenter.x, (b.center?.z ?? 0) - hqCenter.z);
      return distA - distB;
    });
  }

  return candidates[0];
}

export function findBuildingByCategory(mapData: MapData | undefined, category: string | undefined): BuildingPolygon | undefined {
  return resolveBuildingTarget(mapData, category);
}

function resolveLairTarget(settlement: SettlementState, spec: TargetRefSpec | undefined): { id: string | number; label: string } | null {
  const lairs = lairStatesOf(settlement);
  const ids = Object.keys(lairs);
  if (ids.length === 0) return null;
  const discovered = ids.filter((id) => lairs[id].discovered);
  const pool = spec?.lairRef === 'any' ? ids : discovered.length > 0 ? discovered : ids;
  const id = pool[0];
  const lair = (settlement.zombieLairs instanceof Map
    ? settlement.zombieLairs.get(id)
    : (settlement.zombieLairs as any)?.[id]) as any;
  return { id, label: lair?.buildingName || `LAIR ${id}` };
}

/** Bind a mission's tasks to real world entities at activation time. */
export function bindMissionTasks(
  def: MissionDefinition,
  settlement: SettlementState,
  ctx: MissionContext,
  activeMissions: MissionRuntimeState[] = []
): MissionTaskState[] {
  const usedTargetIds = new Set<string | number>();
  for (const m of activeMissions) {
    for (const t of m.tasks) {
      if (t.boundTargetId !== undefined) {
        usedTargetIds.add(t.boundTargetId);
      }
    }
  }

  const missionBoundBuildings = new Map<string, { id: string | number; label: string }>();

  return def.tasks.map((t: MissionTaskDefinition) => {
    const target = t.targetCount || 1;
    let boundTargetId: string | number | undefined;
    let boundTargetLabel: string | undefined;
    if (t.target?.type === 'building' && t.target.buildingCategory) {
      const cat = t.target.buildingCategory;
      if (missionBoundBuildings.has(cat)) {
        const cached = missionBoundBuildings.get(cat)!;
        boundTargetId = cached.id;
        boundTargetLabel = cached.label;
      } else {
        const b = resolveBuildingTarget(ctx.mapData, cat, settlement, usedTargetIds);
        if (b) {
          boundTargetId = b.id;
          boundTargetLabel = b.name || `${cat.toUpperCase()} ${b.id}`;
          missionBoundBuildings.set(cat, { id: b.id, label: boundTargetLabel });
          usedTargetIds.add(b.id);
        }
      }
    } else if (t.target?.type === 'lair' || t.type === 'clear_lair' || t.type === 'eliminate_infected') {
      const lair = resolveLairTarget(settlement, t.target);
      if (lair) {
        boundTargetId = lair.id;
        boundTargetLabel = lair.label;
      }
    }
    const isLocked = Boolean(t.dependsOn && t.dependsOn.length > 0);
    return {
      id: t.id,
      type: t.type,
      title: t.title,
      description: t.description,
      status: (isLocked ? 'pending' : 'active') as TaskStatus,
      current: 0,
      target,
      boundTargetId,
      boundTargetLabel,
      resourceType: t.resourceType,
      buildingType: t.buildingType,
      researchId: t.researchId,
      lairId: t.lairId,
      destinationSettlementId: t.destinationSettlementId,
      originSettlementId: t.originSettlementId,
      factionId: t.factionId,
      focusAction: t.focusAction,
      dependsOn: t.dependsOn,
      completionMode: t.completionMode,
    };
  });
}

// ---------------------------------------------------------------------------
// Task evaluation (authoritative state reads + domain events)
// ---------------------------------------------------------------------------

export interface TaskEvaluation {
  current: number;
  complete: boolean;
}

export function evaluateTask(
  task: MissionTaskState,
  settlement: SettlementState,
  clock: GameClockState,
  ctx: MissionContext = {},
  eventsSinceStart: GameEventRecord[] = [],
  state?: MissionState
): TaskEvaluation {
  const s = settlement;
  const events = (eventsSinceStart && eventsSinceStart.length > 0)
    ? eventsSinceStart
    : readGameEventsSince(task.startEventId ?? 0);

  switch (task.type) {
    case 'establish_hq':
      return { current: getPrimaryHQ(s) ? 1 : 0, complete: Boolean(getPrimaryHQ(s)) };
    case 'form_squad':
      return { current: Math.min(task.target, s.squads?.length || 0), complete: (s.squads?.length || 0) >= task.target };
    case 'recruit_survivors': {
      // Count survivors actually recruited AFTER task activation (never discovery).
      const eventRecruits = events
        .filter((e) => e.type === 'SURVIVOR_RECRUITED')
        .reduce((acc, e) => acc + (Number((e.payload as any)?.count) || 1), 0);
      const baseline = task.startProgressBaseline ?? 0;
      const totalRecruits = s.lifetimeStats?.survivorsRecruited ?? 0;
      const snapshotDelta = Math.max(0, totalRecruits - baseline);
      const total = Math.max(task.current || 0, eventRecruits, snapshotDelta);
      return { current: Math.min(task.target, total), complete: total >= task.target };
    }
    case 'rescue_survivors': {
      // Count survivors actually rescued AFTER task activation.
      const eventRescues = events
        .filter((e) => e.type === 'SURVIVOR_RESCUED' || e.type === 'SURVIVOR_RECRUITED')
        .reduce((acc, e) => acc + (Number((e.payload as any)?.count) || 1), 0);
      const total = Math.max(task.current || 0, eventRescues);
      return { current: Math.min(task.target, total), complete: total >= task.target };
    }
    case 'scavenge_building': {
      if (task.boundTargetId !== undefined) {
        const bs = s.buildingSearches;
        const rec = bs instanceof Map
          ? bs.get(task.boundTargetId)
          : (bs as any)?.[task.boundTargetId];
        const done = Boolean(rec && rec.searched) ||
          events.some((e) => e.type === 'BUILDING_SCAVENGED' && String((e.payload as any)?.buildingId) === String(task.boundTargetId));
        return { current: done ? 1 : 0, complete: done };
      }
      const scavengedEvents = events.filter((e) => e.type === 'BUILDING_SCAVENGED').length;
      const searched = countSearched(s);
      const baseline = task.startProgressBaseline ?? 0;
      const delta = Math.max(0, searched - baseline);
      const count = Math.max(task.current || 0, scavengedEvents, delta);
      return { current: Math.min(task.target, count), complete: count >= task.target };
    }
    case 'travel_to_location': {
      if (task.boundTargetId !== undefined) {
        const reachedEvent = events.some(
          (e) => e.type === 'LOCATION_REACHED' && (String((e.payload as any)?.buildingId) === String(task.boundTargetId) || String((e.payload as any)?.locationId) === String(task.boundTargetId))
        );
        let inside = false;
        if (!reachedEvent && ctx.mapData && s.squads) {
          const targetBldg = ctx.mapData.buildings.find((b) => String(b.id) === String(task.boundTargetId));
          if (targetBldg) {
            inside = s.squads.some((sq: any) => sq.isDeployed && sq.currentHp > 0 && isSquadInsideBuilding({ x: sq.x, z: sq.z }, targetBldg));
          }
        }
        const done = reachedEvent || inside || (task.current >= 1);
        return { current: done ? 1 : 0, complete: done };
      }
      const reachedEvents = events.filter((e) => e.type === 'LOCATION_REACHED').length;
      const count = Math.max(task.current || 0, reachedEvents);
      return { current: Math.min(task.target, count), complete: count >= task.target };
    }
    case 'discover_location': {
      if (task.boundTargetId !== undefined) {
        const discoveredEvent = events.some(
          (e) => e.type === 'LOCATION_DISCOVERED' && String((e.payload as any)?.locationId ?? (e.payload as any)?.buildingId) === String(task.boundTargetId)
        );
        const done = discoveredEvent || (task.current >= 1);
        return { current: done ? 1 : 0, complete: done };
      }
      const discoveredEvents = events.filter((e) => e.type === 'LOCATION_DISCOVERED').length;
      const count = Math.max(task.current || 0, discoveredEvents);
      return { current: Math.min(task.target, count), complete: count >= task.target };
    }
    case 'scavenge_resource': {
      // Must track resources scavenged AFTER task activation.
      const scavengedFromEvents = events
        .filter((e) =>
          (e.type === 'RESOURCE_ACQUIRED' && (e.payload as any)?.source === 'scavenge' && (e.payload as any)?.resourceType === task.resourceType) ||
          (e.type === 'BUILDING_SCAVENGED' && (e.payload as any)?.loot && (e.payload as any)?.loot[task.resourceType || ''])
        )
        .reduce((acc, e) => {
          if (e.type === 'RESOURCE_ACQUIRED') return acc + (Number((e.payload as any)?.amount) || 0);
          if (e.type === 'BUILDING_SCAVENGED') return acc + (Number((e.payload as any)?.loot?.[task.resourceType || '']) || 0);
          return acc;
        }, 0);
      const have = readResource(s, task.resourceType || '');
      const baseline = task.startProgressBaseline ?? 0;
      const delta = Math.max(0, have - baseline);
      const count = Math.max(task.current || 0, scavengedFromEvents, delta);
      return { current: Math.min(task.target, count), complete: count >= task.target };
    }
    case 'maintain_resource': {
      const have = readResource(s, task.resourceType || '');
      return { current: Math.min(task.target, have), complete: have >= task.target };
    }
    case 'manufacture_item': {
      // Must track items MANUFACTURED after task activation — NEVER current
      // possession, and never stock merely gained by scavenging/trade/rewards.
      // Authoritative source: the cumulative production tally
      // (settlement.lifetimeStats.itemsProduced), which only grows when a
      // facility line actually delivers output. It is consumption-proof and
      // save/load-proof (persisted on the settlement, not an in-memory
      // journal), so progress is the tally delta since the task's baseline.
      // Domain events remain a secondary signal for content that emits them.
      const eventTotal = events
        .filter((e) =>
          e.type === 'ITEM_MANUFACTURED' &&
          ((e.payload as any)?.resourceType === task.resourceType || (e.payload as any)?.itemId === task.resourceType)
        )
        .reduce((acc, e) => acc + (Number((e.payload as any)?.amount ?? (e.payload as any)?.quantity) || 1), 0);
      const produced = s.lifetimeStats?.itemsProduced?.[task.resourceType || ''] ?? 0;
      const baseline = task.startProgressBaseline ?? 0;
      const tallyDelta = Math.max(0, produced - baseline);
      const total = Math.max(task.current || 0, eventTotal, tallyDelta);
      // Floor for display so a continuous fractional line (3 tools/day) reads
      // as whole crates/tools; completion uses the raw accumulated amount.
      return {
        current: Math.min(task.target, Math.floor(total + 1e-6)),
        complete: total >= task.target,
      };
    }
    case 'build_facility': {
      if (task.completionMode === 'action') {
        const constructedEvents = events.filter(
          (e) => e.type === 'BUILDING_CONSTRUCTED' && (!task.buildingType || (e.payload as any)?.buildingType === task.buildingType)
        ).length;
        const currentCount = (s.freestandingBuildings || []).filter(
          (b: any) => b && (!task.buildingType || b.type === task.buildingType)
        ).length;
        const baseline = task.startProgressBaseline ?? 0;
        const delta = Math.max(0, currentCount - baseline);
        const count = Math.max(task.current || 0, constructedEvents, delta);
        return { current: Math.min(task.target, count), complete: count >= task.target };
      }
      const built = (s.freestandingBuildings || []).filter(
        (b: any) => b && (!task.buildingType || b.type === task.buildingType)
      ).length;
      return { current: Math.min(task.target, built), complete: built >= task.target };
    }
    case 'adapt_building': {
      if (task.completionMode === 'action') {
        const adaptedEvents = events.filter(
          (e) => e.type === 'BUILDING_ADAPTED' && (!task.buildingType || (e.payload as any)?.buildingType === task.buildingType)
        ).length;
        const currentCount = s.adaptedBuildings instanceof Map
          ? Array.from(s.adaptedBuildings.values()).filter((b: any) => b && (!task.buildingType || b.type === task.buildingType)).length
          : 0;
        const baseline = task.startProgressBaseline ?? 0;
        const delta = Math.max(0, currentCount - baseline);
        const count = Math.max(task.current || 0, adaptedEvents, delta);
        return { current: Math.min(task.target, count), complete: count >= task.target };
      }
      const adapted = s.adaptedBuildings instanceof Map
        ? Array.from(s.adaptedBuildings.values()).filter(
            (b: any) => b && (!task.buildingType || b.type === task.buildingType)
          ).length
        : 0;
      return { current: Math.min(task.target, adapted), complete: adapted >= task.target };
    }
    case 'research_technology': {
      if (task.completionMode === 'action') {
        const researchDone = events.some(
          (e) => e.type === 'RESEARCH_COMPLETED' && (!task.researchId || (e.payload as any)?.nodeId === task.researchId)
        );
        const isDone = researchDone || (task.current >= 1);
        return { current: isDone ? 1 : 0, complete: isDone };
      }
      const done = task.researchId
        ? (s.research?.unlockedNodes || []).includes(task.researchId)
        : (s.research?.unlockedNodes?.length || 0) > 0;
      return { current: done ? 1 : 0, complete: done };
    }
    case 'clear_lair': {
      const lairId = task.boundTargetId ?? task.lairId;
      if (lairId !== undefined && lairId !== null) {
        const lairs = s.zombieLairs;
        const lair = lairs instanceof Map ? lairs.get(lairId) : (lairs as any)?.[String(lairId)];
        const clearedEvent = events.some(
          (e) => e.type === 'LAIR_CLEARED' && String((e.payload as any)?.lairId) === String(lairId)
        );
        const done = Boolean(clearedEvent || (lair && (lair.isCleared || (lair.population || 0) <= 0)));
        return { current: done ? task.target : 0, complete: done };
      }
      const states = Object.values(lairStatesOf(s));
      const cleared = states.filter((st) => st.cleared).length;
      return { current: Math.min(task.target, cleared), complete: cleared >= task.target };
    }
    case 'eliminate_infected': {
      const startKills = task.startProgressBaseline ?? (task as any)._startInfectedKills ?? 0;
      const totalKills = s.lifetimeStats?.infectedKills ?? 0;
      const killed = Math.max(0, totalKills - startKills);
      return { current: Math.min(task.target, killed), complete: killed >= task.target };
    }
    case 'reach_population': {
      const pop = getSettlementPopulation(s);
      return { current: Math.min(task.target, pop), complete: pop >= task.target };
    }
    case 'survive_duration': {
      const start = task.startProgressBaseline ?? (task as any)._startGameHours ?? totalGameHours(clock);
      const elapsed = totalGameHours(clock) - start;
      const targetHours = task.target;
      return { current: Math.min(targetHours, Math.floor(elapsed)), complete: elapsed >= targetHours };
    }
    case 'survive_night': {
      let nightWitnessed = Boolean(task.nightWitnessed);
      if (clock.isNight || clock.phase === 'night') {
        nightWitnessed = true;
        task.nightWitnessed = true;
      }
      const dawnReached = nightWitnessed && !clock.isNight && (clock.phase === 'day' || clock.phase === 'dawn') && clock.hour >= 6;
      return { current: dawnReached ? 1 : (nightWitnessed ? 0.5 : 0), complete: dawnReached };
    }
    case 'deliver_resources': {
      // Verify destination, cargo, quantity, and arrival after activation
      const matchingArrivalEvents = events.filter((e) => {
        if (e.type !== 'CARAVAN_ARRIVED') return false;
        const p = e.payload as any;
        if (task.destinationSettlementId && p.destinationSettlementId !== task.destinationSettlementId) return false;
        if (task.originSettlementId && p.originSettlementId !== task.originSettlementId) return false;
        if (task.boundCaravanId && p.caravanId !== task.boundCaravanId) return false;
        if (task.resourceType && task.target) {
          const cargoAmount = Number(p.cargo?.[task.resourceType]) || 0;
          if (cargoAmount < task.target) return false;
        }
        return true;
      });

      const deliveredAmount = matchingArrivalEvents.reduce((acc, e) => {
        const p = e.payload as any;
        const cargoAmount = task.resourceType ? (Number(p.cargo?.[task.resourceType]) || 0) : 1;
        return acc + cargoAmount;
      }, 0);

      let fallbackAmount = 0;
      if (matchingArrivalEvents.length === 0 && ctx.caravans) {
        const startDay = (task as any)._startDay ?? 0;
        const matchingCaravans = ctx.caravans.filter((c) => {
          if (c.status !== 'arrived') return false;
          if (c.dispatchDay < startDay) return false;
          if (task.destinationSettlementId && c.destinationSettlementId !== task.destinationSettlementId) return false;
          if (task.originSettlementId && c.originSettlementId !== task.originSettlementId) return false;
          if (task.boundCaravanId && c.id !== task.boundCaravanId) return false;
          if (task.resourceType && task.target) {
            const cargo = (c.cargo as any)?.[task.resourceType] || (c.cargo?.materials as any)?.[task.resourceType] || (c.cargo?.food as any)?.[task.resourceType];
            if ((Number(cargo) || 0) < task.target) return false;
          }
          return true;
        });
        if (matchingCaravans.length > 0) {
          fallbackAmount = task.target;
        }
      }

      const total = Math.max(task.current || 0, deliveredAmount, fallbackAmount);
      return { current: Math.min(task.target, total), complete: total >= task.target };
    }
    case 'contact_faction': {
      const targetFactionId = task.factionId;
      const contactedEvent = events.some(
        (e) => e.type === 'FACTION_CONTACTED' && (!targetFactionId || (e.payload as any)?.factionId === targetFactionId)
      );
      const isContacted = contactedEvent || (targetFactionId
        ? Boolean(state?.contactedFactionIds?.includes(targetFactionId))
        : (state?.contactedFactionIds?.length || 0) > 0);
      return { current: isContacted ? 1 : 0, complete: isContacted };
    }
    case 'establish_settlement': {
      const count = ctx.settlements?.length || 1;
      return { current: Math.min(task.target, count), complete: count >= task.target };
    }
    case 'custom':
      return { current: task.current, complete: task.status === 'completed' };
    default:
      return { current: 0, complete: false };
  }
}

// ---------------------------------------------------------------------------
// Briefing / follow-up transmission construction
// ---------------------------------------------------------------------------

/**
 * Spec §32/§49: never issue a mission whose targets cannot exist. Building
 * category tasks require a real OSM candidate on the current map; if none
 * exists the mission is skipped this tick (it may bind later maps/settlements).
 */
function missionTargetsBindable(
  def: MissionDefinition,
  settlement: SettlementState,
  ctx: MissionContext,
  usedTargetIds?: Set<string | number>
): boolean {
  for (const task of def.tasks) {
    if (task.target?.type === 'building' && task.target.buildingCategory) {
      if (!resolveBuildingTarget(ctx.mapData, task.target.buildingCategory, settlement, usedTargetIds)) return false;
    }
    // clear_lair NEEDS a real nest to act on; eliminate_infected counts the
    // colony-wide kill tally, so it is always bindable.
    if (task.type === 'clear_lair' && !task.lairId) {
      if (!resolveLairTarget(settlement, task.target)) return false;
    }
  }
  return true;
}

function buildMissionBriefing(def: MissionDefinition, timestamp: string): RadioTransmission | null {
  const base = findTransmissionDefinition(def.briefingTransmissionId);
  if (!base) return null;
  const options: RadioResponseOption[] = def.responseOptions.map((opt) => ({
    label: opt.label,
    action: opt.action === 'branch' ? `branch:${opt.missionId}` : opt.action,
    responseNote: opt.responseNote,
  }));
  return buildTransmission(
    {
      ...base,
      missionId: def.id,
      responseOptions: options,
      requiresAcknowledgement: true,
    },
    timestamp
  );
}

function buildFollowUp(txId: string | undefined, timestamp: string): RadioTransmission | null {
  const def = txId ? findTransmissionDefinition(txId) : undefined;
  if (!def) return null;
  return buildTransmission(def, timestamp);
}

// ---------------------------------------------------------------------------
// Main update
// ---------------------------------------------------------------------------

export interface MissionSystemResult {
  newState: MissionState;
  newTransmissions: RadioTransmission[];
  /** Stockpile grants to apply to the settlement (from missions completed this tick). */
  rewards?: Record<string, number>;
  /** Narrative flags set this tick (merge into flags). */
  newFlags?: Record<string, string | number | boolean>;
}

function nowStr(clock: GameClockState): string {
  return `DAY ${String(clock.day).padStart(2, '0')} — ${String(clock.hour).padStart(2, '0')}:${String(clock.minute || 0).padStart(2, '0')}:00`;
}

function missionCanTrigger(def: MissionDefinition, state: MissionState, day: number): boolean {
  if (state.pendingMissions.some((m) => m.definitionId === def.id)) return false;
  if (state.activeMissions.some((m) => m.definitionId === def.id)) return false;
  if (def.repeatable) {
    const cd = state.repeatableCooldowns[def.id];
    if (cd !== undefined && day < cd) return false;
  } else {
    if (state.startedMissionIds.includes(def.id)) return false;
    if (state.completedMissionIds.includes(def.id)) return false;
    if (state.failedMissionIds.includes(def.id)) return false;
    if (state.declinedMissionIds.includes(def.id)) return false;
    if (state.expiredMissionIds.includes(def.id)) return false;
    if ((state.triggeredEventIds || []).some((t) => t.endsWith(`|${def.id}`))) return false;
  }
  if (def.mutuallyExclusiveWith?.some((other) => state.activeMissions.some((m) => m.definitionId === other) || state.pendingMissions.some((m) => m.definitionId === other))) {
    return false;
  }
  return true;
}

function prerequisitesMet(
  def: MissionDefinition,
  settlement: SettlementState,
  clock: GameClockState,
  ctx: MissionContext,
  flags: Record<string, string | number | boolean>,
  relations: Record<string, number> = {},
  state?: MissionState
): boolean {
  if (def.requiresMissionsCompleted && def.requiresMissionsCompleted.length > 0) {
    const completedSet = new Set(state?.completedMissionIds || []);
    if (!def.requiresMissionsCompleted.every((id) => completedSet.has(id))) {
      return false;
    }
  }
  if (!def.prerequisites || def.prerequisites.length === 0) return true;
  return def.prerequisites.every((c) =>
    evaluateMissionCondition(c, settlement, clock, ctx, flags, relations, state)
  );
}

function missionIsReady(
  def: MissionDefinition,
  settlement: SettlementState,
  clock: GameClockState,
  ctx: MissionContext,
  flags: Record<string, string | number | boolean>,
  events: Set<string>,
  relations: Record<string, number> = {},
  state?: MissionState
): boolean {
  return evaluateMissionTrigger(def.trigger, settlement, clock, ctx, flags, events, relations, state);
}

export function updateMissionSystem(
  state: MissionState,
  settlement: SettlementState,
  clock: GameClockState,
  ctx: MissionContext = {}
): MissionSystemResult {
  const ts = nowStr(clock);
  let newState: MissionState = {
    ...state,
    activeMissions: [...state.activeMissions],
    pendingMissions: [...state.pendingMissions],
    contactedFactionIds: [...(state.contactedFactionIds || [])],
  };
  const newTransmissions: RadioTransmission[] = [];
  const newFlags: Record<string, string | number | boolean> = {};

  // 1. Snapshot + derived events (safety net & offline recovery).
  const nextSnapshot = buildSnapshot(settlement, clock, ctx);
  const derivedEvents = state.lastSeen ? deriveEvents(state.lastSeen, nextSnapshot) : [];
  newState = { ...newState, lastSeen: nextSnapshot };

  // 2. Consume domain events from the journal.
  const journalEvents = readGameEventsSince(state.lastProcessedEventId ?? 0);
  const maxJournalId = journalEvents.length > 0
    ? Math.max(...journalEvents.map((e) => e.id))
    : (state.lastProcessedEventId ?? 0);
  newState.lastProcessedEventId = maxJournalId;

  // Track faction contacts from domain events
  for (const e of journalEvents) {
    if (e.type === 'FACTION_CONTACTED' && (e.payload as any)?.factionId) {
      const fId = (e.payload as any).factionId;
      if (!newState.contactedFactionIds.includes(fId)) {
        newState.contactedFactionIds = [...newState.contactedFactionIds, fId];
      }
    }
  }

  // 3. Combined event set for trigger checking.
  const eventsSet = new Set<string>([
    ...derivedEvents,
    ...journalEvents.map((e) => e.type),
  ]);

  // Track bound targets across active & pending missions to avoid double-binding.
  const usedTargetIds = new Set<string | number>();
  for (const m of newState.activeMissions) {
    for (const t of m.tasks) {
      if (t.boundTargetId !== undefined) usedTargetIds.add(t.boundTargetId);
    }
  }

  // 4. Trigger scanning — queue briefing transmissions, never missions directly.
  for (const def of getRegisteredMissionDefinitions()) {
    if (!missionCanTrigger(def, newState, clock.day)) continue;
    if (!prerequisitesMet(def, settlement, clock, ctx, newState.narrativeFlags, newState.factionRelations, newState)) continue;
    if (!missionIsReady(def, settlement, clock, ctx, newState.narrativeFlags, eventsSet, newState.factionRelations, newState)) continue;

    // Check target bindability BEFORE marking trigger as consumed
    if (!missionTargetsBindable(def, settlement, ctx, usedTargetIds)) continue;

    const briefing = buildMissionBriefing(def, ts);
    if (!briefing) continue;

    // P0 FIX: Record trigger dedupe key ONLY AFTER targets are confirmed bindable
    // and the briefing transmission is successfully generated.
    const triggerKey = def.trigger.type === 'event' ? `${def.trigger.event}|${def.id}` : `condition|${def.id}`;
    if (!newState.triggeredEventIds.includes(triggerKey)) {
      newState = { ...newState, triggeredEventIds: [...newState.triggeredEventIds, triggerKey] };
    }

    newTransmissions.push(briefing);
    newState = {
      ...newState,
      pendingMissions: [
        ...newState.pendingMissions,
        {
          id: `${def.id}_p`,
          definitionId: def.id,
          status: 'pending',
          startedDay: clock.day,
          startedGameHours: totalGameHours(clock),
          tasks: [],
          completionTransmissionSent: false,
          failureTransmissionSent: false,
        },
      ],
    };
    if (def.repeatable && def.repeatCooldownDays) {
      newState = {
        ...newState,
        repeatableCooldowns: { ...newState.repeatableCooldowns, [def.id]: clock.day + def.repeatCooldownDays },
      };
    }
  }

  // 5. Evaluate active missions.
  const rewardsAcc: Record<string, number> = {};
  const completionFactionEffects: FactionEffect[] = [];
  const updatedActive: MissionRuntimeState[] = [];
  const newlyCompleted: string[] = [];
  const newlyFailed: string[] = [];
  const newlyExpired: string[] = [];

  for (const mission of newState.activeMissions) {
    const def = findMissionDefinition(mission.definitionId);
    if (!def) {
      updatedActive.push(mission);
      continue;
    }

    // Time limit expiry.
    const elapsed = totalGameHours(clock) - mission.startedGameHours;
    if (def.timeLimitHours && elapsed > def.timeLimitHours && mission.status === 'active') {
      newlyExpired.push(mission.definitionId);
      const failTx = buildFollowUp(def.failureTransmissionId, ts);
      if (failTx) newTransmissions.push(failTx);
      continue;
    }

    // Failure conditions.
    if (def.failureConditions && def.failureConditions.some((c) =>
      evaluateMissionCondition(c, settlement, clock, ctx, newState.narrativeFlags, newState.factionRelations, newState))) {
      newlyFailed.push(mission.definitionId);
      if (!mission.failureTransmissionSent && def.failureTransmissionId) {
        const failTx = buildFollowUp(def.failureTransmissionId, ts);
        if (failTx) newTransmissions.push(failTx);
      }
      continue;
    }

    // Evaluate tasks respecting sequential dependencies.
    let allDone = true;
    const completedTaskIds = new Set<string>(
      mission.tasks.filter((t) => t.status === 'completed').map((t) => t.id)
    );
    const evaluatedTasks: MissionTaskState[] = [];

    for (const task of mission.tasks) {
      if (task.status === 'completed') {
        evaluatedTasks.push(task);
        continue;
      }

      // Sequential task dependencies check
      if (task.dependsOn && task.dependsOn.length > 0) {
        const prereqsMet = task.dependsOn.every((depId) => completedTaskIds.has(depId));
        if (!prereqsMet) {
          allDone = false;
          evaluatedTasks.push({ ...task, status: 'pending' as TaskStatus });
          continue;
        }
      }

      // Read domain events since task activation
      const eventsForTask = readGameEventsSince(task.startEventId ?? 0);
      const evalResult = evaluateTask(task, settlement, clock, ctx, eventsForTask, newState);
      const status: TaskStatus = evalResult.complete ? 'completed' : 'active';
      if (evalResult.complete) {
        completedTaskIds.add(task.id);
      } else {
        allDone = false;
      }
      evaluatedTasks.push({ ...task, status, current: evalResult.current, nightWitnessed: task.nightWitnessed });
    }

    if (allDone && mission.tasks.length > 0) {
      newlyCompleted.push(mission.definitionId);
      if (def.rewards?.resources) {
        for (const [k, v] of Object.entries(def.rewards.resources)) {
          rewardsAcc[k] = (rewardsAcc[k] || 0) + v;
        }
      }
      if (def.rewards?.narrativeFlags) {
        Object.assign(newFlags, def.rewards.narrativeFlags);
      }
      if (def.rewards?.factionEffects && def.rewards.factionEffects.length > 0) {
        completionFactionEffects.push(...def.rewards.factionEffects);
      }
      if (!mission.completionTransmissionSent && def.completionTransmissionId) {
        const doneTx = buildFollowUp(def.completionTransmissionId, ts);
        if (doneTx) newTransmissions.push(doneTx);
      }
    } else {
      updatedActive.push({ ...mission, tasks: evaluatedTasks, status: 'active' });
    }
  }

  // Apply status transitions to the state.
  const stillActive = updatedActive.filter((m) =>
    !newlyCompleted.includes(m.definitionId) &&
    !newlyFailed.includes(m.definitionId) &&
    !newlyExpired.includes(m.definitionId)
  );

  newState = {
    ...newState,
    activeMissions: stillActive,
    completedMissionIds: [...newState.completedMissionIds, ...newlyCompleted],
    failedMissionIds: [...newState.failedMissionIds, ...newlyFailed, ...newlyExpired],
    expiredMissionIds: [...newState.expiredMissionIds, ...newlyExpired],
  };

  // Reward narrative flags are immediately available to later triggers.
  if (Object.keys(newFlags).length > 0) {
    newState = { ...newState, narrativeFlags: { ...newState.narrativeFlags, ...newFlags } };
  }

  // Completion faction rewards.
  if (completionFactionEffects.length > 0) {
    const fx = applyFactionEffects(newState.factionRelations, completionFactionEffects, newState.narrativeFlags, ts);
    newState = {
      ...newState,
      factionRelations: fx.relations,
      narrativeFlags: fx.flags,
    };
    newTransmissions.push(...fx.transmissions);
  }

  return {
    newState,
    newTransmissions,
    rewards: Object.keys(rewardsAcc).length > 0 ? rewardsAcc : undefined,
    newFlags: Object.keys(newFlags).length > 0 ? newFlags : undefined,
  };
}

// ---------------------------------------------------------------------------
// Player response handling (TRANSMISSION → MISSION)
// ---------------------------------------------------------------------------

export interface ResponseResult {
  newState: MissionState;
  newTransmissions: RadioTransmission[];
  success: boolean;
  error?: string;
}

/**
 * Called when the player acknowledges a briefing transmission and picks a
 * response option. Only here is a mission actually created — never by the
 * simulation tick.
 *
 * P0 FIX: Strictly validates that the transmission, definition, pending mission,
 * and selected response option exist and are valid. Invalid input produces no
 * state mutation, no missions, no flags, and returns an error result.
 */
export function handleTransmissionResponse(
  state: MissionState,
  tx: RadioTransmission,
  responseAction: string,
  settlement: SettlementState,
  clock: GameClockState,
  ctx: MissionContext = {}
): ResponseResult {
  const ts = nowStr(clock);

  // 1. Validate transmission input
  if (!tx || !tx.id || !tx.missionId) {
    return { newState: state, newTransmissions: [], success: false, error: 'Transmission or missionId is missing' };
  }

  // 2. Validate transmission has not already been processed
  if (state.processedTransmissionIds.includes(tx.id)) {
    return { newState: state, newTransmissions: [], success: false, error: `Transmission ${tx.id} has already been processed` };
  }

  // 3. Validate mission definition
  const def = findMissionDefinition(tx.missionId);
  if (!def) {
    return { newState: state, newTransmissions: [], success: false, error: `Mission definition ${tx.missionId} not found` };
  }

  // 4. Validate pending mission exists
  const pendingIdx = state.pendingMissions.findIndex((m) => m.definitionId === def.id);
  const pending = pendingIdx >= 0 ? state.pendingMissions[pendingIdx] : null;
  if (!pending) {
    return { newState: state, newTransmissions: [], success: false, error: `No pending mission found for ${def.id}` };
  }

  // 5. Validate response action
  if (!responseAction || typeof responseAction !== 'string') {
    return { newState: state, newTransmissions: [], success: false, error: 'Missing response action' };
  }

  // Find the exact matching response option from the definition
  let chosen: MissionResponseOption | undefined;
  if (responseAction === 'accept') {
    chosen = def.responseOptions.find((o) => o.action === 'accept');
  } else if (responseAction === 'decline') {
    chosen = def.responseOptions.find((o) => o.action === 'decline');
    if (!chosen) {
      chosen = { label: 'Decline', action: 'decline' };
    }
  } else if (responseAction.startsWith('branch:')) {
    const branchId = responseAction.slice('branch:'.length);
    chosen = def.responseOptions.find((o) => o.action === 'branch' && o.missionId === branchId);
  }

  // If no response option matches, reject immediately! No state mutation.
  if (!chosen) {
    return {
      newState: state,
      newTransmissions: [],
      success: false,
      error: `Invalid response action "${responseAction}" for mission ${def.id}`,
    };
  }

  let newState: MissionState = {
    ...state,
    activeMissions: [...state.activeMissions],
    pendingMissions: [...state.pendingMissions],
    contactedFactionIds: [...(state.contactedFactionIds || [])],
  };
  const newTransmissions: RadioTransmission[] = [];

  // Apply narrative flag
  if (chosen.flag) {
    newState = { ...newState, narrativeFlags: { ...newState.narrativeFlags, [chosen.flag.key]: chosen.flag.value } };
  }

  // Queue option follow-up transmission
  if (chosen.followUpTransmissionId) {
    const fu = buildFollowUp(chosen.followUpTransmissionId, ts);
    if (fu) newTransmissions.push(fu);
  }

  // Apply persistent faction consequences
  if (chosen.factionEffects && chosen.factionEffects.length > 0) {
    const fx = applyFactionEffects(newState.factionRelations, chosen.factionEffects, newState.narrativeFlags, ts);
    newState = {
      ...newState,
      factionRelations: fx.relations,
      narrativeFlags: fx.flags,
    };
    newTransmissions.push(...fx.transmissions);
  }

  if (chosen.contactFactionId) {
    const existing = newState.contactedFactionIds || [];
    if (!existing.includes(chosen.contactFactionId)) {
      newState = {
        ...newState,
        contactedFactionIds: [...existing, chosen.contactFactionId],
      };
    }
    emitGameEvent('FACTION_CONTACTED', {
      factionId: chosen.contactFactionId,
      settlementId: (settlement as any).id || (settlement.primaryHQId ? String(settlement.primaryHQId) : 'settlement_primary'),
    });
  }

  const removePending = newState.pendingMissions.filter((_, i) => i !== pendingIdx);
  const processed = [...newState.processedTransmissionIds, tx.id];

  // Handle DECLINE
  if (chosen.action === 'decline') {
    newState = {
      ...newState,
      pendingMissions: removePending,
      declinedMissionIds: [...newState.declinedMissionIds, def.id],
      processedTransmissionIds: processed,
    };
    return { newState, newTransmissions, success: true };
  }

  // Handle ACCEPT or BRANCH
  const targetDef = chosen.action === 'branch' && chosen.missionId
    ? findMissionDefinition(chosen.missionId)
    : def;

  if (!targetDef) {
    return {
      newState: state,
      newTransmissions: [],
      success: false,
      error: `Target mission definition not found for branch`,
    };
  }

  const startedGameHours = totalGameHours(clock);
  const latestEventId = getLatestEventId();
  const tasks = bindMissionTasks(targetDef, settlement, ctx, newState.activeMissions);

  // Initialize task baseline anchors and event sequence cursors
  for (const t of tasks) {
    t.startEventId = latestEventId;
    if (t.type === 'eliminate_infected') {
      t.startProgressBaseline = settlement.lifetimeStats?.infectedKills ?? 0;
      (t as any)._startInfectedKills = t.startProgressBaseline;
    } else if (t.type === 'survive_duration') {
      t.startProgressBaseline = startedGameHours;
      (t as any)._startGameHours = startedGameHours;
    } else if (t.type === 'survive_night') {
      t.nightWitnessed = clock.isNight || clock.phase === 'night';
    } else if (t.type === 'recruit_survivors') {
      t.startProgressBaseline = settlement.lifetimeStats?.survivorsRecruited ?? 0;
      (t as any)._startRecruitedGroups = hiddenGroupsList(settlement).filter((g) => g.isRecruited).length;
    } else if (t.type === 'manufacture_item') {
      // Anchor to the cumulative production tally, NOT the stockpile: tools
      // produced (or crates sealed) days before acceptance must not count, and
      // neither may tools merely held or scavenged before/after the mission.
      t.startProgressBaseline = settlement.lifetimeStats?.itemsProduced?.[t.resourceType || ''] ?? 0;
    } else if (t.type === 'scavenge_resource') {
      t.startProgressBaseline = readResource(settlement, t.resourceType || '');
    } else if (t.type === 'scavenge_building') {
      t.startProgressBaseline = countSearched(settlement);
    } else if (t.type === 'deliver_resources') {
      (t as any)._startDay = clock.day;
    }
  }

  const activeMission: MissionRuntimeState = {
    id: `${targetDef.id}_a`,
    definitionId: targetDef.id,
    status: 'active',
    startedDay: clock.day,
    startedGameHours,
    tasks,
    completionTransmissionSent: false,
    failureTransmissionSent: false,
  };

  newState = {
    ...newState,
    pendingMissions: removePending,
    activeMissions: [...newState.activeMissions, activeMission],
    startedMissionIds: [...newState.startedMissionIds, targetDef.id],
    processedTransmissionIds: processed,
  };

  if (chosen.action === 'branch' && chosen.followUpTransmissionId) {
    const fu = buildFollowUp(chosen.followUpTransmissionId, ts);
    if (fu) newTransmissions.push(fu);
  }

  return { newState, newTransmissions, success: true };
}

// ---------------------------------------------------------------------------
// Save/load helpers
// ---------------------------------------------------------------------------

/** Rebuild the world snapshot after load so the next tick fires no false events. */
export function reconcileMissionSnapshot(
  state: MissionState,
  settlement: SettlementState,
  clock: GameClockState,
  ctx: MissionContext = {}
): MissionState {
  return { ...state, lastSeen: buildSnapshot(settlement, clock, ctx) };
}

/** Enqueue a transmission into a radio state (convenience re-export). */
export function pushTransmissionToRadio(radioState: any, tx: RadioTransmission): any {
  return enqueueTransmission(radioState, tx);
}

// Keep the bundler honest about unused import types.
export type { RadioTransmission, TransmissionDefinition } from '../types/radioDirective';