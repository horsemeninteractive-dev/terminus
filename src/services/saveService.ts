import { CURRENT_SAVE_VERSION, SaveGameData, SaveGameMeta } from '../types/saveGame';
import { SettlementState } from '../types/settlement';
import { SettlementRecord } from '../types/caravan';
import { getPrimaryHQ } from './buildingOperational';
import { getDefaultLawsState } from './lawService';
import { createEmptyExpeditionState } from '../types/expedition';
import { createEmptyOccupationState } from '../types/occupation';
import { createEmptyWaterState } from '../types/water';
import { createEmptyPowerState } from '../types/power';
import { createEmptyTrainingState } from '../types/training';

const SAVE_STORAGE_KEY_PREFIX = 'terminus_ifz_save_';
const SAVE_INDEX_KEY = 'terminus_ifz_save_index';

function mapToEntries(map: any): any[] {
  if (!map) return [];
  if (map instanceof Map) return Array.from(map.entries());
  if (Array.isArray(map)) return map;
  if (typeof map === 'object') return Object.entries(map);
  return [];
}

export function toMap<K = any, V = any>(val: any): Map<K, V> {
  if (!val) return new Map<K, V>();
  if (val instanceof Map) return val;
  if (Array.isArray(val)) return new Map<K, V>(val);
  if (typeof val === 'object') return new Map<K, V>(Object.entries(val) as any);
  return new Map<K, V>();
}

// Helper to convert SettlementState Maps to JSON-safe arrays
export function serializeSettlementState(state: SettlementState): any {
  if (!state) return null;
  return {
    ...state,
    adaptedBuildings: mapToEntries(state.adaptedBuildings),
    buildingSections: mapToEntries(state.buildingSections),
    infections: mapToEntries(state.infections),
    outbreaks: mapToEntries(state.outbreaks),
    zombieLairs: mapToEntries(state.zombieLairs),
    rivalHideouts: mapToEntries(state.rivalHideouts),
    occupiedBuildings: state.occupiedBuildings
      ? { ...state.occupiedBuildings, buildings: mapToEntries(state.occupiedBuildings.buildings) }
      : undefined,
    waterState: state.waterState
      ? { ...state.waterState, cisterns: mapToEntries(state.waterState.cisterns) }
      : undefined,
    powerState: state.powerState
      ? {
          ...state.powerState,
          generators: mapToEntries(state.powerState.generators),
          batteries: mapToEntries(state.powerState.batteries),
        }
      : undefined,
    trainingState: state.trainingState
      ? { ...state.trainingState, sessions: mapToEntries(state.trainingState.sessions) }
      : undefined,
    // §IFZ Repairmen Shop band control (absent = every band enabled on load).
    automatedRepairConfig: state.automatedRepairConfig || undefined,
    buildingSearches: mapToEntries(state.buildingSearches),
    hiddenGroups: mapToEntries(state.hiddenGroups),
    deconstructionJobs: mapToEntries(state.deconstructionJobs),
    demolishedBuildings: mapToEntries(state.demolishedBuildings),
    searchedBuildings: mapToEntries(state.searchedBuildings),
  };
}

// Helper to restore JSON arrays back to Map instances
export function deserializeSettlementState(data: any): SettlementState {
  if (!data) return data;
  const squads = (data.squads || []).map((s: any) => {
    const { mission, ...clean } = s;
    return { ...clean, status: clean.status === 'scouting' || clean.status === 'expedition' ? 'idle' : clean.status };
  });
  const generalPopulation = data.generalPopulation || {};
  const children = Array.isArray(generalPopulation.children)
    ? generalPopulation.children
    : [];

  const stockpile = data.stockpile ? { ...data.stockpile } : undefined;
  if (stockpile?.materials) {
    // Older saves seeded materials without a tools key. Normalize so the
    // required tools field is always present, and `canAffordCost` / production
    // never see `undefined >= 0` or drop the field on the next write.
    stockpile.materials = {
      tools: 20,
      ...stockpile.materials,
    };
  }

  // ------------- HQ migration (§7.5) -------------
  // The old model kept a single authoritative `hq` record while extra HQs
  // lived in `headquarters[]`. The authoritative collection is now
  // `headquarters[]` + `primaryHQId`. Migrate single-HQ saves forward, and
  // backfill structural integrity for saves predating HQ durability. The
  // legacy `hq` key is stripped so the two representations never coexist.
  const legacyHq: any = data.hq;
  // `fieldLootUnits` was renamed to `overflowLootUnits` (the goods are held by
  // carriers, not lying at scavenge sites). Alias old saves and strip the key.
  const { hq: _legacyHqKey, fieldLootUnits: _legacyOverflow, ...dataWithoutLegacy } = data;
  const rawHeadquarters: any[] = Array.isArray(data.headquarters) ? data.headquarters : [];
  const backfillDurability = (hq: any) => {
    if (!hq || typeof hq.currentDurability === 'number') return hq;
    const backfill = Math.max(650, Math.round(600 + (hq.footprintAreaM2 || 120) * 0.5 + (hq.levels || 1) * 120));
    return { ...hq, maxDurability: backfill, currentDurability: backfill };
  };
  const headquarters = rawHeadquarters.map(backfillDurability);
  let primaryHQId: string | number | null = data.primaryHQId ?? null;
  if (legacyHq) {
    const migrated = backfillDurability(legacyHq);
    if (!headquarters.some((h) => h && String(h.buildingId) === String(migrated.buildingId))) {
      headquarters.unshift(migrated);
    }
    if (primaryHQId == null) primaryHQId = migrated.buildingId;
  }

  // ------------- Research → Scientific Materials migration (§10) -------------
  // Research was formerly a separate green-book currency (`researchPoints`)
  // accrued by a passive trickle (`passiveRatePerSec`). The authoritative model
  // has staffed Research Centers produce Scientific Materials into the stockpile
  // and research projects consume them. Fold any unspent legacy points into the
  // stockpile bucket and drop the old currency keys so they never re-serialize.
  let research = dataWithoutLegacy.research;
  if (
    research &&
    (typeof research.researchPoints === 'number' || typeof research.passiveRatePerSec === 'number')
  ) {
    const leftover = Math.max(0, Math.floor(research.researchPoints || 0));
    const { researchPoints: _legacyRP, passiveRatePerSec: _legacyPR, ...cleanResearch } = research;
    research = cleanResearch;
    if (leftover > 0 && stockpile?.materials) {
      stockpile.materials = {
        ...stockpile.materials,
        scientific_materials: (stockpile.materials.scientific_materials || 0) + leftover,
      };
    }
  }

  // ------------- Zombie Lair rebuild migration (§5.2) -------------
  // Lairs were formerly abstract head-counters (occupantCount /
  // spawnIntervalSec / lastSpawnAt) with no link to actual ZombieUnits. The
  // rebuilt model syncs `population` from real affiliated infected. Convert
  // legacy records to the new lifecycle fields so old saves keep standing
  // lairs (no NaN intervals, no immortal inert records); the population
  // re-syncs to whatever affiliated units exist on the next tick.
  const zombieLairs = toMap<string | number, any>(data.zombieLairs);
  for (const lair of zombieLairs.values()) {
    const legacy = lair as any;
    // `maxPopulation` (the short-lived regrowth-cap era) and the original
    // abstract `initialOccupantCount`/`occupantCount` all become the soft
    // founding baseline: baselinePopulation. Only the founding strength is a
    // meaningful number — a neglected nest may now swell beyond it.
    if (typeof lair.baselinePopulation !== 'number') {
      lair.baselinePopulation =
        typeof legacy.maxPopulation === 'number'
          ? legacy.maxPopulation
          : legacy.initialOccupantCount ?? legacy.occupantCount ?? 0;
    }
    delete lair.maxPopulation;
    if (typeof lair.population !== 'number') {
      lair.population = legacy.occupantCount ?? 0;
      lair.homeRadius = typeof legacy.homeRadius === 'number' ? legacy.homeRadius : 40;
      lair.threatTier = lair.threatTier ?? 'medium';
      lair.escalationAccumSec = typeof lair.escalationAccumSec === 'number' ? lair.escalationAccumSec : 0;
      lair.replenishAccumSec = typeof lair.replenishAccumSec === 'number' ? lair.replenishAccumSec : 0;
      lair.hordeAccumSec = typeof lair.hordeAccumSec === 'number' ? lair.hordeAccumSec : 0;
      lair.lastActivity = typeof lair.lastActivity === 'number' ? lair.lastActivity : Date.now();
    }
  }

  return {
    ...dataWithoutLegacy,
    research,
    headquarters,
    primaryHQId,
    overflowLootUnits: data.overflowLootUnits ?? _legacyOverflow ?? 0,
    fieldLootPiles: data.fieldLootPiles || [],
    stockpile,
    generalPopulation: { ...generalPopulation, children },
    laws: data.laws || getDefaultLawsState(),
    expeditions: data.expeditions || createEmptyExpeditionState(),
    occupiedBuildings: data.occupiedBuildings
      ? { ...data.occupiedBuildings, buildings: toMap(data.occupiedBuildings.buildings) }
      : createEmptyOccupationState(),
    waterState: data.waterState
      ? { ...data.waterState, cisterns: toMap(data.waterState.cisterns) }
      : createEmptyWaterState(),
    automatedRepairConfig: data.automatedRepairConfig || undefined,
    powerState: data.powerState
      ? {
          ...data.powerState,
          generators: toMap(data.powerState.generators),
          batteries: toMap(data.powerState.batteries || []),
        }
      : createEmptyPowerState(),
    trainingState: data.trainingState
      ? { ...data.trainingState, sessions: toMap(data.trainingState.sessions) }
      : createEmptyTrainingState(),
    squads,
    adaptedBuildings: toMap(data.adaptedBuildings),
    buildingSections: toMap(data.buildingSections),
    infections: toMap(data.infections),
    outbreaks: toMap(data.outbreaks),
    zombieLairs,
    rivalHideouts: toMap(data.rivalHideouts),
    buildingSearches: toMap(data.buildingSearches),
    hiddenGroups: toMap(data.hiddenGroups),
    deconstructionJobs: toMap(data.deconstructionJobs),
    demolishedBuildings: toMap(data.demolishedBuildings),
    searchedBuildings: toMap(data.searchedBuildings),
    squadInventories: data.squadInventories || {},
    resourceWorkOrders: data.resourceWorkOrders || [],
  };
}

// Serialize settlements dictionary
export function serializeSettlementsDict(settlements: Record<string, SettlementRecord>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [id, record] of Object.entries(settlements)) {
    result[id] = {
      ...record,
      state: serializeSettlementState(record.state),
    };
  }
  return result;
}

// Deserialize settlements dictionary
export function deserializeSettlementsDict(data: Record<string, any>): Record<string, SettlementRecord> {
  const result: Record<string, SettlementRecord> = {};
  for (const [id, record] of Object.entries(data || {})) {
    result[id] = {
      ...record,
      state: deserializeSettlementState(record.state),
    };
  }
  return result;
}

function migrateSaveData(raw: any): SaveGameData {
  if (!raw || typeof raw !== 'object' || !raw.meta || !raw.statePayload) {
    throw new Error('Invalid save game format');
  }

  const version = typeof raw.saveVersion === 'number' ? raw.saveVersion : 1;
  if (version > CURRENT_SAVE_VERSION) {
    throw new Error(`Save requires a newer game version (save v${version}, supported v${CURRENT_SAVE_VERSION}).`);
  }

  let migrated = { ...raw, statePayload: { ...raw.statePayload } };
  // v1 saves predate persisted scavenge queues. Treat them as empty rather than
  // making the rest of the load path branch on optional legacy data.
  if (version < 2) {
    migrated.statePayload.scavengeQueue = migrated.statePayload.scavengeQueue || {};
  }

  return {
    ...migrated,
    saveVersion: CURRENT_SAVE_VERSION,
    statePayload: {
      ...migrated.statePayload,
      caravans: migrated.statePayload.caravans || [],
      settlements: migrated.statePayload.settlements || {},
      hasCompletedFirstScavenge: migrated.statePayload.hasCompletedFirstScavenge ?? true,
    },
  } as SaveGameData;
}

export class SaveGameService {
  /**
   * Get list of all save games metadata
   */
  public listSaves(): SaveGameMeta[] {
    try {
      const indexRaw = localStorage.getItem(SAVE_INDEX_KEY);
      if (!indexRaw) return [];
      const metas: SaveGameMeta[] = JSON.parse(indexRaw);
      return metas.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      console.warn('Failed to read save index from localStorage:', e);
      return [];
    }
  }

  /**
   * Check if any save files exist
   */
  public hasSaves(): boolean {
    return this.listSaves().length > 0;
  }

  /**
   * Get the most recent save game metadata
   */
  public getLatestSave(): SaveGameMeta | null {
    const list = this.listSaves();
    return list.length > 0 ? list[0] : null;
  }

  /**
   * Save a full game session
   */
  public saveGame(
    name: string,
    type: 'manual' | 'autosave' | 'quicksave',
    payload: {
      settlements: Record<string, SettlementRecord>;
      activeSettlementId: string;
      settlement: SettlementState;
      gameClock: any;
      activePlacement: any;
      currentPreset: any;
      mapData: any;
      caravans: any[];
      radioState?: any;
      tutorialStep?: string;
      hasCompletedFirstScavenge?: boolean;
      combatSquads?: any[];
      scavengeQueue?: Record<string, Array<string | number>>;
      zombies?: any[];
      worldVehicles?: any[];
      dangerLevel?: number;
      timeOfDay?: string;
      satelliteOverlay?: boolean;
      satelliteQuality?: import('../types/saveGame').SatelliteQuality;
      scenarioSettings?: any;
    },
    saveIdToOverwrite?: string
  ): SaveGameMeta {
    const id = saveIdToOverwrite || `save_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const formattedDate = now.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const currentSettlement = payload.settlement;
    const foodTotal =
      (currentSettlement.stockpile?.food?.canned_goods || 0) +
      (currentSettlement.stockpile?.food?.mre_rations || 0) +
      (currentSettlement.stockpile?.food?.dried_rations || 0) +
      (currentSettlement.stockpile?.food?.fresh_harvest || 0);

    const survivorCount =
      (currentSettlement.namedSurvivors?.length || 0) +
      (typeof currentSettlement.generalPopulation === 'number'
        ? currentSettlement.generalPopulation
        : currentSettlement.generalPopulation?.total || 0);

    const meta: SaveGameMeta = {
      id,
      name: name.trim() || (type === 'autosave' ? `Autosave - Day ${payload.gameClock?.day || 1}` : `Manual Save - ${formattedDate}`),
      type,
      timestamp: Date.now(),
      formattedDate,
      colonyName: currentSettlement.name || 'Outpost Alpha',
      sectorName: payload.activePlacement?.sectorName || payload.currentPreset?.name || 'Sector',
      country: payload.activePlacement?.country || payload.currentPreset?.country || 'Earth',
      day: payload.gameClock?.day || 1,
      hour: payload.gameClock?.hour || 8,
      minute: payload.gameClock?.minute || 0,
      survivorCount,
      squadCount: currentSettlement.squads?.length || 0,
      foodCount: foodTotal,
      morale: currentSettlement.morale?.overallScore ?? 75,
      season: currentSettlement.weather?.currentSeason || 'spring',
      weather: currentSettlement.weather?.currentWeather || 'clear',
      difficulty: payload.scenarioSettings?.difficulty || 'normal',
      hasHQ: Boolean(getPrimaryHQ(currentSettlement)),
    };

    const fullSaveData: SaveGameData = {
      saveVersion: CURRENT_SAVE_VERSION,
      meta,
      scenario: payload.scenarioSettings || {
        difficulty: 'normal',
        colonyName: currentSettlement.name || 'Outpost Alpha',
        startingSeason: 'spring',
        startingSupplies: 'standard',
        zombieAggression: 'normal',
        startingPopulation: 8,
        tutorialEnabled: true,
      },
  statePayload: {
    settlements: serializeSettlementsDict(payload.settlements),
        activeSettlementId: payload.activeSettlementId,
        settlement: serializeSettlementState(payload.settlement),
        gameClock: payload.gameClock,
        activePlacement: payload.activePlacement,
        currentPreset: payload.currentPreset,
        mapData: payload.mapData,
        caravans: payload.caravans,
        radioState: payload.radioState,
        tutorialStep: payload.tutorialStep,
        hasCompletedFirstScavenge: payload.hasCompletedFirstScavenge ?? true,
        combatSquads: payload.combatSquads,
        scavengeQueue: payload.scavengeQueue,
        zombies: payload.zombies,
        worldVehicles: payload.worldVehicles,
        dangerLevel: payload.dangerLevel,
        timeOfDay: payload.timeOfDay,
        satelliteOverlay: payload.satelliteOverlay,
        satelliteQuality: payload.satelliteQuality,
      },
    };

    try {
      // Store save data
      localStorage.setItem(`${SAVE_STORAGE_KEY_PREFIX}${id}`, JSON.stringify(fullSaveData));

      // Update index
      const existingList = this.listSaves().filter((s) => s.id !== id);
      const updatedList = [meta, ...existingList];
      // Keep max 20 saves in index
      const pruned = updatedList.slice(0, 20);
      localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(pruned));
    } catch (e) {
      console.error('Failed to save game to localStorage:', e);
      throw new Error('Local storage limit exceeded or write error.');
    }

    return meta;
  }

  /**
   * Load a save game by ID
   */
  public loadGame(saveId: string): SaveGameData | null {
    try {
      const raw = localStorage.getItem(`${SAVE_STORAGE_KEY_PREFIX}${saveId}`);
      if (!raw) return null;
      const parsed = migrateSaveData(JSON.parse(raw));

      // Rehydrate statePayload
      if (parsed.statePayload) {
        parsed.statePayload.settlement = deserializeSettlementState(parsed.statePayload.settlement);
        parsed.statePayload.settlements = deserializeSettlementsDict(parsed.statePayload.settlements);
      }

      return parsed;
    } catch (e) {
      console.error(`Failed to load save ${saveId}:`, e);
      return null;
    }
  }

  /**
   * Delete a save game
   */
  public deleteSave(saveId: string): boolean {
    try {
      localStorage.removeItem(`${SAVE_STORAGE_KEY_PREFIX}${saveId}`);
      const existingList = this.listSaves().filter((s) => s.id !== saveId);
      localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(existingList));
      return true;
    } catch (e) {
      console.error(`Failed to delete save ${saveId}:`, e);
      return false;
    }
  }

  /**
   * Export save data as JSON string for download
   */
  public exportSaveJson(saveId: string): string | null {
    try {
      return localStorage.getItem(`${SAVE_STORAGE_KEY_PREFIX}${saveId}`);
    } catch {
      return null;
    }
  }

  /**
   * Import save data from JSON string
   */
  public importSaveJson(jsonStr: string): SaveGameMeta | null {
    try {
      const data = migrateSaveData(JSON.parse(jsonStr));

      const id = `import_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      data.meta.id = id;
      data.meta.name = `[Imported] ${data.meta.name}`;

      localStorage.setItem(`${SAVE_STORAGE_KEY_PREFIX}${id}`, JSON.stringify(data));

      const existingList = this.listSaves().filter((s) => s.id !== id);
      const updatedList = [data.meta, ...existingList].slice(0, 20);
      localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(updatedList));

      return data.meta;
    } catch (e) {
      console.error('Failed to import save:', e);
      return null;
    }
  }
}

export const saveService = new SaveGameService();
