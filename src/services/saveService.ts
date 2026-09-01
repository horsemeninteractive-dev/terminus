import { SaveGameData, SaveGameMeta } from '../types/saveGame';
import { SettlementState } from '../types/settlement';
import { SettlementRecord } from '../types/caravan';

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
    infections: mapToEntries(state.infections),
    outbreaks: mapToEntries(state.outbreaks),
    zombieLairs: mapToEntries(state.zombieLairs),
    rivalHideouts: mapToEntries(state.rivalHideouts),
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

  return {
    ...data,
    generalPopulation: { ...generalPopulation, children },
    squads,
    adaptedBuildings: toMap(data.adaptedBuildings),
    infections: toMap(data.infections),
    outbreaks: toMap(data.outbreaks),
    zombieLairs: toMap(data.zombieLairs),
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
      hasHQ: !!currentSettlement.hq,
    };

    const fullSaveData: SaveGameData = {
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
      const parsed: SaveGameData = JSON.parse(raw);

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
      const data: SaveGameData = JSON.parse(jsonStr);
      if (!data.meta || !data.statePayload) throw new Error('Invalid save game format');

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
